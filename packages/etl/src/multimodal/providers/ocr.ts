import { basename } from "path";
import type { ExtractedImage, OCRResult } from "@groundedos/core";

export interface OCRProvider {
  readonly name: string;
  recognize(image: ExtractedImage): Promise<OCRResult>;
}

export class MockOCRProvider implements OCRProvider {
  readonly name: string = "mock-ocr";

  async recognize(image: ExtractedImage): Promise<OCRResult> {
    const text = `OCR extracted text from ${basename(image.extractedPath)}`;
    return {
      assetId: image.assetId,
      sourceDocumentId: image.sourceDocumentId,
      text,
      confidence: 0.92,
      pageNumber: image.pageNumber,
      language: "en",
      blocks: [
        {
          text,
          confidence: 0.92,
          boundingBox: image.boundingBox,
        },
      ],
      provider: this.name,
      model: "mock-v1",
      createdAt: new Date().toISOString(),
    };
  }
}

export class LocalOCRProvider extends MockOCRProvider {
  readonly name = "local-ocr";
}

export class CloudOCRProvider extends MockOCRProvider {
  readonly name = "cloud-ocr";
}
