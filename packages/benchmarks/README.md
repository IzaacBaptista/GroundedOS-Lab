# benchmarks

Benchmarking suite for comparing model performance across latency, cost and output quality dimensions.

## Responsibilities

- Run standardized benchmark tasks against local and cloud models
- Measure and compare latency, throughput and cost per model
- Evaluate output quality using predefined eval metrics
- Generate comparative reports and leaderboards
- Support scheduled and on-demand benchmark runs

## Status

Implemented baseline (Phase 2 retrieval benchmark, Phase 4 model benchmark with
local + Ollama execution)

## Current implementation

- `npm run benchmark:hybrid` compares dense-only retrieval with hybrid retrieval
  on the Phase 0 smoke golden dataset.
- The benchmark records Recall@K, top-1 recall, mean reciprocal rank, average
  top score and expected-chunk score.
- The current Phase 2 artifact is committed at
  `datasets/golden/baselines/phase-2-hybrid-benchmark.json`.
- `npm run benchmark:models` runs the Phase 4 model/provider benchmark. It
  always runs the local extractive baseline and can run Ollama/OpenAI when
  configured.
- The current Phase 4 baseline artifact is committed at
  `datasets/golden/baselines/phase-4-model-benchmark.json`.
- In the latest run, `local-extractive` and `ollama` completed; `openai`
  returned `429 insufficient_quota`.

## Current limits

- The Phase 0 smoke corpus has one golden query and two chunks, so Recall@3 is
  already saturated in dense-only mode.
- For this dataset, Phase 2 improvement is measured as no regression in
  Recall@3/MRR plus an improved expected-chunk score.
- Phase 4 local-vs-cloud success is not complete until at least one local model
  provider and one cloud provider complete in the same benchmark artifact.
- Current Phase 4 blocker is cloud provider quota/billing for OpenAI in this
  environment.

## Phase 4 provider configuration

```bash
# Local baseline only; Ollama/OpenAI are recorded as skipped if not configured.
npm run benchmark:models

# Ollama generation benchmark.
GROUNDEDOS_OLLAMA_GENERATE_MODEL=qwen2.5:0.5b npm run benchmark:models -- --providers local-extractive,ollama

# OpenAI cloud benchmark using the Responses API.
OPENAI_API_KEY=... OPENAI_MODEL=gpt-5-mini npm run benchmark:models -- --providers local-extractive,openai

# Roadmap target: Ollama generation plus one cloud provider in the same artifact.
GROUNDEDOS_OLLAMA_GENERATE_MODEL=qwen2.5:0.5b \
OPENAI_API_KEY=... \
OPENAI_MODEL=gpt-5-mini \
npm run benchmark:models -- --providers local-extractive,ollama,openai
```
