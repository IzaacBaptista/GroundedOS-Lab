# distillation

Experiments in knowledge distillation, transferring capabilities from larger teacher models to smaller student models.

## Responsibilities

- Set up teacher-student training pipelines
- Generate soft labels and intermediate representations from teacher models
- Train and evaluate student models across quality and latency metrics
- Document compression ratios and capability retention results

## Status

Scaffolded - deterministic dry-run script is available.

## Environment

- Python 3.10+
- No third-party Python dependencies for the current scaffold

## Local usage

From the repository root:

```bash
npm run experiment:distillation
```

The script reads `datasets/golden/phase-0-baseline.json`, compares a teacher
baseline against a student candidate placeholder, and writes:

```text
datasets/experiments/phase-5/distillation/scaffold-result.json
```

This artifact defines the result contract for future distillation runs: input
dataset, teacher/student settings, quality, latency, compression and
candidate-vs-baseline deltas.
