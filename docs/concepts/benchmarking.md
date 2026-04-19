# Benchmarking

## What it is

**Benchmarking** is the systematic comparison of models, prompts or pipeline configurations across standardized tasks and metrics.

## Why it matters

Benchmarks turn design debates into measurable comparisons. In GroundedOS Lab they connect quality, latency, throughput and cost so contributors can compare local models, cloud models, RAG variants and tuned models.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Owns standardized benchmark tasks and reports. |
| [`packages/evals`](../../packages/evals/README.md) | Supplies quality metrics used inside benchmarks. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Uses benchmark results to inform routing policies. |
| [`experiments/quantization`](../../experiments/quantization/README.md) | Compares compressed models against baselines. |
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Compares tuned models against base models. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Synthetic vs real workloads** | Benchmarks are useful only if they represent expected tasks. |
| **Leaderboard bias** | Optimizing for a benchmark can miss production needs. |
| **Repeatability** | Model updates and stochastic generation can make results drift over time. |
