# RAPTOR

## What it is

RAPTOR is a hierarchical retrieval strategy that summarizes clusters recursively and retrieves coarse summaries before drilling down into fine-grained chunks.

## Why it matters

Long documents often benefit from summary-first navigation. RAPTOR helps compress context and keeps the system explainable by showing which summary nodes led to the final chunks.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/src/advanced-retrieval.ts) | Builds a lightweight hierarchy of summaries and retrieval paths. |
| [`packages/rag`](../../packages/rag/src/retrieval.ts) | Uses summary nodes as another retrieval signal in the fusion stage. |
| [`apps/web`](../../apps/web/src/components/tabs/ChunksTab.tsx) | Displays selected hierarchy nodes in Dev Mode. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Summary loss** | Abstractive or compressed summaries can omit details needed for precise grounding. |
| **Indexing overhead** | Building and updating the hierarchy adds work during indexing. |
