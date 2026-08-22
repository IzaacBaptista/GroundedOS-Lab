# ADR-019 — Real OCR, vision and transcription providers (opt-in)

**Status:** Accepted

## Context

Continuing the RAG-book audit (ADR-017, ADR-018): `packages/etl`'s multimodal providers (`LocalOCRProvider`, `CloudOCRProvider`, `LocalVisionProvider`, `CloudVisionProvider`, `LocalWhisperProvider`, `OllamaWhisperProvider`, `CloudTranscriptionProvider`) were all literal subclasses of their respective `Mock*Provider` with no override — same fabricated-text behavior (`"OCR extracted text from ${filename}"`, `"Transcribed content from ${filename}."`) regardless of which one was used. Only the `Mock*` classes were ever actually instantiated (`ImageExtractor`, `PdfExtractor`, `AudioExtractor` constructors defaulted to `new MockOCRProvider()` etc.); the `Local`/`Cloud`/`Ollama`-named classes were unreachable dead exports. `packages/etl/README.md` described this as "mock/local/cloud adapters," which implied real backend integrations that did not exist.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Ollama vision model for image description** (chosen) | Consistent with the local-first Ollama pattern already used for embeddings/chat (ADR-017); `/api/chat` accepts an `images` field for vision-capable models (e.g. `llava`) | Requires a vision-capable model pulled locally; not every Ollama install has one |
| **tesseract.js for OCR** (chosen) | Pure JS/WASM, no external binary or API key, real OCR; keeps the local-first default free | First-run downloads language training data; CPU-bound, adds latency vs the instant mock |
| **OpenAI Whisper API for transcription** (chosen) | No local speech-to-text model exists in this repo's stack yet; matches the existing `OpenAIEmbeddingsProvider` opt-in-via-API-key convention | Requires a cloud API key and network access — breaks local-first-only operation for this one capability until a local Whisper option is added |
| **Local Whisper (whisper.cpp / nodejs-whisper bindings)** | Fully local-first, no API key | Native binary dependency, heavier setup; deferred — `OpenAIWhisperProvider` covers the real-transcription gap now, a local option can be added later without changing the `AudioTranscriptionProvider` interface |

## Decision

- Add `OllamaVisionProvider`, `TesseractOcrProvider`, `OpenAIWhisperProvider` as real implementations of `ImageDescriptionProvider`, `OCRProvider`, `AudioTranscriptionProvider`.
- Delete the misleading `Local*`/`Cloud*`/`Ollama*` mock aliases — they added no behavior and the names implied integrations that didn't exist.
- Gate each real provider independently via `resolveOcrProvider()` / `resolveVisionProvider()` / `resolveTranscriptionProvider()` (`packages/etl/src/multimodal/providers/resolve.ts`):
  - Vision: `GROUNDEDOS_ENABLE_LLM_GENERATION=true` (same flag as `/rag/ask` and `SynthesizerAgent` generation).
  - OCR: `GROUNDEDOS_ENABLE_REAL_OCR=true` (separate flag — local/free, but changes latency and downloads assets on first run, so still opt-in rather than silently on).
  - Transcription: presence of `OPENAI_API_KEY` (mirrors `OpenAIEmbeddingsProvider`'s existing gating).
- Defaults are unchanged (`Mock*Provider`) so the existing test suite (which asserts the mock fabricated text) keeps passing without modification.
- Added `tesseract.js` as a new dependency of `packages/etl`.

## Consequences

- Image, PDF-with-images, and audio ingestion can now produce genuinely extracted content, opt-in, with the same fallback-to-mock-by-default safety property as the other real-generation ADRs.
- Three different opt-in mechanisms (one boolean flag, one separate boolean flag, one API-key presence check) is more surface than a single toggle, but each mirrors an existing convention in the codebase rather than inventing a new one.
- Table/chart-aware extraction (book cap. 75) and video (cap. 77) remain unimplemented — out of scope for this ADR.
- A local (non-cloud) transcription option is deferred; `AudioTranscriptionProvider` is already the right seam for it when prioritized.
