# Data Contracts & Schemas
> Schema-first runtime validation for every object that crosses package boundaries.

## Why it matters
TypeScript catches many issues at compile time, but it cannot protect runtime boundaries (API payloads, persisted index files, package outputs). GroundedOS Lab now validates core contracts at runtime and fails fast with typed contract errors instead of allowing silent drift.

## How it works in GroundedOS Lab
- `packages/core/src/validation/schemas.ts` defines Zod schemas for `NormalizedDocument`, retrieval chunks, embedded chunks, vector search results, `ProcessedQuery` and `RagAskResponse`.
- `packages/core/src/validation/index.ts` exposes `validate<Type>()` functions and `ContractViolationError`.
- Validation is executed at package boundaries:
  - ETL output validated before RAG indexing/asking.
  - Chunking output and embedding output validated inside `packages/rag`.
  - Retrieval results validated before Dev Mode shaping.
  - `/rag/ask` responses validated before being sent.

## Where it lives in the code
- `packages/core/src/validation/schemas.ts`
- `packages/core/src/validation/index.ts`
- `packages/core/src/validation/validation.test.ts`
- `packages/rag/src/retrieval.ts`
- `packages/rag/src/embeddings.ts`
- `apps/api/src/server.ts`

## Observable experiment
1. Run `npm test` and inspect `packages/core/src/validation/validation.test.ts`.
2. Provide an invalid object shape (for example a missing `documentId` in a `NormalizedDocument`).
3. Observe `ContractViolationError` exposing contract name, failing field path and received value.

## Related concepts
- [Uniform Document Schema](./uniform-document-schema.md)
- [Data Lineage](./data-lineage.md)
- [Evals](./evals.md)

## Further reading
- [ADR-007 Runtime Validation Strategy](../adr/ADR-007-runtime-validation-strategy.md)
- [Zod Documentation](https://zod.dev)
