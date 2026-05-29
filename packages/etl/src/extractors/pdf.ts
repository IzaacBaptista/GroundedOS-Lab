/**
 * PdfExtractor
 *
 * Handles the `"pdf"` modality. Accepts a local file path or remote URL,
 * extracts page text, and produces a `NormalizedDocument` whose sections map
 * one-to-one with PDF pages that contain extractable text.
 */

import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { basename } from "path";
import { PDFParse } from "pdf-parse";
import type {
  DocumentModality,
  DocumentSection,
  ExtractedImage,
  Extractor,
  ImageDescription,
  IngestionInput,
  NormalizedDocument,
  OCRResult,
} from "@groundedos/core";
import { buildMultimodalChunks } from "../multimodal/chunking";
import {
  ExtractedImageStore,
  ImageAssetRegistry,
  PdfImageExtractor,
  PdfPageRenderer,
} from "../multimodal/pdf-assets";
import { MockOCRProvider, type OCRProvider } from "../multimodal/providers/ocr";
import {
  MockVisionProvider,
  type ImageDescriptionProvider,
} from "../multimodal/providers/vision";

const EXTRACTOR_NAME = "pdf-extractor";
const EXTRACTOR_VERSION = "0.1.0";

export class PdfExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["pdf"];

  constructor(
    private readonly pdfImageExtractor: PdfImageExtractor = new PdfImageExtractor(),
    private readonly pageRenderer: PdfPageRenderer = new PdfPageRenderer(),
    private readonly imageStore: ExtractedImageStore = new ExtractedImageStore(),
    private readonly assetRegistry: ImageAssetRegistry = new ImageAssetRegistry(),
    private readonly ocrProvider: OCRProvider = new MockOCRProvider(),
    private readonly visionProvider: ImageDescriptionProvider = new MockVisionProvider()
  ) {}

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "pdf") {
      throw new Error(
        `[${EXTRACTOR_NAME}] Unsupported modality "${input.type}". PdfExtractor only handles "pdf".`
      );
    }

    const source = await this._resolveSource(input);
    const parser = new PDFParse(source.loadParams);

    try {
      const result = await parser.getText();
      const pageTexts = result.pages
        .map((page) => ({ page: page.num, text: page.text.trim() }))
        .filter((page) => page.text.length > 0);
      const documentId = this._resolveDocumentId(input);
      const { fullText, sections } = this._buildContent(pageTexts);
      const now = new Date().toISOString();
      const multimodalEnabled =
        Boolean(input.multimodal?.enableOCR) ||
        Boolean(input.multimodal?.enableImageDescription) ||
        Boolean(input.multimodal?.renderPdfPages);
      const multimodal = multimodalEnabled
        ? await this._extractMultimodal({
            input,
            documentId,
            pageCount: result.total,
            fallbackToRenderedPages:
              Boolean(input.multimodal?.renderPdfPages) || pageTexts.length === 0,
          })
        : undefined;
      const mergedSections = [...sections, ...(multimodal?.sections ?? [])];
      const mergedFullText = [fullText, ...(multimodal?.sections ?? []).map((section) => section.text)]
        .filter((value) => value.length > 0)
        .join("\n\n");

      return {
        documentId,
        title: this._resolveTitle(input),
        modality: "pdf",
        language:
          input.multimodal?.language ?? (input.metadata?.language as string | undefined),
        content: {
          fullText: mergedFullText,
          sections: mergedSections,
        },
        lineage: {
          sourceType: source.sourceType,
          originalFilename: source.originalFilename,
          mimeType: "application/pdf",
          checksum: source.checksum,
          extractedAt: now,
          extractor: EXTRACTOR_NAME,
          extractorVersion: EXTRACTOR_VERSION,
        },
        metadata: {
          ...(input.metadata ?? {}),
          pageCount: result.total,
          multimodal: multimodal
            ? {
                assets: multimodal.assets,
                extractedImages: multimodal.extractedImages,
                ocrResults: multimodal.ocrResults,
                imageDescriptions: multimodal.imageDescriptions,
                chunks: multimodal.chunks,
                traces: multimodal.traces,
              }
            : undefined,
        },
      };
    } finally {
      await parser.destroy();
    }
  }

  private async _resolveSource(input: IngestionInput): Promise<{
    loadParams: ConstructorParameters<typeof PDFParse>[0];
    sourceType: "upload" | "url";
    originalFilename?: string;
    checksum?: string;
  }> {
    if (input.filePath) {
      const buffer = await readFile(input.filePath);

      return {
        loadParams: { data: new Uint8Array(buffer) },
        sourceType: "upload",
        originalFilename: basename(input.filePath),
        checksum: createHash("sha256").update(buffer).digest("hex"),
      };
    }

    if (input.url) {
      return {
        loadParams: { url: input.url },
        sourceType: "url",
        originalFilename: this._filenameFromUrl(input.url),
      };
    }

    throw new Error(
      `[${EXTRACTOR_NAME}] Either 'filePath' or 'url' must be provided for modality "pdf".`
    );
  }

  private _buildContent(pages: Array<{ page: number; text: string }>): {
    fullText: string;
    sections: DocumentSection[];
  } {
    const sections: DocumentSection[] = [];
    let fullText = "";

    for (const page of pages) {
      const separator = fullText.length > 0 ? "\n\n" : "";
      const startOffset = fullText.length + separator.length;

      fullText += `${separator}${page.text}`;
      sections.push({
        id: `page-${page.page}`,
        heading: `Page ${page.page}`,
        text: page.text,
        page: page.page,
        startOffset,
        endOffset: startOffset + page.text.length,
      });
    }

    return { fullText, sections };
  }

  private _resolveTitle(input: IngestionInput): string {
    if (input.metadata?.title && typeof input.metadata.title === "string") {
      return input.metadata.title;
    }
    if (input.filePath) {
      return basename(input.filePath);
    }
    return this._filenameFromUrl(input.url) ?? "Untitled PDF";
  }

  private async _extractMultimodal(params: {
    input: IngestionInput;
    documentId: string;
    pageCount: number;
    fallbackToRenderedPages: boolean;
  }): Promise<{
    assets: ReturnType<ImageAssetRegistry["register"]>;
    extractedImages: ExtractedImage[];
    ocrResults: OCRResult[];
    imageDescriptions: ImageDescription[];
    chunks: ReturnType<typeof buildMultimodalChunks>;
    sections: DocumentSection[];
    traces: Record<string, unknown>;
  }> {
    const input = params.input;
    const extractionInput = {
      documentId: params.documentId,
      filePath: input.filePath ?? "remote.pdf",
      pageCount: params.pageCount,
      maxPages: input.multimodal?.maxPages,
    };

    const embedded = await this.pdfImageExtractor.extractEmbeddedImages(extractionInput);
    const rendered = params.fallbackToRenderedPages
      ? await this.pageRenderer.renderPages(extractionInput)
      : [];
    const maxImages = input.multimodal?.maxImages ?? Number.POSITIVE_INFINITY;
    const extractedImages = await this.imageStore.save(
      [...embedded, ...rendered].slice(0, maxImages)
    );
    const assets = this.assetRegistry.register(extractedImages);
    const ocrResults = input.multimodal?.enableOCR
      ? await Promise.all(extractedImages.map((image) => this.ocrProvider.recognize(image)))
      : [];
    const imageDescriptions = input.multimodal?.enableImageDescription
      ? await Promise.all(extractedImages.map((image) => this.visionProvider.describe(image)))
      : [];
    const chunks = buildMultimodalChunks({
      documentId: params.documentId,
      ocrResults,
      imageDescriptions,
    });
    const sections = this._buildMultimodalSections(ocrResults, imageDescriptions);

    return {
      assets,
      extractedImages,
      ocrResults,
      imageDescriptions,
      chunks,
      sections,
      traces: {
        multimodalExtractionTrace: {
          numberOfAssets: assets.length,
          fallbackUsed: params.fallbackToRenderedPages,
        },
        ocrTrace: {
          provider: this.ocrProvider.name,
          numberOfBlocks: ocrResults.reduce(
            (accumulator, current) => accumulator + (current.blocks?.length ?? 0),
            0
          ),
        },
        imageDescriptionTrace: {
          provider: this.visionProvider.name,
          numberOfAssets: imageDescriptions.length,
        },
        assetIndexingTrace: {
          numberOfAssets: assets.length,
        },
      },
    };
  }

  private _buildMultimodalSections(
    ocrResults: OCRResult[],
    descriptions: ImageDescription[]
  ): DocumentSection[] {
    const sections: DocumentSection[] = [];

    for (const result of ocrResults) {
      sections.push({
        id: `ocr-${result.assetId}`,
        heading: `OCR (page ${result.pageNumber ?? "?"})`,
        text: result.text,
        page: result.pageNumber,
      });
    }

    for (const description of descriptions) {
      sections.push({
        id: `image-description-${description.assetId}`,
        heading: "Image description",
        text: [description.shortCaption, description.detailedDescription]
          .filter(Boolean)
          .join("\n"),
      });
    }

    return sections;
  }

  private _resolveDocumentId(input: IngestionInput): string {
    if (input.metadata?.documentId && typeof input.metadata.documentId === "string") {
      return input.metadata.documentId;
    }
    return randomUUID();
  }

  private _filenameFromUrl(url?: string): string | undefined {
    if (!url) {
      return undefined;
    }

    try {
      const parsed = new URL(url);
      const name = basename(parsed.pathname);
      return name.length > 0 ? name : undefined;
    } catch {
      return undefined;
    }
  }
}
