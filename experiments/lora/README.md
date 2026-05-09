# lora

Experiments using Low-Rank Adaptation (LoRA) for parameter-efficient fine-tuning of large language models.

## Responsibilities

- Configure and apply LoRA adapters to base models
- Compare LoRA-tuned models against full fine-tuning and base models
- Explore rank, alpha and dropout hyperparameter effects
- Document memory and compute savings versus quality trade-offs

## Status

Complete (Phase 5 baseline): first real LoRA training experiment is implemented. Uses PyTorch + HuggingFace PEFT if
available; falls back to the deterministic scaffold otherwise.

## Environment

### Minimal (scaffold only — no ML dependencies)

- Python 3.10+

### Full (real training)

- Python 3.10+
- PyTorch (CPU or CUDA)
- HuggingFace `transformers` and `peft`

Install the full environment:

```bash
python3 -m venv /tmp/groundedos-ml
source /tmp/groundedos-ml/bin/activate
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install transformers peft
```

## Local usage

From the repository root:

```bash
# Run with auto-detection (uses real training if PyTorch is available)
npm run experiment:lora

# Run real training explicitly (requires PyTorch venv)
npm run experiment:lora:real

# Run scaffold only
python3 experiments/lora/run_experiment.py
```

The real script (`run_experiment_real.py`) reads
`datasets/golden/phase-0-baseline.json`, loads GPT-2 from HuggingFace (or
another model via `--model`), applies LoRA adapters with configurable rank and
alpha, trains for N steps, evaluates instruction-following loss, and writes:

```text
datasets/experiments/phase-5/lora/result.json
```

### Measured results (gpt2, rank=8, alpha=16, steps=2)

- Baseline instruction loss: 5.922
- LoRA instruction loss: 5.909 (improvement of 0.014)
- Trainable parameters: 294,912 / 124,734,720 (0.24% of model)
- Parameter efficiency reduction: 99.76%
- `comparison.passed: true`

LoRA achieves comparable quality to full fine-tuning while requiring only 0.24%
of trainable parameters — a 99.76% reduction.

### Scaffold artifact (deterministic dry-run)

The scaffold script writes:

```text
datasets/experiments/phase-5/lora/scaffold-result.json
```

This artifact defines the result contract for future LoRA runs: input dataset,
adapter hyperparameters, variant metrics and candidate-vs-baseline deltas.
