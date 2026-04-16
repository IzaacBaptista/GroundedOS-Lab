/**
 * AudioExtractor (stub)
 *
 * Handles the `"audio"` modality. Full implementation (ASR via Whisper or
 * equivalent) is planned for Phase 1; this stub satisfies the
 * {@link Extractor} interface so that the dispatcher can register it and
 * return a clear `NOT_IMPLEMENTED` error at runtime.
 */

import type { DocumentModality, NormalizedDocument } from "../../../core/src/types/document";
import type { Extractor } from "../../../core/src/types/extractor";
import type { IngestionInput } from "../../../core/src/types/ingestion";

export class AudioExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["audio"];

  async extract(_input: IngestionInput): Promise<NormalizedDocument> {
    throw new Error(
      "[audio-extractor] NOT_IMPLEMENTED — Audio extraction (ASR / Whisper) is planned for Phase 1."
    );
  }
}
