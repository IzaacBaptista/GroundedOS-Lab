# Hugging Face

## What it is

**Hugging Face** is an open-source ecosystem for sharing models, datasets, tokenizers, inference tooling and training libraries. It is commonly used to discover open-weight models and reproducible ML workflows.

## Why it matters

GroundedOS Lab has a local-first philosophy. Open-source model ecosystems make it possible to compare local and cloud models, inspect model cards, run quantization experiments and build reproducible adaptation workflows.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/model-routing`](../../packages/model-routing/README.md) | Can route to local open-weight models as providers are added. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares local models against cloud baselines. |
| [`experiments/quantization`](../../experiments/quantization/README.md) | Studies compression strategies for open-weight models. |
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Can use open datasets and model checkpoints for adaptation. |
| [`experiments/lora`](../../experiments/lora/README.md) | Applies adapter training to compatible open-weight models. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Openness vs curation** | Model availability is high, but quality, licensing and safety vary. |
| **Reproducibility** | Versions, revisions and datasets must be pinned for stable experiments. |
| **Operations** | Running open models locally requires GPU, memory and dependency planning. |
