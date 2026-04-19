# Local Models

## What it is

**Local models** run on infrastructure controlled by the developer or organization instead of through a hosted model API. They may be open-weight LLMs, embedding models, rerankers or specialized classifiers.

## Why it matters

Local execution supports the project's local-first philosophy. It enables cheaper experiments, data control, offline development and deeper inspection of model behavior, while still allowing cloud models for tasks that need stronger capability.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/model-routing`](../../packages/model-routing/README.md) | Routes between local and cloud execution paths. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Measures local vs cloud latency, cost and quality. |
| [`experiments/quantization`](../../experiments/quantization/README.md) | Makes local models smaller and faster to serve. |
| [`packages/observability`](../../packages/observability/README.md) | Tracks model usage and performance across providers. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Control vs maintenance** | Local models improve control but require serving, upgrades and hardware management. |
| **Privacy vs capability** | Local inference can protect data, but hosted frontier models may outperform. |
| **Hardware limits** | Memory and compute constraints shape model size and throughput. |
