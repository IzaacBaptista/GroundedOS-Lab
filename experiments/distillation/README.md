# distillation

Experiments in knowledge distillation, transferring capabilities from larger teacher models to smaller student models.

## Responsibilities

- Set up teacher-student training pipelines
- Generate soft labels and intermediate representations from teacher models
- Train and evaluate student models across quality and latency metrics
- Document compression ratios and capability retention results

## Status

Complete (Phase 5 baseline): first real teacher-student distillation experiment is implemented. Uses PyTorch +
Transformers if available; falls back to deterministic scaffold otherwise.

## Environment

### Minimal (scaffold only)

- Python 3.10+

### Full (real distillation)

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
npm run experiment:distillation

# Run real distillation explicitly (requires PyTorch venv)
npm run experiment:distillation:real
```

The real script reads `datasets/golden/phase-5-retrieval.json`, loads a
teacher (`gpt2`) and student (`distilgpt2`), runs KL + cross-entropy
distillation over the instruction dataset, and writes:

```text
datasets/experiments/phase-5/distillation/result.json
```

### Measured results (gpt2 -> distilgpt2, steps=3)

- Compression rate: ~34.17%
- Student parameter count lower than teacher (as expected)
- Quality gate passed (`comparison.passed: true`)
- Regression test: `scripts/distillation-experiment.test.ts`

### Scaffold artifact (deterministic dry-run)

```text
datasets/experiments/phase-5/distillation/scaffold-result.json
```

This artifact defines the result contract for future distillation runs: input
dataset, teacher/student settings, quality, latency, compression and
candidate-vs-baseline deltas.
