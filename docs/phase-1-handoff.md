# Phase 1 Handoff

This handoff captures the current Phase 0 baseline and the next implementation issues for Phase 1 — Core RAG.

## Current baseline

Phase 0 now provides a runnable data foundation:

- `packages/core` defines the canonical `SourceDocument`, `NormalizedDocument`, `DocumentSection`, `IngestionInput`, and `Extractor` contracts.
- `packages/etl` supports `text` ingestion from inline content or local files.
- `packages/etl` supports `pdf` ingestion from local files or remote URLs, producing page-based sections.
- `image` and `audio` extractors remain registered stubs with explicit `NOT_IMPLEMENTED` errors.
- `datasets/registry.json` registers `phase-0-smoke-text` with source, license, path, checksum, and ETL metadata.
- `npm run ingest:smoke` reads the registered sample dataset, validates its checksum, runs ETL, and prints a `NormalizedDocument`.

## Verified commands

Run these from the repository root:

```bash
npm run build
npm test
npm run ingest:smoke
npm run rag:smoke
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
npm run api:dev
npm run web:dev
```

Expected status:

- TypeScript typecheck passes.
- Vitest passes for ETL dispatcher, text extraction, and PDF extraction.
- Smoke ingestion returns `documentId: "smoke-text-001"` and two text sections.
- RAG smoke returns a grounded answer, retrieved chunks, relevance scores, source metadata, and offsets.
- RAG ask returns the same retrieval output shape for a direct local file path.
- The local API exposes `GET /health`, `POST /rag/index`, `POST /rag/ask`, `GET /rag/indexes`, and `DELETE /rag/indexes/:documentId` for inline JSON text, multipart text/PDF upload, persisted local indexes, selectable local embedding providers, and basic index management.
- The local web surface serves `http://localhost:3000`, proxies `/api/*` to the API, and supports `Index`, saved-index selection, provider selection for new requests, `Ask`, refresh, and delete.

See [`phase-1-local-rag.md`](./phase-1-local-rag.md) for local command usage and limits.

## Phase 1 implementation issues

1. [x] Implement the RAG chunking contract.
   - Input: `NormalizedDocument.content.sections`
   - Output: stable retrieval chunks with `documentId`, `sectionId`, offsets, text, and metadata
   - Package: `packages/rag`

2. [x] Add embedding interfaces and a local stub provider.
   - Define an embedding model contract before wiring a real provider
   - Keep outputs deterministic in tests
   - Include `SemanticEmbeddingsProvider`, adapters, registry and the
     deterministic `LocalHashEmbeddingsProvider`
   - Package: `packages/rag`

3. [x] Add an in-memory vector store for local development.
   - Support insert, similarity search, and metadata filtering
   - Avoid external database requirements for the first RAG test
   - Package: `packages/rag`

4. [x] Build the first retrieval flow.
   - Ingest document → chunk sections → embed chunks → retrieve candidates
   - Cover the full flow with integration tests
   - Packages: `packages/etl`, `packages/rag`

5. [x] Document Dev Mode retrieval output shape.
   - Include retrieved chunk IDs, relevance scores, document origin, and offsets
   - Keep this as the API/UI retrieval inspection contract
   - Packages: `packages/rag`, `apps/web`

6. [x] Add local persisted RAG indexes.
   - Persist embedded chunks as local JSON under `.groundedos/indexes/`
   - Support `POST /rag/index` and `POST /rag/ask` by `documentId`
   - Packages: `apps/api`, `apps/web`

7. [x] Add local RAG index management.
   - List persisted indexes with document metadata and storage paths
   - Delete persisted indexes by `documentId`
   - Packages: `apps/api`, `apps/web`

## Explicit non-goals for the first Phase 1 slice

- No production vector database yet.
- No chat UI yet.
- No model-provider routing yet; API provider selection is limited to local
  deterministic embedding providers.
- No agent orchestration yet.
- No image or audio extraction beyond current stubs.
