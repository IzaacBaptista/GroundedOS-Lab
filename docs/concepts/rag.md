# RAG

## What it is

**Retrieval-Augmented Generation (RAG)** is a pattern where relevant external information is retrieved and inserted into the model context before generation.

## Why it matters

RAG is central to grounded AI systems because it lets answers cite project, workspace or domain evidence instead of relying only on model pretraining. It also makes answers more auditable through retrieved chunks, source attribution and lineage.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Owns chunking, embeddings, hybrid search, reranking and context assembly. |
| [`packages/etl`](../../packages/etl/README.md) | Produces normalized documents consumed by the retrieval pipeline. |
| [`packages/core`](../../packages/core/README.md) | Defines document types shared by ingestion and retrieval. |
| [`packages/observability`](../../packages/observability/README.md) | Traces retrieval steps and grounding signals. |
| [`packages/evals`](../../packages/evals/README.md) | Measures retrieval quality and answer faithfulness. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Freshness vs latency** | Retrieval improves freshness but adds query-time work. |
| **Recall vs precision** | Fetching more chunks may find the answer but can introduce distraction. |
| **Pipeline complexity** | RAG quality depends on ingestion, chunking, embeddings, search and reranking together. |
