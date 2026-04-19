# Temperature / Top-P / Top-K

## What it is

**Temperature**, **Top-P** and **Top-K** are decoding controls used during generation. Temperature adjusts randomness, Top-P samples from the smallest set of tokens whose cumulative probability reaches a threshold, and Top-K samples from the K most likely tokens.

## Why it matters

These controls affect reproducibility, creativity, hallucination risk and evaluation stability. Grounded systems usually prefer conservative settings for factual answers and broader sampling for exploration or synthetic data generation.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Sweeps generation parameters across prompt tests. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Can apply policy-based defaults per task or model. |
| [`packages/evals`](../../packages/evals/README.md) | Compares output quality under different decoding settings. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Measures quality and latency impacts of generation choices. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Reproducibility vs variety** | Lower randomness is easier to evaluate; higher randomness explores more outputs. |
| **Factuality risk** | Loose sampling can increase unsupported claims. |
| **Provider differences** | Models and APIs may interpret or combine decoding controls differently. |
