/**
 * ImageExtractor (stub)
 *
 * Handles the `"image"` modality. Full implementation (OCR / captioning via a
 * vision API) is planned for Phase 1; this stub satisfies the
 * {@link Extractor} interface so that the dispatcher can register it and
 * return a clear `NOT_IMPLEMENTED` error at runtime.
 */
import type { DocumentModality, Extractor, IngestionInput, NormalizedDocument } from "@groundedos/core";
export declare class ImageExtractor implements Extractor {
    readonly supportedModalities: DocumentModality[];
    extract(_input: IngestionInput): Promise<NormalizedDocument>;
}
