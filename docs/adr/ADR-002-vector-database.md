# ADR-002 — Vector database: pgvector → Qdrant migration path

**Status:** Accepted

## Context

The RAG pipeline requires a vector store for similarity search over embedded document chunks. Two options are in scope: **pgvector** (a PostgreSQL extension) and **Qdrant** (a dedicated vector search engine).

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **pgvector** | Already inside Postgres — no extra service, simple local setup, SQL joins across relational and vector data, easy for development | Exact nearest-neighbour only (no HNSW in early versions); limited tuning for high-dimensional ANN search; performance degrades above ~1M vectors without careful index tuning |
| **Qdrant** | Purpose-built for ANN search, HNSW + quantisation-aware indexing, payload filtering, good performance at scale | Extra service to run locally, separate API contract, no native SQL joins |
| **In-memory (current)** | Zero dependencies, fast for tests and local development | Not persistent, cannot scale beyond a single process |

## Decision

**Use pgvector for development and early production; migrate to Qdrant when necessary.**

Migrate to Qdrant when **any** of the following become true:

1. The vector collection exceeds ~500K chunks and query latency under pgvector exceeds the Phase 2 latency budget (target: p95 < 200 ms).
2. ANN index tuning (HNSW parameters, quantisation) is needed to meet quality or cost targets.
3. The project adds payload-filtered search that is too complex to express in SQL.

Until then, pgvector keeps the stack simpler and avoids an extra dependency for contributors who just want to run the project locally.

## Consequences

- `packages/rag` abstracts vector store access behind a `VectorStore` interface so the implementation can be swapped without changing retrieval logic.
- The in-memory store used in Phase 1 local development is a first implementation of that interface.
- pgvector will be the first persistent store implementation (Phase 2 or Phase 6 infra slice).
- Qdrant integration will be added as a second `VectorStore` implementation when the migration criteria above are met; a new ADR is not required for that switch, but the criteria must be documented in the commit.
