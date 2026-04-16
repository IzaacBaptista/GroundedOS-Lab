/**
 * PdfExtractor (stub)
 *
 * Handles the `"pdf"` modality. Full implementation is planned for Phase 1;
 * this stub satisfies the {@link Extractor} interface so that the dispatcher
 * can register it and return a clear `NOT_IMPLEMENTED` error at runtime.
 */

import type { DocumentModality, NormalizedDocument } from "../../../core/src/types/document";
import type { Extractor } from "../../../core/src/types/extractor";
import type { IngestionInput } from "../../../core/src/types/ingestion";

export class PdfExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["pdf"];

  async extract(_input: IngestionInput): Promise<NormalizedDocument> {
    throw new Error(
      "[pdf-extractor] NOT_IMPLEMENTED — PDF extraction is planned for Phase 1. " +
        "Consider using a PDF-to-text pre-processor and passing the result as modality 'text'."
    );
  }
}
