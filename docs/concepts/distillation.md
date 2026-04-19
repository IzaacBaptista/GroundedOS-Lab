# Distillation

## What it is

**Distillation** trains a smaller student model to approximate the behavior of a larger teacher model.

## Why it matters

Distillation can reduce inference cost and latency while retaining useful capabilities. It fits GroundedOS Lab's focus on comparing quality, cost and performance across model choices.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`experiments/distillation`](../../experiments/distillation/README.md) | Owns teacher-student training workflows and findings. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares student models against teachers and baselines. |
| [`packages/evals`](../../packages/evals/README.md) | Measures capability retention and regressions. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Can route simple tasks to cheaper distilled models. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Compression vs capability** | Smaller students may lose reasoning depth or niche knowledge. |
| **Teacher dependence** | Student quality depends on the teacher outputs and training task design. |
| **Evaluation burden** | Compression gains must be checked against safety and grounding requirements. |
