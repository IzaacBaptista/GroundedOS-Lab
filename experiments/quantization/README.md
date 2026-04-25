# quantization

Experiments with model quantization to reduce memory footprint and inference latency while preserving output quality.

## Responsibilities

- Apply and compare quantization strategies (INT8, INT4, GPTQ, AWQ)
- Measure inference speed and memory usage before and after quantization
- Evaluate quality degradation across benchmark tasks
- Document optimal quantization configurations for local deployment

## Status

First local experiment implemented - lexical vector quantization benchmark is
available.

## Environment

- Python 3.10+
- No third-party Python dependencies for the current local experiment

## Local usage

From the repository root:

```bash
npm run experiment:quantization
npx vitest run scripts/quantization-experiment.test.ts
```

The script reads `datasets/golden/phase-5-retrieval.json`, loads the registered
Phase 5 retrieval document, builds normalized lexical retrieval vectors,
quantizes them with per-vector symmetric INT8, and compares three retrieval
paths:

- FP32-style cosine baseline
- INT8 vectors dequantized before cosine search
- INT8 vectors searched directly with normalized integer dot product

It writes:

```text
datasets/experiments/phase-5/quantization/scaffold-result.json
```

Current measured result on the Phase 5 retrieval dataset:

- FP32 baseline Recall@1: `1.0`
- INT8 dequantized Recall@1: `1.0`
- INT8 direct Recall@1: `1.0`
- Golden set: `6` questions over `7` chunks
- Memory reduction: about `73.5%`
- INT8 direct search avoids the dequantization step and preserves retrieval
  quality on the current golden set

This is vector quantization for the current local RAG retrieval path, not yet
model-weight quantization. The artifact contract is the same one future model
quantization runs should preserve: input dataset, environment, precision/method
settings, quality, latency, memory and candidate-vs-baseline deltas.

The regression test runs the experiment with a temporary output path and asserts
that direct INT8 search preserves Recall@1 while reducing memory on the Phase 5
golden set.
