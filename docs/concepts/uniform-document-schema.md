# Uniform Document Schema

## What it is

A **Uniform Document Schema** is a single, shared data contract that represents any document — regardless of its original format or modality — in a standardized way that every stage of an AI pipeline can consume.

In GroundedOS Lab the schema is realized through two TypeScript interfaces defined in `packages/core`:

| Entity | Role |
|---|---|
| `SourceDocument` | The raw ingestion record — what came in, where it is stored, and what lifecycle state it is in. |
| `NormalizedDocument` | The standardized payload produced by the ETL pipeline and consumed by all downstream stages (chunking, embedding, retrieval, agents). |

A third supporting type, `DocumentSection`, represents an atomic extracted section (e.g. a PDF page or a Markdown heading block) inside a `NormalizedDocument`.

## Why it matters

Real-world AI systems ingest content from many sources: PDFs, audio recordings, spreadsheets, web pages, raw text, images. Without a uniform schema each downstream component needs to understand each format independently, creating:

- **Fragile, coupled code** — every consumer must handle every format.
- **Loss of provenance** — it becomes hard to trace a generated answer back to its source.
- **Inconsistent metadata** — chunking, retrieval and evaluation receive different shapes depending on the input format.

A uniform schema solves this by acting as a **normalization layer**: extractors convert raw files into `NormalizedDocument`; everything downstream only ever sees `NormalizedDocument`.

## Where it is used

| Package / Location | How it uses the schema |
|---|---|
| `packages/core` | Defines `SourceDocument`, `NormalizedDocument`, `DocumentSection`, `DocumentModality`, `DocumentStatus` |
| `packages/etl` | Reads `SourceDocument` → runs the correct extractor → writes `NormalizedDocument` |
| `packages/rag` | Reads `NormalizedDocument.content.sections` as input to the chunking stage |
| `packages/observability` | Uses `SourceDocument.id` and lineage fields to trace requests end-to-end |
| `packages/evals` | Associates evaluation results with `documentId` for attribution |

## Supported modalities

```ts
type DocumentModality =
  | "text"
  | "pdf"
  | "image"
  | "audio"
  | "csv"
  | "markdown"
  | "html";
```

## Document lifecycle

```
uploaded → processing → processed
                  ↘ failed
```

The `DocumentStatus` field on `SourceDocument` tracks this progression so that workers and APIs can filter and retry documents in a known state.

## Data lineage

Every `NormalizedDocument` carries a `lineage` block that records:

- Which extractor produced it and at what version
- When extraction ran
- The checksum of the source file

This makes it possible to:
- Re-extract a document if the extractor is updated
- Detect tampering or corruption in the source file
- Reproduce any pipeline result deterministically

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Schema rigidity** | A fixed schema speeds up development and enables tooling, but may need versioning as the pipeline evolves. Use `metadata: Record<string, unknown>` for fields not yet in the base schema. |
| **Lossy normalization** | Converting a rich PDF (tables, diagrams) to plain text loses structure. The `sections` array partially recovers layout, but complex tables should use a dedicated representation in a future version. |
| **Language detection cost** | Auto-detecting `language` adds latency. For high-throughput ingestion, consider deferring detection to an async step. |
| **Storage duplication** | Storing raw file, extracted text and normalized JSON for each document triples storage requirements. The `storage` paths can be omitted if on-demand extraction is preferred. |

## Further reading

- [`packages/core/src/types/document.ts`](../../packages/core/src/types/document.ts) — Full type definitions
- [`packages/core/README.md`](../../packages/core/README.md) — Core package overview
- [`packages/etl/README.md`](../../packages/etl/README.md) — ETL pipeline overview
