# Quantization

## What it is

**Quantization** reduces the numerical precision of model weights or activations, commonly from floating point to lower-bit formats such as INT8 or INT4.

## Why it matters

Quantization is one of the main techniques for running larger models locally with lower memory usage and faster inference. It is essential for comparing local-first deployments against cloud APIs in a practical lab setting.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`experiments/quantization`](../../experiments/quantization/README.md) | Compares quantization strategies and their quality impact. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Can route to quantized local variants based on policy. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Measures latency, memory and quality trade-offs. |
| [`experiments/lora`](../../experiments/lora/README.md) | Can be combined with adapter-based training in local workflows. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Memory vs quality** | Lower precision saves memory but can degrade output quality. |
| **Speed vs compatibility** | Some quantized formats require specific runtimes or hardware support. |
| **Evaluation need** | Small benchmark changes can hide domain-specific quality regressions. |
