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

const DEFAULT_LANGUAGE = "eng";

export interface TesseractRecognizeResult {
  text: string;
  confidence: number;
}

export interface TesseractOcrProviderOptions {
  language?: string;
  recognizeFn?: (imagePath: string, language: string) => Promise<TesseractRecognizeResult>;
}

/**
 * Real OCR provider backed by tesseract.js. `MockOCRProvider` (and its
 * `Local`/`Cloud` aliases above) never run OCR at all — this is the first
 * implementation that does.
 *
 * `recognizeFn` defaults to a real tesseract.js worker but is injectable so
 * callers/tests aren't forced to download language data or pay WASM OCR
 * cost for every unit test.
 */
export class TesseractOcrProvider implements OCRProvider {
  readonly name = "tesseract-ocr";
  private readonly language: string;
  private readonly recognizeFn: (imagePath: string, language: string) => Promise<TesseractRecognizeResult>;

  constructor(options: TesseractOcrProviderOptions = {}) {
    this.language = options.language ?? DEFAULT_LANGUAGE;
    this.recognizeFn = options.recognizeFn ?? defaultTesseractRecognize;
  }

  async recognize(image: ExtractedImage): Promise<OCRResult> {
    const { text, confidence } = await this.recognizeFn(image.extractedPath, this.language);
    const normalizedConfidence = confidence > 1 ? confidence / 100 : confidence;

    return {
      assetId: image.assetId,
      sourceDocumentId: image.sourceDocumentId,
      text,
      confidence: normalizedConfidence,
      pageNumber: image.pageNumber,
      language: this.language,
      blocks: [
        {
          text,
          confidence: normalizedConfidence,
          boundingBox: image.boundingBox,
        },
      ],
      provider: this.name,
      model: `tesseract-${this.language}`,
      createdAt: new Date().toISOString(),
    };
  }
}

async function defaultTesseractRecognize(
  imagePath: string,
  language: string
): Promise<TesseractRecognizeResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language);

  try {
    const { data } = await worker.recognize(imagePath);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
