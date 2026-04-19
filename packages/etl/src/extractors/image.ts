/**
 * ImageExtractor (stub)
 *
 * Handles the `"image"` modality. Full implementation (OCR / captioning via a
 * vision API) is planned for Phase 1; this stub satisfies the
 * {@link Extractor} interface so that the dispatcher can register it and
 * return a clear `NOT_IMPLEMENTED` error at runtime.
 */

import type {
  DocumentModality,
  Extractor,
  IngestionInput,
  NormalizedDocument,
} from "@groundedos/core";

export class ImageExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["image"];

  async extract(_input: IngestionInput): Promise<NormalizedDocument> {
    throw new Error(
      "[image-extractor] NOT_IMPLEMENTED — Image extraction (OCR / captioning) is planned for Phase 1."
    );
  }
}
