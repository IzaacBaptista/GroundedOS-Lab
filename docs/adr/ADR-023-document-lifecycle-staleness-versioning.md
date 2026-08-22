# ADR-023 — Document lifecycle: checksum-based staleness, incremental indexing, version history

**Status:** Accepted

## Context

The RAG book's chapter 10 covers document lifecycle: criação, atualização,
remoção, reindexação, versionamento, stale documents, and incremental
indexing. Auditing the actual code found:

- **Criação** and **remoção** were genuinely implemented (`indexRag`/
  `indexRagFromFile` and `deleteRagIndex`, both with correct semantic-cache
  invalidation).
- **Atualização** existed only by accident: calling `indexRag` again with the
  same `documentId` silently overwrote the persisted index, with no
  distinct "update" semantics, no comparison against the previous content,
  and no record of what changed.
- **Reindexação** and **stale documents** were pure theater: `reindex_documents`
  and `stale_document` existed only as string labels inside
  `RetrievalRecoveryStrategy`/`RetrievalFailureReason` — enum values in a
  diagnostics-suggestion feature. Nothing computed staleness and nothing
  triggered a reindex.
- **Versionamento** did not exist: `PersistedRagIndex.schemaVersion` is a
  storage-format version, not a content version — overwriting a document
  destroyed its prior embeddings and checksum permanently, with no rollback.
- **Incremental indexing** did not exist: every call to `indexRag`/
  `indexRagFromFile` fully re-chunked and re-embedded the entire document,
  even when the content was byte-identical to what was already indexed.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Staleness detection | Reuse the checksum `indexRag`/`indexRagFromFile` already compute; a document is stale iff no index is persisted yet, or the new checksum differs from `PersistedRagIndex.document.checksum` | A separate mtime/ETag-based staleness check against the original source (rejected: the pipeline never persists a path back to the original source — content-hash is the only signal already available end-to-end) |
| Incremental indexing | When not stale and not `force`, skip ingest/chunk/embed entirely and return the existing persisted summary with `reindexed: false` | Partial re-embedding of only changed sections (rejected: would require diffing at the section/chunk level, a much larger change; whole-document skip-if-unchanged already captures the common case — repeated ingestion of unchanged content — without that complexity) |
| Reindexação real | A `force: true` request field on `RagIndexRequest`/`RagIndexFileRequest` that bypasses the skip-if-unchanged short-circuit, wired through the JSON schema, multipart parsing, and HTTP controller | A separate `POST /rag/reindex` endpoint (rejected: reindexing an unchanged document is just "index again, but don't skip" — reusing the existing endpoint with one flag is a smaller surface and keeps checksum/versioning logic in one place) |
| Versionamento | Archive the current persisted file before every overwrite (`saveRagIndex` now calls `archiveCurrentVersionIfPresent`), keyed by the archived record's own `createdAt`; add `listRagIndexVersions`/`rollbackRagIndex` to browse and restore | Keeping full version history inline inside the single JSON record (rejected: would duplicate potentially large `embeddedChunks` arrays on every save, bloating the file linearly with edit count); a fixed retention window / max version count (rejected for this round: no requirement surfaced for pruning yet, and pruning can be added later without a schema change) |
| Rollback safety | `rollbackRagIndex` restores an archived version via the normal `saveRagIndex` path, which itself archives whatever was current first | Directly overwriting the current file with the archived one, bypassing archiving (rejected: would make rollback a one-way, destructive operation — the same anti-pattern being fixed) |

## Decision

- `apps/api/src/rag-index-store.ts`: `saveRagIndex` archives the current file
  (if any) to `.versions/<hash(documentId)>/<createdAt>.json` before writing;
  added `tryLoadRagIndex` (non-throwing `loadRagIndex`), `isDocumentStale`,
  `listRagIndexVersions`, `rollbackRagIndex`.
- `apps/api/src/rag-service.ts`: `indexRag`/`indexRagFromFile` check the
  existing persisted record first. Unchanged checksum + no `force` → skip
  reprocessing, return `reindexed: false`. Otherwise proceed as before and
  return `reindexed: true` (+ `previousChecksum` when a prior version
  existed). Added `listPersistedRagIndexVersions`/`rollbackPersistedRagIndex`
  service wrappers, mirroring the existing `deletePersistedRagIndex` pattern.
- `RagIndexRequest`/`RagIndexFileRequest` gained `force?: boolean`;
  `RagIndexRequestBodySchema` (`@groundedos/core`) updated to allow it through
  strict JSON validation; multipart parsing reads `force` via the existing
  `parseBoolean` helper.
- New HTTP routes on the existing `rag/indexes` controller:
  `GET /rag/indexes/:documentId/versions`, `POST /rag/indexes/:documentId/rollback/:versionId`.

## Consequences

- Re-ingesting identical content is now free after the first index (one
  checksum comparison instead of a full chunk/embed pass) — this also means
  `semanticCache.invalidate()` is correctly *not* called on a no-op reindex,
  since nothing changed.
- Every update/reindex now leaves a recoverable trail: nothing is ever
  silently destroyed by a second `indexRag` call.
- No pruning/retention policy exists yet for archived versions — a document
  updated very frequently accumulates one archive file per change with no
  cap. This is an accepted cost for this round; adding a retention window
  is straightforward future work if it becomes a problem.
- Reindexing still means re-running the full ETL pipeline on freshly
  supplied content — there is no persisted copy of the original source to
  reindex *from* without the caller resupplying it. `force: true` is for
  "the same content should be reprocessed differently" (e.g. after a
  chunking/embedding config change), not for restoring lost source material.
