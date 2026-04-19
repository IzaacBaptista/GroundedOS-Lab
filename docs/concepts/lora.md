# LoRA

## What it is

**LoRA (Low-Rank Adaptation)** is a parameter-efficient fine-tuning technique that trains small adapter matrices while keeping most base model weights frozen.

## Why it matters

LoRA makes model adaptation more accessible by reducing memory and compute requirements. It is useful for experiments where full fine-tuning is too expensive or unnecessary.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`experiments/lora`](../../experiments/lora/README.md) | Owns adapter configuration, training and comparison. |
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Provides the baseline for comparing full tuning vs adapter tuning. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Measures tuned model quality, latency and cost. |
| [`experiments/quantization`](../../experiments/quantization/README.md) | Can combine local compression with adapter workflows. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Efficiency vs ceiling** | LoRA is cheaper than full tuning but may not match full fine-tuning on all tasks. |
| **Adapter management** | Multiple adapters need clear versioning and routing. |
| **Compatibility** | LoRA setup depends on model architecture and runtime support. |
