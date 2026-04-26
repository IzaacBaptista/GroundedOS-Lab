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
 * - `PdfExtractor`        — stub (Phase 1)
 * - `ImageExtractor`      — stub (Phase 1)
 * - `AudioExtractor`      — stub (Phase 1)
 *
 * Core types are re-exported here for convenience so consumers do not need a
 * direct dependency on `@groundedos/core` for the most common types.
 */
export { ingest } from "./dispatcher";
export { TextExtractor } from "./extractors/text";
export { PdfExtractor } from "./extractors/pdf";
export { ImageExtractor } from "./extractors/image";
export { AudioExtractor } from "./extractors/audio";
export type { IngestionInput, Extractor, DocumentModality, NormalizedDocument, DocumentSection, } from "@groundedos/core";
