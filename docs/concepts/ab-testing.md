# A/B Testing

## What it is

**A/B testing** compares two or more variants under controlled conditions. In LLM systems, variants can include prompts, models, retrieval strategies, decoding parameters, rerankers or guardrail policies.

## Why it matters

Changes to AI systems often have subtle effects. A/B testing lets GroundedOS Lab compare alternatives using shared tasks, consistent metrics and recorded outputs instead of relying on anecdotal examples.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Runs prompt, model and hyperparameter comparisons. |
| [`packages/evals`](../../packages/evals/README.md) | Scores variants with automatic quality metrics. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Can compare routing policies and provider choices. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Reports performance comparisons across variants. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Statistical confidence** | Small sample sizes can produce misleading winners. |
| **Metric choice** | Optimizing one metric can regress another, such as cost or safety. |
| **Reproducibility** | Probabilistic generation requires controlled seeds or repeated runs. |
