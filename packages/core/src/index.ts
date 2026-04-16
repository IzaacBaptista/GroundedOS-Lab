/**
 * @packageDocumentation
 * core
 *
 * Shared foundational types, utilities and abstractions for the GroundedOS Lab
 * monorepo. Every other package and app imports from here — never the reverse.
 */

// Document schema (Phase 0 — Data Foundation)
export type {
  DocumentModality,
  DocumentStatus,
  DocumentSection,
  SourceDocument,
  NormalizedDocument,
} from "./types/document";
