# ADR-022 — Cap. 9 metadata enrichment: real chunk-level fields, filtering before ranking

**Status:** Accepted

## Context

The RAG book's chapter 9 defines nine metadata fields in four categories
(Proveniência: `source`/`author`/`timestamp`, Identidade: `document_id`/`section`,
Acesso: `permissions`/`tenant`, Organização: `tags`/`relationships`) and is explicit
that metadata's value comes from being an **active pre-retrieval filter**, not
passive annotation — tenant/permission filtering in particular must happen
*before* search, never as a discard applied to already-ranked results.

Auditing the actual code against this (not just checking a field's name
appears somewhere) found:

- `document_id`, `section` and `source` were genuinely modeled and used
  (`RetrievalChunk.documentId`/`sectionId`, `RetrievalChunkMetadata.sourceType`).
- `author`, `timestamp` (`createdAtSource`) and `tags` existed only on the
  largely-unused `SourceDocument.metadata` type and were never read anywhere —
  dead fields that looked like a feature but did nothing.
- `permissions` and `relationships` did not exist anywhere in the schema.
- Tenant isolation was real, but implemented entirely as physically separate
  indexes per tenant (`apps/api/src/rag-index-store.ts`, `access.cross_tenant_attempt`
  log event on mismatch) — a valid, arguably stronger mechanism, but it meant
  no chunk ever carried a `tenantId` field usable as a filter within a shared
  index, which is what the book describes.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Where to carry the new fields | Add `author`/`timestamp`/`tags`/`permissions`/`tenantId`/`relationships` to a new `NormalizedDocumentMetadata` interface (with an index signature for other domain fields), propagate all of them onto `RetrievalChunkMetadata` in `chunkDocument()` | Leaving `metadata` as a bare `Record<string, unknown>` (rejected: no compile-time guidance for the exact field names the book calls out, easy to typo) |
| `permissions` filter semantics | Chunk matches a `permissions` filter value if its `permissions` array includes the value, **or** if `permissions` is unset/empty (no ACL = public) | Requiring an explicit `permissions` array on every chunk (rejected: would silently hide every existing/未-annotated document behind a filter with no migration path); post-hoc filtering after ranking (rejected outright — this is exactly the anti-pattern the book warns about, since a scoring bug or missed filter would leak restricted text into a ranked result) |
| `tags` filter semantics | Same array-contains rule as `permissions`, minus the security framing — an untagged chunk matches any tag filter | Requiring exact tag-set equality (rejected: `tags` is for recall/organization, not access control; over-filtering here just drops results with no security benefit) |
| Where filtering happens | `InMemoryVectorStore.search()` already filters the full candidate set before scoring/ranking/`topK` slicing — reused as-is, no new pipeline stage | Filtering after `retrieveFromIndex()` returns ranked results (rejected: same anti-pattern as above) |
| `tenantId` on chunk metadata | Added as a second, finer-grained filter dimension, additive to the existing per-tenant physical index separation | Removing the physical index separation in favor of a single shared index with `tenantId` filtering only (rejected: much larger blast-radius change, not something this chapter's scope calls for; physical separation is a stronger isolation guarantee and stays as the primary mechanism) |
| API wiring (auth → filter) | Left for future work, same precedent as ADR-021's parent-child chunking | Wiring `permissions`/`tenantId` into `apps/api/src/rag-service.ts`'s ask/retrieval call sites now (rejected for this round: that file's retrieval call sites are deeply nested in the existing rerank/orchestration flow; the `packages/rag` layer is where "metadata as filter" is meaningfully unit-testable, and the API surface is a separate, larger integration task) |

## Decision

- Added `NormalizedDocumentMetadata` (`author?`, `timestamp?`, `tags?`,
  `permissions?`, `tenantId?`, `relationships?: DocumentRelationship[]`, plus
  an index signature) to `packages/core`, with a matching Zod schema
  (`NormalizedDocumentMetadataSchema`, `DocumentRelationshipSchema`).
- `chunkDocument()` copies all six fields from `document.metadata` onto every
  chunk's `RetrievalChunkMetadata`.
- `InMemoryVectorStore`'s `matchesFilter`/`buildSearchableMetadata` now expose
  `author`, `timestamp`, `tags`, `permissions`, `tenantId` and apply
  array-contains-or-unrestricted semantics for the two array fields.
- `document_id`/`section`/`source` were already correct — left untouched.

## Consequences

- Callers that set `permissions`/`tenantId` on `IngestionInput.metadata` (which
  already flows straight into `NormalizedDocument.metadata`) get real,
  pre-ranking filtering for free — no other pipeline change required.
- Documents ingested without `permissions` remain publicly visible to any
  filter value; this is a default-open choice, not default-closed. A caller
  that needs default-closed access control must set an explicit
  `permissions` array at ingestion time — nothing in this pipeline infers
  access control on its own.
- `apps/api`'s ask/retrieval endpoints do not yet build a `permissions`/`tenantId`
  filter from the authenticated request — the filtering mechanism is real and
  tested at the `packages/rag` layer, but nothing in `apps/api` calls it with
  those keys yet. That wiring is future work, same as parent-child chunking's
  unwired `parentChunkId` from ADR-021.
