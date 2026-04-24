# Long-Term Memory
> Session-scoped persistence of previous Q/A turns for contextual continuity across independent requests.

## Why it matters
Without memory, each request starts from zero context and repeated clarification is required. Long-term memory preserves relevant prior turns and improves continuity while maintaining isolation boundaries.

## How it works in GroundedOS Lab
- `@groundedos/memory` provides `FileSessionMemoryStore` with per-session persistence.
- `apps/api/src/rag-service.ts` accepts optional `sessionId` in ask requests.
- During ask workflows, memory is loaded (`load-memory`) and used as retrieval hint context.
- After answer generation, the query/answer pair is persisted for that session.
- `GET /rag/memory/:sessionId` exposes stored entries.

## Where it lives in the code
- `packages/memory/src/types.ts`
- `packages/memory/src/store.ts`
- `apps/api/src/rag-service.ts`
- `apps/api/src/rag/rag-memory/rag-memory.controller.ts`

## Observable experiment
1. Send two ask requests with the same `sessionId`.
2. Inspect `devMode.memory.recalled` on the second request.
3. Call `GET /rag/memory/:sessionId` and verify persisted entries.
4. Repeat with a different `sessionId` and confirm isolated memory.

## Related concepts
- [Memory](./memory.md)
- [Workflow Orchestration](./workflow-orchestration.md)
- [Data Contracts & Schemas](./data-contracts.md)

## Further reading
- [ADR-011 Session Memory Persistence](../adr/ADR-011-session-memory-persistence.md)
