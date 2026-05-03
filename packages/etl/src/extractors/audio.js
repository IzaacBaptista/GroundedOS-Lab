/**
 * AudioExtractor (stub)
 *
 * Handles the `"audio"` modality. Full implementation (ASR via Whisper or
 * equivalent) is planned for Phase 1; this stub satisfies the
 * {@link Extractor} interface so that the dispatcher can register it and
 * return a clear `NOT_IMPLEMENTED` error at runtime.
 */
export class AudioExtractor {
    supportedModalities = ["audio"];
    async extract(_input) {
        throw new Error("[audio-extractor] NOT_IMPLEMENTED — Audio extraction (ASR / Whisper) is planned for Phase 1.");
    }
}
//# sourceMappingURL=audio.js.map