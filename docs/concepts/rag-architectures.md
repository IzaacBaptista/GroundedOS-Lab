# RAG Architectures

## What it is

The **RAG architecture** describes how much structure sits between retrieval and generation. The common progression is **Naive RAG** (single retrieve → stuff → generate), **Advanced RAG** (adds query rewriting, hybrid search, reranking, context compression), **Modular RAG** (swappable, composable retrieval/generation modules), and **Agentic RAG** (an agent loop plans, retrieves iteratively, and verifies evidence). A separate axis is **offline vs online**: offline RAG precomputes answers/indexes in batch, online RAG resolves everything at query time.

## Why it matters

Knowing which architecture a system implements explains its failure modes and upgrade path. A Naive RAG system fails on multi-hop questions; jumping straight to Agentic RAG without first fixing retrieval quality (hybrid search, reranking) wastes complexity budget.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Started as Naive RAG (chunk → embed → retrieve → generate), evolved to Advanced RAG with hybrid search and reranking. |
| [`packages/agents`](../../packages/agents/README.md) | Implements the Agentic RAG pattern: multi-agent orchestration with retrieval, verification and planning. |
| [`docs/concepts/adaptive-rag.md`](./adaptive-rag.md) | Covers the adaptive/decision-routing piece of Advanced/Agentic RAG. |
| [`docs/concepts/graphrag.md`](./graphrag.md) | A Modular RAG variant that swaps vector retrieval for graph retrieval. |

## Where GroundedOS Lab sits today

- **Naive RAG**: fully implemented (Phase 1, `packages/rag`).
- **Advanced RAG**: partially implemented — hybrid search and reranking exist (`partial` status in the Concepts Lab); query rewriting/HyDE and context compression are earlier-stage.
- **Modular RAG**: partially present — GraphRAG and adaptive-rag are separate modules that can substitute the default retrieval path.
- **Agentic RAG**: package-level baseline exists (`packages/agents`) but is not the default path for every query.
- **Offline vs online**: GroundedOS Lab runs online RAG only — retrieval and generation both happen at request time; there is no precomputed/batch answer cache today.

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Complexity vs quality** | Each step up the ladder (Naive → Advanced → Modular → Agentic) adds latency and moving parts in exchange for handling harder questions. |
| **Online freshness vs cost** | Online-only RAG stays current with every corpus change but re-pays retrieval + generation cost on every query; offline precomputation would trade that for staleness risk. |
| **Agentic overhead** | Agent loops (retrieve → reason → verify → retrieve again) can multiply LLM calls per question; only worth it when single-shot retrieval demonstrably fails. |
