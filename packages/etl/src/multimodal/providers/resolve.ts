/**
 * Resolves real vs mock multimodal providers from environment configuration.
 *
 * Each real provider (`TesseractOcrProvider`, `OllamaVisionProvider`,
 * `OpenAIWhisperProvider`) is opt-in so the default extractor behavior — and
 * the existing tests asserting mock text — stays unchanged unless a caller
 * explicitly enables/configures it.
 */

import { MockOCRProvider, TesseractOcrProvider, type OCRProvider } from "./ocr.js";
import {
  MockVisionProvider,
  OllamaVisionProvider,
  type ImageDescriptionProvider,
} from "./vision.js";
import {
  MockTranscriptionProvider,
  OpenAIWhisperProvider,
  type AudioTranscriptionProvider,
} from "./transcription.js";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_VISION_MODEL = "llava";

/** Real when `GROUNDEDOS_ENABLE_LLM_GENERATION=true` (same flag as /rag/ask generation). */
export function resolveVisionProvider(): ImageDescriptionProvider {
  if (process.env.GROUNDEDOS_ENABLE_LLM_GENERATION !== "true") {
    return new MockVisionProvider();
  }

  return new OllamaVisionProvider({
    baseUrl: process.env.GROUNDEDOS_OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    model: process.env.GROUNDEDOS_OLLAMA_VISION_MODEL ?? DEFAULT_OLLAMA_VISION_MODEL,
  });
}

/** Real when `GROUNDEDOS_ENABLE_REAL_OCR=true` (local WASM OCR, no API key needed). */
export function resolveOcrProvider(): OCRProvider {
  if (process.env.GROUNDEDOS_ENABLE_REAL_OCR !== "true") {
    return new MockOCRProvider();
  }

  return new TesseractOcrProvider({
    language: process.env.GROUNDEDOS_OCR_LANGUAGE,
  });
}

/** Real when `OPENAI_API_KEY` is set (same gating pattern as `OpenAIEmbeddingsProvider`). */
export function resolveTranscriptionProvider(): AudioTranscriptionProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return new MockTranscriptionProvider();
  }

  return new OpenAIWhisperProvider({ apiKey });
}
