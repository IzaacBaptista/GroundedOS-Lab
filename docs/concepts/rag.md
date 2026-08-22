# RAG

## What it is

**Retrieval-Augmented Generation (RAG)** is a pattern where relevant external information is retrieved and inserted into the model context before generation.

## Why it matters

RAG is central to grounded AI systems because it lets answers cite project, workspace or domain evidence instead of relying only on model pretraining. It also makes answers more auditable through retrieved chunks, source attribution and lineage.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Owns chunking, embeddings, hybrid search, reranking, context assembly and (opt-in) grounded LLM generation via `generation.ts`. |
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

## RAG vs alternatives

| Alternative | When it wins instead of RAG |
|---|---|
| **Fine-tuning** | Behavior/style/format needs to change, or the same narrow domain is queried constantly — not when the underlying facts change often. |
| **Long-context (stuff everything in the prompt)** | The corpus is small enough to fit the context window and cost/latency of sending it every call is acceptable. |
| **Prompt engineering alone** | The model already has the needed knowledge in its weights; only instruction/format needs adjusting. |
| **Parametric knowledge (no retrieval)** | Facts are stable, well-known, and don't need citations or auditability. |

GroundedOS Lab defaults to RAG because the target use case (querying uploaded/local documents) has facts that change per-corpus and answers must be auditable via citations — something fine-tuning and pure parametric generation cannot give for free.
