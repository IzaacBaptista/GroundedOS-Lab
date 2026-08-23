# ADR-026 — Vector store metadata filter fixes (pgvector, Qdrant) and three new backends

**Status:** Accepted

## Context

The RAG book's chapter 13 covers vector stores: Qdrant, pgvector, Pinecone,
Weaviate, Elasticsearch/OpenSearch, metadata filtering, and namespaces/tenants.
It's explicit that metadata filtering "precisa ser suportada nativamente pelo
vector store" and must run as a genuine pre-filter — never a post-hoc discard
of an already-ranked result set, especially for `permissions`/`tenantId`.

Auditing the two backends that already existed:

- **`PgvectorVectorStore.searchAsync()`** assumed every filter key mapped to a
  real table column (`camelToSnake(key) = $N`). Only `documentId`/`sectionId`/
  `startOffset`/`endOffset` are real columns; every cap. 9 metadata field
  (`tenantId`, `permissions`, `tags`, `modality`, `sourceType`, `author`,
  `timestamp`, `page`, `originalFilename`) lives inside the `metadata` JSONB
  column. Filtering by any of them generated SQL referencing a column that
  doesn't exist — a hard runtime error, so metadata filtering was unusable
  for pgvector beyond those four fields.
- **`QdrantVectorStore.toQdrantFilter()`** built filter keys at the payload
  root (`{key: "tenantId", match: {...}}`), but the actual payload nests
  everything else under `payload.metadata.*` (`buildChunkPayload()`). Qdrant
  found no matching field and returned zero results — silently, with no
  error — for the exact fields (`permissions`, `tenantId`) the book calls
  the most security-critical ones in the whole chapter.
- Neither backend replicated the array-contains / open-when-unset semantics
  ADR-022 established for `InMemoryVectorStore` (`tags` contains, `permissions`
  open when empty) — cross-backend behavior diverged on a security-relevant
  field.
- Pinecone, Weaviate, and Elasticsearch/OpenSearch — three of the five
  vector stores the chapter discusses — didn't exist in the codebase at all.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| pgvector filter routing | Explicit maps for real columns (`ROOT_COLUMNS`) and embedding-metadata fields (`EMBEDDING_METADATA_FIELDS`); everything else targets the `metadata` JSONB column generically via `jsonb_typeof` | Adding a real column per cap. 9 field (rejected: defeats the purpose of a flexible JSONB metadata bag, and doesn't scale to arbitrary future fields) |
