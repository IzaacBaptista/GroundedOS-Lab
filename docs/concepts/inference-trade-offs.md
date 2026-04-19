# Inference Trade-offs

## What it is

**Inference trade-offs** are the practical choices made when serving model outputs: model size, local vs cloud execution, token budget, decoding parameters, latency targets, cost ceilings and reliability requirements.

## Why it matters

AI systems are rarely optimized for one dimension. A cheap model may fail quality checks, a strong model may be slow, and a long context may improve recall while increasing cost. GroundedOS Lab exposes these trade-offs so they can be measured instead of guessed.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/model-routing`](../../packages/model-routing/README.md) | Encodes policy decisions across providers and models. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares latency, throughput, cost and quality. |
| [`packages/observability`](../../packages/observability/README.md) | Records real request metrics for routing decisions. |
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Runs controlled sweeps over prompts, models and parameters. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Cost vs quality** | Cheaper inference can require stronger retrieval, prompts or fallback rules. |
| **Latency vs completeness** | More retrieval, validation and generation tokens slow responses. |
| **Simplicity vs resilience** | Single-provider setups are easier but less robust than routed fallback systems. |
