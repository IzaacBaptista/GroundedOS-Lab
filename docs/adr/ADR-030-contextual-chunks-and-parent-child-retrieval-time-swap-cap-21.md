# ADR-030 — Cap 21: contextual chunks/embeddings, and wiring the parent-child retrieval-time swap

**Status:** Accepted

## Context

Auditing chapter 21 ("Contextual retrieval") found four concepts, all
either missing or half-built:

- **Contextual chunks / document context / contextual embeddings** — the
  book's technique of generating a short LLM blurb per chunk at indexing
  time (using the whole document as reference) and embedding chunk+blurb
  combined, so a chunk like "revenue grew 3%" is findable by the company
  and quarter it's actually about. None of this existed: `RetrievalChunk`
  had no `context` field, `buildRetrievalIndex` took no LLM provider at
  all, and both `embedChunks` (`embeddings.ts`) and the BM25 candidate
  mapping (`retrieval.ts`) embedded/indexed raw `chunk.text` only.
- **Parent-child retrieval-time swap** — `chunkDocumentWithParents()`
  (added in an earlier round, ADR-021) was real and tested at the
  chunking layer: children genuinely carry a `parentChunkId` resolving to
  the full parent section text. But it had zero callers anywhere in the
  repo. `buildRetrievalIndex` used plain `chunkDocument`, so
  `parentChunkId` never reached the vector store, and no retrieval code
  ever substituted parent text for child text. The gap was already
  disclosed honestly in ADR-021/022/025 rather than silently overclaimed
  — this is "documented dead code," not theater — but the book's Figure
  8.2 behavior ("child scores, parent injects") simply didn't run.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Where `context` lives on a chunk | `metadata.context?: string` (new field, `RetrievalChunkMetadataSchema` in `@groundedos/core`) — chunk's own `text` stays the original excerpt | Prepending the blurb directly into `chunk.text` (rejected: would corrupt citations — the exact excerpt a user sees would silently include LLM-generated text that was never actually in the source document) |
| Combining context with text for embedding/BM25 | Single helper `contextualizedChunkText(chunk)`, used at both the `embedChunks` call site and the BM25 candidate-mapping call site in `retrieval.ts` | Duplicating the concatenation logic at each call site (rejected: the book explicitly warns dense and lexical sides drifting apart on this is a real risk — one shared function makes that impossible by construction) |
| Cost of contextual chunking (one LLM call per chunk) | Opt-in via `contextualChunks: boolean` + `llmProvider` on `BuildRetrievalIndexOptions`, defaulting to off; a chunk whose call fails just keeps `context` unset (doesn't fail the whole index) | Making it always-on (rejected: it's N LLM calls per document at index time — the book itself frames this as worth it only when validation shows decontextualized chunks are hurting retrieval, not a default); failing the whole indexing run on one bad LLM call (rejected: one flaky call shouldn't block indexing the rest of a document) |
| Parent-child: where to compute parent data | `buildRetrievalIndex` always calls `chunkDocumentWithParents` (not `chunkDocument`) and stores the resulting `parents: Map<id, text>` on `RetrievalIndex` — unconditionally, since it's pure/free (no extra LLM call, just extra metadata) | Making parent computation itself opt-in too (rejected: unlike contextual chunking, this costs nothing extra to compute — only the retrieval-time *swap* is worth gating) |
| Parent-child: why `RetrievalIndex.parents` is optional, not required | Optional (`parents?: Map<...>`) so an index reconstructed some other way (e.g. `apps/api`'s persisted-snapshot reload path, which doesn't serialize parent text) still type-checks; `injectParentChunks` is then a documented no-op for that index, not a crash or a silent lie | Requiring every `RetrievalIndex` to carry `parents` (rejected: would force a breaking change onto `apps/api/src/rag-service.ts`'s manual `RetrievalIndex` literal for persisted-index reload, for data that genuinely isn't available there) |
| Parent-child: where the actual swap happens | A single `applyParentChunkSwap()` helper wrapping the result of `retrieveInternal()` at both its call sites (`retrieveFromIndex`, `retrieveForDevMode`) — post-processes the final result list regardless of which internal code path (dense/hybrid/empty) produced it | Threading the swap into every one of `retrieveInternal`'s several return points individually (rejected: more places to keep in sync, more surface for one path to be missed) |
| `parentChunkId` surviving core's schema validation | Added `parentChunkId?: string` to `RetrievalChunkSchema` in `@groundedos/core` | Leaving the schema as-is (rejected: Zod's default `z.object()` behavior *strips* unrecognized keys on `.parse()` — `validateRetrievalChunks`/`validateEmbeddedChunks` in `buildRetrievalIndex` would have silently dropped `parentChunkId` on every indexed chunk, the same way it likely would have if anyone had wired this before) |

## Decision

- `packages/core/src/validation/schemas.ts`: added `context` to
  `RetrievalChunkMetadataSchema`, added `parentChunkId` to
  `RetrievalChunkSchema`.
- `packages/rag/src/chunking.ts`: `RetrievalChunkMetadata.context?: string`.
- `packages/rag/src/contextual-chunking.ts` (new): `buildChunkContext()`,
  `annotateChunksWithContext()`, `contextualizedChunkText()`.
- `packages/rag/src/embeddings.ts`: `embedChunks()` now embeds
  `contextualizedChunkText(chunk)` instead of raw `chunk.text`.
- `packages/rag/src/retrieval.ts`:
  - `buildRetrievalIndex` always chunks via `chunkDocumentWithParents`;
    when `contextualChunks && llmProvider` are both set, runs
    `annotateChunksWithContext` before embedding. `RetrievalIndex` gained
    `parents?: Map<string, string>`.
  - The BM25 candidate mapping now uses `contextualizedChunkText()` too.
  - `RetrieveFromIndexOptions` gained `injectParentChunks?: boolean`
    (default `false`); `applyParentChunkSwap()` implements the swap.

## Consequences

- Contextual chunking is real when opted in (LLM-generated blurb, used on
  both the dense and lexical side) and a documented no-op otherwise — the
  chunk's citable `text` never changes, only what gets embedded/indexed.
- The parent-child primitive from ADR-021 is no longer dead code: with
  `injectParentChunks: true`, retrieval genuinely returns the book's
  Figure 8.2 behavior. Default is `false`, so no existing caller's
  returned chunk text changes unless it opts in.
- Known, disclosed limitation: after a parent swap, `startOffset`/
  `endOffset` still describe the child's window into the document, not
  the parent's — the offsets weren't recomputed, only the text was
  substituted.
- `apps/api`'s persisted-index reload path doesn't serialize parent
  chunk text, so `injectParentChunks` is a no-op for indexes loaded that
  way — `RetrievalIndex.parents` being optional makes that an explicit,
  type-checked case rather than a runtime surprise.
- Not addressed this round: `apps/api` doesn't yet expose
  `contextualChunks`/`llmProvider`/`injectParentChunks` through its
  request surface (same precedent as every prior "package-layer capability
  real, API wiring deferred" ADR this session).
