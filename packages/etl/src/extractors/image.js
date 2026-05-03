/**
 * ImageExtractor (stub)
 *
 * Handles the `"image"` modality. Full implementation (OCR / captioning via a
 * vision API) is planned for Phase 1; this stub satisfies the
 * {@link Extractor} interface so that the dispatcher can register it and
 * return a clear `NOT_IMPLEMENTED` error at runtime.
 */
export class ImageExtractor {
    supportedModalities = ["image"];
    async extract(_input) {
        throw new Error("[image-extractor] NOT_IMPLEMENTED — Image extraction (OCR / captioning) is planned for Phase 1.");
    }
}
//# sourceMappingURL=image.js.map