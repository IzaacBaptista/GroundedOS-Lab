# lora

Experiments using Low-Rank Adaptation (LoRA) for parameter-efficient fine-tuning of large language models.

## Responsibilities

- Configure and apply LoRA adapters to base models
- Compare LoRA-tuned models against full fine-tuning and base models
- Explore rank, alpha and dropout hyperparameter effects
- Document memory and compute savings versus quality trade-offs

## Status

Scaffolded - deterministic dry-run script is available.

## Environment

- Python 3.10+
- No third-party Python dependencies for the current scaffold

## Local usage

From the repository root:

```bash
npm run experiment:lora
```

The script reads `datasets/golden/phase-0-baseline.json`, compares a baseline
instruction model against a LoRA candidate placeholder, and writes:

```text
datasets/experiments/phase-5/lora/scaffold-result.json
```

This artifact defines the result contract for future LoRA runs: input dataset,
adapter hyperparameters, variant metrics and candidate-vs-baseline deltas.
