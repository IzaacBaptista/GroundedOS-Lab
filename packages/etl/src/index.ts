/**
 * @packageDocumentation
 * etl
 *
 * Extract, Transform, Load pipeline for the GroundedOS Lab monorepo.
 *
 * Public API
 * ----------
 * - `ingest(input)`       — unified entry point; routes to the correct extractor
 * - `TextExtractor`       — working plain-text extractor
 * - `PdfExtractor`        — text extraction + multimodal hooks (OCR/vision)
 * - `ImageExtractor`      — OCR + image description
 * - `AudioExtractor`      — provider-based transcription
 *
 * Core types are re-exported here for convenience so consumers do not need a
 * direct dependency on `@groundedos/core` for the most common types.
 */

// Primary entry point
export { ingest } from "./dispatcher";

// Extractors
export { TextExtractor } from "./extractors/text";
export { PdfExtractor } from "./extractors/pdf";
export { ImageExtractor } from "./extractors/image";
export { AudioExtractor } from "./extractors/audio";
export {
  PdfImageExtractor,
  PdfPageRenderer,
  ExtractedImageStore,
  ImageAssetRegistry,
  PdfAssetMapper,
} from "./multimodal/pdf-assets";
export {
  MockOCRProvider,
  LocalOCRProvider,
  CloudOCRProvider,
  type OCRProvider,
} from "./multimodal/providers/ocr";
export {
  MockVisionProvider,
  LocalVisionProvider,
  CloudVisionProvider,
  type ImageDescriptionProvider,
  type VisionModelProvider,
} from "./multimodal/providers/vision";
export {
  MockTranscriptionProvider,
  LocalWhisperProvider,
  OllamaWhisperProvider,
  CloudTranscriptionProvider,
  type AudioTranscriptionProvider,
} from "./multimodal/providers/transcription";

// Re-exported core types (convenience)
export type {
  IngestionInput,
  Extractor,
  DocumentModality,
  NormalizedDocument,
  DocumentSection,
} from "@groundedos/core";
