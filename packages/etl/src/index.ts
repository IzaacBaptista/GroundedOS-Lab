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

// Primary entry point
export { ingest } from "./dispatcher";

// Extractors
export { TextExtractor } from "./extractors/text";
export { PdfExtractor } from "./extractors/pdf";
export { ImageExtractor } from "./extractors/image";
export { AudioExtractor } from "./extractors/audio";

// Re-exported core types (convenience)
// NOTE: Using relative paths until packages/core has a package.json that
// declares the "name" field (e.g. "@groundedos/core"). At that point these
// imports should change to `from "@groundedos/core"`.
export type {
  IngestionInput,
  Extractor,
  DocumentModality,
  NormalizedDocument,
  DocumentSection,
} from "../../core/src/index";
