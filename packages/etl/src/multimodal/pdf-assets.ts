import { randomUUID } from "crypto";
import { dirname, join } from "path";
import type { ExtractedImage, ImageAsset } from "@groundedos/core";

export interface PdfImageExtractionInput {
  documentId: string;
  filePath: string;
  pageCount: number;
  maxPages?: number;
}

export class PdfImageExtractor {
  async extractEmbeddedImages(
    input: PdfImageExtractionInput
  ): Promise<ExtractedImage[]> {
    // Placeholder for real embedded-object extraction. Returning an empty list
    // keeps the pipeline composable while page rendering acts as fallback.
    void input;
    return [];
  }
}

export class PdfPageRenderer {
  async renderPages(input: PdfImageExtractionInput): Promise<ExtractedImage[]> {
    const now = new Date().toISOString();
    const maxPages = Math.min(input.pageCount, input.maxPages ?? input.pageCount);
    const outputDir = join(dirname(input.filePath), ".groundedos-assets");

    return Array.from({ length: maxPages }, (_, index) => {
      const pageNumber = index + 1;
      const assetId = randomUUID();
      return {
        assetId,
        sourceDocumentId: input.documentId,
        pageNumber,
        mimeType: "image/png",
        originalPath: input.filePath,
        extractedPath: join(outputDir, `${assetId}-page-${pageNumber}.png`),
        extractionMethod: "page_render",
        createdAt: now,
      };
    });
  }
}

export class ExtractedImageStore {
  async save(images: ExtractedImage[]): Promise<ExtractedImage[]> {
    return images;
  }
}

export class PdfAssetMapper {
  map(image: ExtractedImage): ImageAsset {
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
}

export class ImageAssetRegistry {
  private readonly mapper = new PdfAssetMapper();

  register(images: ExtractedImage[]): ImageAsset[] {
    return images.map((image) => this.mapper.map(image));
  }
}