| pgvector array-open semantics | Generic SQL using `jsonb_typeof(metadata->'key') = 'array'` to branch between contains-or-open and exact-match at query time — works for *any* array-valued field, not just `tags`/`permissions`, because Postgres can introspect the stored value's type | A field-name allowlist like Qdrant's (rejected for pgvector specifically: jsonb_typeof makes the fully generic version just as easy to write, so there's no reason to special-case field names here) |
| Qdrant filter routing | `resolveQdrantFieldPath()` maps root RetrievalChunk fields as-is and everything else to `metadata.<key>` / `embeddingMetadata.<key>` | Changing the Qdrant payload shape to be flat (rejected: `buildChunkPayload` nesting under `metadata`/`embeddingMetadata` mirrors `EmbeddedChunk`'s own shape 1:1, which is what makes `toChunk()` reconstruction straightforward) |
| Qdrant array-open semantics | Explicit `OPEN_ARRAY_METADATA_FIELDS` set (`tags`, `permissions`) using `should: [{match}, {is_empty}]` nested inside `must`, since Qdrant's filter DSL can't introspect a field's runtime type the way pgvector's `jsonb_typeof` can | Building the same generic type-introspection Qdrant doesn't support (not possible without a schema round-trip per field before every query — too costly) |
| SQL injection surface in pgvector's per-field JSONB path interpolation | Validate every filter key against `^[a-zA-Z_][a-zA-Z0-9_]*$` before interpolating it into the query string, throwing otherwise | Parameterizing the key too (rejected: Postgres doesn't support parameterized identifiers/JSON paths — only values — so an allowlist regex is the standard mitigation) |
| New backends' shape | Pinecone/Weaviate/Elasticsearch each follow the exact `QdrantVectorStore` shape: sync `insert()`/`search()` via an in-memory mirror, real work in `insertAsync()`/`searchAsync()`, soft-fail back to the mirror on any request error | A shared abstract base class (rejected: the three backends' wire formats — flat metadata for Pinecone, GraphQL for Weaviate, bulk NDJSON + native `knn` for Elasticsearch — differ enough that a shared base would mostly hold indirection, not real logic) |
| Pinecone's `relationships` field (array of objects) | Serialize to a `relationshipsJson` string property, parse back on read; not filterable | Flattening into multiple scalar metadata keys (rejected: `relationships` is a variable-length array, doesn't flatten to fixed keys) |
| Weaviate's `relationships` field | Same JSON-string-property approach as Pinecone | Defining a nested Weaviate object property type for it (rejected: adds schema-management complexity for a field this round doesn't need to filter on) |
| Namespaces/tenants | Exposed as a first-class option per backend where the underlying store has a native primitive: `namespace` for Pinecone, `tenant` for Weaviate (both threaded through every insert/query call). pgvector/Qdrant/Elasticsearch don't have an equivalent primitive in this implementation — documented as "use a separate table/collection/index per tenant" | Building a synthetic namespace layer on top of pgvector/Qdrant/Elasticsearch (e.g. a `tenant_id` column + filter) (rejected as *this* round's scope: that's really the same "metadata filter used as pre-filter" mechanism already fixed above — `tenantId` is filterable on every backend today. A dedicated physical-isolation primitive for the three backends without a native one is separate, larger work) |

## Decision

- Fixed `PgvectorVectorStore.searchAsync()`'s filter-clause builder to route
  root columns, embedding-metadata fields, and generic JSONB metadata fields
  (with jsonb_typeof-based array-contains-or-open semantics) correctly, with
  filter-key validation against SQL injection.
- Fixed `QdrantVectorStore.toQdrantFilter()` to target the correct nested
  payload path, with `tags`/`permissions` getting explicit contains-or-open
  `should`/`is_empty` treatment.
- Added `PineconeVectorStore`, `WeaviateVectorStore`, `ElasticsearchVectorStore`
  (`packages/rag/src/{pinecone,weaviate,elasticsearch}-store.ts`), each with
  a corresponding `VectorStoreProvider` (`PineconeProvider`, `WeaviateProvider`,
  `ElasticsearchProvider`) and a `VectorBackend` entry (`vector-backend.ts`).
- Added `pgvector-store.test.ts` (there was no test coverage for this backend
  at all before this round).

## Consequences

- Metadata filtering — including the security-critical `permissions`/`tenantId`
  fields — now actually works, and works consistently, across
  `InMemoryVectorStore`, pgvector, and Qdrant. Anyone who configured
  `VECTOR_BACKEND=pgvector` or `qdrant` and filtered by a cap. 9 field before
  this fix was either hitting a SQL error or silently getting unfiltered-looking
  empty results.
- `apps/api`'s `createApiVectorStore()` still only wires up Qdrant (and
  falls back to in-memory with a warning for `pgvector`) — Pinecone, Weaviate,
  and Elasticsearch are available as library primitives in `packages/rag`
  but not yet reachable through the API's `VECTOR_BACKEND` env var. Same
  precedent as ADR-021/ADR-022/ADR-025's unwired capabilities: real and
  tested at the package layer, API wiring is separate follow-up work.
- Namespace/tenant isolation is only a first-class primitive for Pinecone and
  Weaviate in this round. pgvector, Qdrant, and Elasticsearch rely on
  metadata-filter-based tenant scoping (now correctly pre-filtered) or
  separate tables/collections/indexes managed by the caller — there is no
  dedicated physical-isolation feature added for those three here.
