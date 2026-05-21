# Adaptive RAG

## What it is

Adaptive RAG chooses the lightest retrieval strategy that still keeps answer quality and grounding acceptable for the current query.

## Why it matters

Not every question needs the same retrieval cost. Adaptive routing lets the system skip unnecessary work for low-risk questions and invest more in graph, HyDE or hierarchical retrieval when the query is ambiguous or relational.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/adaptive-rag`](../../packages/adaptive-rag/src/index.ts) | Classifies the query and produces `AdaptiveRetrievalPlan`. |
| [`packages/rag`](../../packages/rag/src/retrieval.ts) | Executes the selected advanced retrieval path in hybrid mode and emits Dev Mode traces. |
| [`apps/web`](../../apps/web/src/components/tabs/ChunksTab.tsx) | Shows adaptive routing decisions in the retrieval panel. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Heuristic drift** | Rule-based planners are transparent, but they can misroute edge-case queries until eval data is added. |
| **Operational complexity** | More routing branches increase the number of combinations that benchmarks and replay need to cover. |
