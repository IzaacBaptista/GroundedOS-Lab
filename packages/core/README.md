# core

Shared foundational types, utilities and abstractions used across all packages and apps in the monorepo.

## Responsibilities

- Define base interfaces and types for the entire system
- Provide shared configuration and environment helpers
- Export common utilities (logging, error handling, schema validation)
- Serve as the single source of truth for cross-cutting concerns

## Status

Complete (Phases 0-3 baseline): runtime validation, query contracts and
workflow primitives are active; Phase 6 focuses on infra/auth hardening.

## Contents

### `src/types/document.ts` — Uniform Document Schema

Defines the single contract for every document modality flowing through the pipeline.

#### `DocumentModality`

```ts
type DocumentModality = "text" | "pdf" | "image" | "audio" | "csv" | "markdown" | "html";
```

#### `DocumentStatus`

```ts
type DocumentStatus = "uploaded" | "processing" | "processed" | "failed";
```

#### `SourceDocument`

The raw ingestion record. Created when a file is uploaded, a URL is submitted, or content is entered manually. Tracks provenance, storage paths and lifecycle status.

Key fields:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique document identifier (UUID) |
| `workspaceId` | `string?` | Tenant / workspace scope |
| `modality` | `DocumentModality` | Content type |
| `status` | `DocumentStatus` | ETL lifecycle state |
| `source` | object | Origin type + optional URI |
| `storage` | object | Raw / extracted / normalized paths |
| `metadata` | object | Size, checksum, author, tags |

#### `DocumentSection`

An atomic section extracted from the source (page, heading block, etc.). Input to the chunking stage.

#### `NormalizedDocument`

The standardized payload produced by the ETL pipeline and consumed by all downstream stages (chunking, embedding, retrieval, agents).

Key fields:

| Field | Type | Description |
|---|---|---|
| `documentId` | `string` | Reference to `SourceDocument.id` |
| `content.fullText` | `string` | Full extracted plain text |
| `content.sections` | `DocumentSection[]` | Structured sections |
| `lineage` | object | Extractor, version, checksum, timestamp |
| `metadata` | `Record<string, unknown>` | Arbitrary domain-specific fields |

## Usage

```ts
// From within packages/core itself:
import type { SourceDocument, NormalizedDocument } from "./src/types/document";

// From another package in the monorepo:
import type { SourceDocument, NormalizedDocument } from "@groundedos/core";
```

> All types are pure TypeScript interfaces — no runtime dependencies.

### `src/types/query.ts` — Query Understanding Contracts

Defines the pre-retrieval query contracts used by `packages/rag` and API Dev Mode output.

Key exports:

| Export | Purpose |
|---|---|
| `RawQuery` | Raw user query payload before processing |
| `ProcessedQuery` | Enriched query with rewrite, expansion and intent |
| `QueryIntent` | Intent classification union (`factual`, `comparative`, `procedural`, `exploratory`, `unknown`) |

### `src/validation/*` — Runtime Contract Validation

Schema-first runtime validation for stable cross-package contracts using Zod.

Key exports:

| Export | Purpose |
|---|---|
| `ContractViolationError` | Typed runtime validation error with contract/field/value context |
| `validateNormalizedDocument` | Validates ETL output documents |
| `validateRetrievalChunk(s)` | Validates chunking outputs |
| `validateEmbeddedChunk(s)` | Validates embedding outputs |
| `validateVectorSearchResult(s)` | Validates retrieval outputs |
| `validateProcessedQuery` | Validates query understanding outputs |
| `validateRagAskResponse` | Validates API response contract |

### `src/workflow/*` — Workflow Engine

Lightweight step-based workflow orchestration primitives.

Key exports:

| Export | Purpose |
|---|---|
| `WorkflowStep` | Named executable workflow step |
| `WorkflowContext` | Per-run state (step statuses, durations, metadata) |
| `WorkflowRunner` | Sequential step executor with failure and timing semantics |
