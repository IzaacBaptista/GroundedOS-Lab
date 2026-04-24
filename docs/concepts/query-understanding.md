# Query Understanding
> A pre-retrieval layer that rewrites, expands and classifies user queries before RAG search.

## Why it matters
Raw natural-language queries are often noisy or underspecified. Query understanding improves retrieval recall and intent alignment without requiring a full LLM planner.

## How it works in GroundedOS Lab
Phase 2 uses a deterministic rule-based pipeline in `packages/rag/src/query-understanding.ts`:
- **Query rewriting:** normalizes text and strips filler terms.
- **Query expansion:** adds lexical variants from a static synonym map.
- **Intent detection:** classifies to `factual`, `comparative`, `procedural`, `exploratory`, or `unknown`.

`apps/api/src/rag-service.ts` runs `processQuery()` before retrieval and stores `processedQuery` in Dev Mode output.

## Where it lives in the code
- `packages/core/src/types/query.ts`
- `packages/rag/src/query-understanding.ts`
- `packages/rag/src/query-understanding.test.ts`
- `apps/api/src/rag-service.ts`

## Observable experiment
1. Ask equivalent queries like `What is RAG?` and `Tell me about retrieval augmented generation`.
2. Compare `devMode.processedQuery` fields (`rewritten`, `expanded`, `intent`).
3. With `api-lexical`, expanded terms typically increase lexical overlap and improve top-result relevance.

## Related concepts
- [RAG](./rag.md)
- [Embeddings](./embeddings.md)
- [Hybrid Search](./hybrid-search.md)

## Further reading
- [ADR-006 Query Understanding Strategy](../adr/ADR-006-query-understanding-strategy.md)
