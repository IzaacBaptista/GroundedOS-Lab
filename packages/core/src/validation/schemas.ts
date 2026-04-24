/**
 * Runtime Zod schemas for every stable contract type that crosses a package
 * boundary in GroundedOS Lab.
 *
 * These schemas mirror the TypeScript interfaces defined in packages/core and
 * packages/rag, but enforce correctness at runtime — not just compile time.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const DocumentModalitySchema = z.enum([
  "text",
  "pdf",
  "image",
  "audio",
  "csv",
  "markdown",
  "html",
]);

export const DocumentStatusSchema = z.enum([
  "uploaded",
  "processing",
  "processed",
  "failed",
]);

// ---------------------------------------------------------------------------
// NormalizedDocument
// ---------------------------------------------------------------------------

export const DocumentSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().optional(),
  text: z.string(),
  page: z.number().int().positive().optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
});

export const NormalizedDocumentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  modality: DocumentModalitySchema,
  language: z.string().optional(),
  content: z.object({
    fullText: z.string(),
    sections: z.array(DocumentSectionSchema),
  }),
  lineage: z.object({
    sourceType: z.enum(["upload", "url", "manual"]),
    originalFilename: z.string().optional(),
    mimeType: z.string().min(1),
    checksum: z.string().optional(),
    extractedAt: z.string().min(1),
    extractor: z.string().min(1),
    extractorVersion: z.string().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// RetrievalChunk
// ---------------------------------------------------------------------------

export const RetrievalChunkMetadataSchema = z.object({
  documentTitle: z.string(),
  modality: DocumentModalitySchema,
  sectionHeading: z.string().optional(),
  page: z.number().int().positive().optional(),
  sourceType: z.enum(["upload", "url", "manual"]),
  originalFilename: z.string().optional(),
  chunkIndex: z.number().int().nonnegative(),
  sectionChunkIndex: z.number().int().nonnegative(),
  offsetBasis: z.enum(["document", "section"]),
});

export const RetrievalChunkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  sectionId: z.string().min(1),
  text: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  metadata: RetrievalChunkMetadataSchema,
});

// ---------------------------------------------------------------------------
// EmbeddedChunk
// ---------------------------------------------------------------------------

export const EmbeddedChunkSchema = RetrievalChunkSchema.extend({
  embedding: z.array(z.number()),
  embeddingMetadata: z.object({
    provider: z.string().min(1),
    model: z.string().min(1).optional(),
    dimensions: z.number().int().positive(),
    normalized: z.boolean().optional(),
  }),
});

// ---------------------------------------------------------------------------
// VectorSearchResult
// ---------------------------------------------------------------------------

export const VectorSearchResultSchema = z.object({
  chunk: EmbeddedChunkSchema,
  score: z.number().min(-1).max(1),
});

// ---------------------------------------------------------------------------
// ProcessedQuery (Concept 1)
// ---------------------------------------------------------------------------

export const QueryIntentSchema = z.enum([
  "factual",
  "comparative",
  "procedural",
  "exploratory",
  "unknown",
]);

export const ProcessedQuerySchema = z.object({
  original: z.string().min(1),
  rewritten: z.string().optional(),
  expanded: z.array(z.string()),
  intent: QueryIntentSchema,
  confidence: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// RagAskResponse (partial — covers the stable contract fields)
// ---------------------------------------------------------------------------

export const GroundedAnswerSchema = z.object({
  grounded: z.boolean(),
  text: z.string(),
  citations: z.array(
    z.object({
      chunkId: z.string(),
      documentId: z.string(),
      sectionId: z.string(),
      score: z.number(),
      source: z.record(z.string(), z.unknown()),
      offsets: z.record(z.string(), z.unknown()),
    })
  ),
});

export const RagDocumentSummarySchema = z.object({
  documentId: z.string().min(1),
  title: z.string(),
  modality: DocumentModalitySchema,
  checksum: z.string(),
  originalFilename: z.string().optional(),
});

export const RagIndexSummarySchema = z.object({
  chunkCount: z.number().int().nonnegative(),
  embeddingProvider: z.string().min(1),
  embeddingDimensions: z.number().int().positive(),
  embeddingModel: z.record(z.string(), z.unknown()).optional(),
});

export const RagAskResponseSchema = z.object({
  document: RagDocumentSummarySchema,
  query: z.string().min(1),
  answer: GroundedAnswerSchema,
  index: RagIndexSummarySchema,
  storage: z
    .object({
      persisted: z.boolean(),
      indexPath: z.string().optional(),
    })
    .optional(),
  devMode: z.record(z.string(), z.unknown()),
});
