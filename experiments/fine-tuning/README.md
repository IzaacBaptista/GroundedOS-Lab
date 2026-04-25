# fine-tuning

Experiments focused on supervised fine-tuning of language models on domain-specific datasets.

## Responsibilities

- Prepare and format training datasets for instruction fine-tuning
- Run and track fine-tuning jobs with configurable hyperparameters
- Evaluate fine-tuned models against base model baselines
- Document findings on quality, cost and compute trade-offs

## Status

First real SFT experiment implemented. Uses PyTorch + HuggingFace Transformers
if available; falls back to the deterministic scaffold otherwise.

## Environment

### Minimal (scaffold only)

- Python 3.10+

### Full (real SFT)

- Python 3.10+
- PyTorch (CPU or CUDA)
- HuggingFace `transformers`

Install the full environment:

```bash
python3 -m venv /tmp/groundedos-ml
source /tmp/groundedos-ml/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers
```

## Local usage

From the repository root:

```bash
# Auto-detects PyTorch; uses SFT if available, scaffold otherwise
npm run experiment:fine-tuning

# Run real SFT explicitly (requires PyTorch venv)
npm run experiment:fine-tuning:real
```

The real SFT script reads `datasets/golden/phase-5-retrieval.json` (6 Q&A
pairs), loads GPT-2, fine-tunes **all** model parameters with AdamW (lr=2e-5),
and writes:

```text
datasets/experiments/phase-5/fine-tuning/result.json
```

### Measured results (gpt2, lr=2e-5, steps=3)

- Baseline instruction loss: 5.49
- SFT instruction loss: 5.01 (improvement ≈ 0.48)
- Trainable parameters: 124,439,808 / 124,439,808 (**100% of model**)
- `comparison.passed: true`

### SFT vs LoRA comparison

| Approach | Trainable params | Loss improvement | Compute cost |
|---|---|---|---|
| **SFT (this track)** | 100% (124M) | 0.48 | High |
| **LoRA (lora track)** | 0.24% (294k) | 0.014 | Low |

SFT converges faster with enough data; LoRA is preferred for
compute-constrained environments and large base models.

### Scaffold artifact (deterministic dry-run, no ML required)

```text
datasets/experiments/phase-5/fine-tuning/scaffold-result.json
```
