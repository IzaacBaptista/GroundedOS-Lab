# ADR-011 — Session memory persistence

**Status:** Accepted

## Context

Phase 2b requires memory continuity across independent API requests and restarts, while preventing cross-session leakage. Existing RAG requests were stateless.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| In-memory-only session cache | Simple implementation | Lost on restart; no Phase 2b durability |
| File-backed per-session store | Durable enough for local-first MVP; no external infra | Limited query performance and concurrency |
| Database/vector memory backend now | Better scalability and retrieval quality | Premature infrastructure overhead for current phase |

## Decision

Adopt a **file-backed per-session memory store** in `packages/memory` for Phase 2b. The API accepts optional `sessionId`, retrieves recent relevant entries before retrieval, and persists each query/answer pair after answer construction. Session memory is exposed via `GET /rag/memory/:sessionId`.

## Consequences

- Memory survives API restarts and supports continuity across requests.
- Session isolation is explicit; no shared memory when `sessionId` differs.
- Retrieval is lexical-overlap based for now; semantic memory retrieval remains future work.
