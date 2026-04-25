# fine-tuning

Experiments focused on supervised fine-tuning of language models on domain-specific datasets.

## Responsibilities

- Prepare and format training datasets for instruction fine-tuning
- Run and track fine-tuning jobs with configurable hyperparameters
- Evaluate fine-tuned models against base model baselines
- Document findings on quality, cost and compute trade-offs

## Status

Scaffolded - deterministic dry-run script is available.

## Environment

- Python 3.10+
- No third-party Python dependencies for the current scaffold

## Local usage

From the repository root:

```bash
npm run experiment:fine-tuning
```

The script reads `datasets/golden/phase-0-baseline.json`, compares a baseline
instruction model against an SFT candidate placeholder, and writes:

```text
datasets/experiments/phase-5/fine-tuning/scaffold-result.json
```

This artifact defines the result contract for future real fine-tuning runs:
input dataset, hyperparameters, variant metrics and candidate-vs-baseline
deltas.
