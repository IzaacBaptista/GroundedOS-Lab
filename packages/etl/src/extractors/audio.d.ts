/**
 * AudioExtractor (stub)
 *
 * Handles the `"audio"` modality. Full implementation (ASR via Whisper or
 * equivalent) is planned for Phase 1; this stub satisfies the
 * {@link Extractor} interface so that the dispatcher can register it and
 * return a clear `NOT_IMPLEMENTED` error at runtime.
 */
import type { DocumentModality, Extractor, IngestionInput, NormalizedDocument } from "@groundedos/core";
export declare class AudioExtractor implements Extractor {
    readonly supportedModalities: DocumentModality[];
    extract(_input: IngestionInput): Promise<NormalizedDocument>;
}
