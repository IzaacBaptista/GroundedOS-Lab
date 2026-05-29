/**
 * ImageExtractor
 *
 * Handles the `"image"` modality with multimodal processing support:
 * OCR + visual description generation.
 */

import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { basename } from "path";
import type {
  DocumentModality,
  Extractor,
  ExtractedImage,
  IngestionInput,
  ImageAsset,
  NormalizedDocument,
} from "@groundedos/core";
import { buildMultimodalChunks } from "../multimodal/chunking";
import { MockOCRProvider, type OCRProvider } from "../multimodal/providers/ocr";
import {
  MockVisionProvider,
  type ImageDescriptionProvider,
} from "../multimodal/providers/vision";

export class ImageExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["image"];

  constructor(
    private readonly ocrProvider: OCRProvider = new MockOCRProvider(),
    private readonly visionProvider: ImageDescriptionProvider = new MockVisionProvider()
  ) {}

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "image") {
      throw new Error(
        `[image-extractor] Unsupported modality "${input.type}". ImageExtractor only handles "image".`
      );
    }

    const now = new Date().toISOString();
    const documentId = this._resolveDocumentId(input);
    const extractedImage = await this._buildExtractedImage(input, documentId, now);
    const asset = this._buildAsset(extractedImage);
    const ocrResult = await this.ocrProvider.recognize(extractedImage);
    const description = await this.visionProvider.describe(extractedImage);

    const sectionTexts = [ocrResult.text, description.shortCaption, description.detailedDescription]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim());
    const fullText = sectionTexts.join("\n\n");
    const chunks = buildMultimodalChunks({
      documentId,
      ocrResults: [ocrResult],
      imageDescriptions: [description],
    });

    return {
      documentId,
      title: this._resolveTitle(input),
      modality: "image",
      language: input.multimodal?.language ?? (input.metadata?.language as string | undefined),
      content: {
        fullText,
        sections: sectionTexts.map((text, index) => ({
          id: `image-section-${index + 1}`,
          heading: index === 0 ? "OCR" : "Image Description",
          text,
        })),
      },
      lineage: {
        sourceType: input.url ? "url" : input.filePath ? "upload" : "manual",
        originalFilename: input.filePath ? basename(input.filePath) : undefined,
        mimeType: this._resolveMimeType(input),
        checksum: extractedImage.checksum,
        extractedAt: now,
        extractor: "image-extractor",
        extractorVersion: "0.1.0",
      },
      metadata: {
        ...(input.metadata ?? {}),
        multimodal: {
          assets: [asset],
          ocrResults: [ocrResult],
          imageDescriptions: [description],
          chunks,
          traces: {
            multimodalExtractionTrace: {
              provider: {
                ocr: this.ocrProvider.name,
                vision: this.visionProvider.name,
              },
              numberOfAssets: 1,
            },
          },
        },
      },
    };
  }

  private async _buildExtractedImage(
    input: IngestionInput,
    documentId: string,
    createdAt: string
  ): Promise<ExtractedImage> {
    const assetId = randomUUID();
    const extractedPath = input.filePath ?? input.url ?? `inline://${assetId}`;
    return {
      assetId,
      sourceDocumentId: documentId,
      pageNumber: 1,
      mimeType: this._resolveMimeType(input),
      originalPath: input.filePath ?? input.url,
      extractedPath,
      extractionMethod: "fallback",
      checksum: await this._resolveChecksum(input),
      confidence: 1,
      createdAt,
    };
  }

  private _buildAsset(image: ExtractedImage): ImageAsset {
    return {
      id: image.assetId,
      sourceDocumentId: image.sourceDocumentId,
      modality: "image",
      mimeType: image.mimeType,
      originalPath: image.originalPath,
      extractedPath: image.extractedPath,
      pageNumber: image.pageNumber,
      boundingBox: image.boundingBox,
      checksum: image.checksum,
      extractionMethod: image.extractionMethod,
      providerMetadata: image.providerMetadata,
      confidence: image.confidence,
      createdAt: image.createdAt,
    };
  }

  private _resolveTitle(input: IngestionInput): string {
    if (typeof input.metadata?.title === "string") {
      return input.metadata.title;
    }
    if (input.filePath) {
      return basename(input.filePath);
    }
    return "Untitled image";
  }

  private _resolveDocumentId(input: IngestionInput): string {
    if (typeof input.metadata?.documentId === "string") {
      return input.metadata.documentId;
    }
    return randomUUID();
  }

  private _resolveMimeType(input: IngestionInput): string {
    if (typeof input.metadata?.mimeType === "string") {
      return input.metadata.mimeType;
    }
    return "image/*";
  }

  private async _resolveChecksum(input: IngestionInput): Promise<string | undefined> {
    if (!input.filePath) {
      return undefined;
    }
    const buffer = await readFile(input.filePath);
    return createHash("sha256").update(buffer).digest("hex");
  }
}
