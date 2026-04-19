# Cost Analysis

## What it is

**Cost analysis** tracks and explains the cost of AI system operations, including model calls, token usage, embeddings, reranking, storage, vector search and background processing.

## Why it matters

AI cost can grow with traffic, prompt length, retrieval depth, model choice and retries. GroundedOS Lab surfaces cost so developers can compare designs and make model-routing decisions with real data.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/observability`](../../packages/observability/README.md) | Tracks token usage, model usage and cost per request. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Uses cost constraints when selecting providers or models. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares cost against quality and latency. |
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Records experiment cost for prompt and parameter sweeps. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Cheap vs correct** | Reducing model cost can increase hallucination or tool failure risk. |
| **Granularity** | Per-stage cost tracking is useful but requires consistent instrumentation. |
| **Showback complexity** | Allocating shared infrastructure cost across users or workspaces can be approximate. |
