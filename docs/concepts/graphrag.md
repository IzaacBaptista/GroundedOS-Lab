# GraphRAG

## What it is

GraphRAG builds a knowledge graph from entities and relations found in indexed content, then retrieves evidence by traversing the graph instead of relying only on flat chunk similarity.

## Why it matters

Relational questions often require multi-hop evidence. A graph makes dependencies, references and co-occurrence paths explicit and easier to explain in Dev Mode.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/graphrag`](../../packages/graphrag/src/index.ts) | Builds the graph, exposes storage/traversal abstractions and runs graph retrieval. |
| [`packages/rag`](../../packages/rag/src/retrieval.ts) | Merges graph retrieval with hybrid search and exposes traversal traces. |
| [`apps/web`](../../apps/web/src/components/tabs/ChunksTab.tsx) | Renders entity hits and traversal summaries in Dev Mode. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Extraction quality** | Graph quality is bounded by the entity extraction pipeline. |
| **Graph growth** | Co-occurrence graphs can become noisy or large if pruning is not added later. |
