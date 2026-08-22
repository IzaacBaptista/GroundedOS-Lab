# ADR-021 — Chunk boundary word-snap fix, recursive/sentence strategies, parent-child chunking

**Status:** Accepted

## Context

Reading the RAG book's full chapter 8 (previously only outline/concept lists were available) surfaced a real correctness bug and confirmed several missing strategies in `chunkDocument()`:

1. **Bug:** `sliceSectionText`'s fixed-size window cut purely on raw character count, with no adjustment toward a natural boundary. The book is explicit: *"a prática recomendada... é sempre ajustar o corte final para o limite estrutural mais próximo (espaço em branco, fim de frase, fim de bloco), em vez de aceitar um corte cego."* The existing implementation could — and would — split a word in half whenever a chunk boundary happened to fall inside one.
2. **Missing strategies:** of the book's seven chunking strategies, only fixed-size and code-aware (added in ADR-020) existed. Recursive (the book calls this *"frequentemente a escolha default de bibliotecas de RAG"*), sentence-based, and parent-child/hierarchical were all absent.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Word-mid-cut bug | Snap the window's end offset back to the nearest whitespace within the window; fall back to the original hard cut only when no whitespace exists (e.g. one long unbroken token) | Always snapping forward to the *next* whitespace past the window (rejected: would silently grow chunks past `maxChunkChars`, breaking the budget contract callers rely on) |
| Recursive chunking | Paragraph split first (greedy packing up to `maxChunkChars`), recurse to sentence split for an oversized paragraph, recurse to the (now boundary-fixed) fixed-size slicer for an oversized sentence | A single "smart" chunker that tries all boundary types at once (rejected: the book's own description is explicitly a recursion through separator types, and matching that shape keeps the fallback order legible) |
| Sentence-based chunking | Regex sentence split (`.`/`!`/`?` + whitespace), greedy packing, never splits a sentence — an oversized single sentence is emitted as-is rather than forced under budget | Falling back to fixed-size for an oversized sentence (rejected: contradicts the strategy's entire point, "nunca corta uma frase ao meio" is unconditional in the book) |
| Parent-child / hierarchical chunking | New `chunkDocumentWithParents()` returning the existing fine-grained `chunks` plus a `parents` array (one per section — the book's own Figure 8.2 example uses "seção inteira" as the parent), each child carrying `parentChunkId` | Changing `chunkDocument()`'s return shape to include parents inline (rejected: breaks the existing `RetrievalChunk[]` contract every caller — API, evals, tests — already depends on); building a separate parent-size-window abstraction instead of reusing sections (rejected: sections already are the natural, already-computed "broader context" unit; introducing a second windowing pass would duplicate work for no clear benefit at this stage) |
| Semantic chunking | Not implemented | Requires a real embedding call per candidate boundary — a distinct cost/infra dependency from the other three, deferred rather than done partially |

## Decision

- Fixed the boundary bug in `sliceSectionText` via `snapToWordBoundary()`; verified against existing tests (a single 26-character unbroken token test continues to hard-cut identically, since no whitespace exists to snap to) plus a new test with real words.
- Added `ChunkDocumentOptions.strategy: "fixed" | "recursive" | "sentence"` (default `"fixed"`, so existing callers and their test assertions are unaffected).
- Added `chunkDocumentWithParents()` as a pure addition alongside `chunkDocument()` — no existing signature changed.
- Left semantic chunking unimplemented; not silently claimed as done anywhere in docs.

## Consequences

- Default chunking behavior (`strategy` unset) now avoids word-mid-cuts it previously produced; this is a behavior change for any caller relying on the old raw-character-window output, though none exist yet outside this package's own tests (which were updated).
- Callers wanting paragraph/sentence-respecting chunks or parent-child retrieval must opt in explicitly (`strategy: "recursive"`/`"sentence"`, or call `chunkDocumentWithParents()`); nothing in the ingestion pipeline (`packages/etl`) or `/rag/index` picks a non-default strategy yet — wiring that choice into the API surface is separate future work.
- `chunkDocumentWithParents()`'s parents are exposed but nothing in `packages/rag`'s retrieval or `apps/api`'s context assembly yet reads `parentChunkId` to substitute the parent text into the prompt — the data is available, the "child scores, parent injects" behavior described in the book's Figure 8.2 is not yet wired end-to-end.
