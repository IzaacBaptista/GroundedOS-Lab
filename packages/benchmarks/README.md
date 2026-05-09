# benchmarks

Benchmarking suite for comparing model performance across latency, cost and output quality dimensions.

## Responsibilities

- Run standardized benchmark tasks against local and cloud models
- Measure and compare latency, throughput and cost per model
- Evaluate output quality using predefined eval metrics
- Generate comparative reports and leaderboards
- Support scheduled and on-demand benchmark runs

## Status

Complete (Phases 2 and 4 baseline): retrieval and model benchmarks with
local + Ollama execution)

## Current implementation

- `npm run benchmark:hybrid` compares dense-only retrieval with hybrid retrieval
  on the Phase 0 smoke golden dataset.
- The benchmark records Recall@K, top-1 recall, mean reciprocal rank, average
  top score and expected-chunk score.
- The current Phase 2 artifact is committed at
  `datasets/golden/baselines/phase-2-hybrid-benchmark.json`.
- `npm run benchmark:models` runs the Phase 4 model/provider benchmark. It
  always runs the local extractive baseline and can run Ollama/OpenAI/Groq when
  configured.
- The current Phase 4 artifact is committed at
  `datasets/golden/baselines/phase-4-model-benchmark.json`.
- The latest run completed all three requested providers: `local-extractive`,
  `ollama` (qwen2.5:0.5b) and `groq` (llama-3.1-8b-instant, free tier).
  `phase4ModelBenchmarkPassed: true`.
- `npm run benchmark:models:precheck` validates provider readiness before a full
  benchmark run (Ollama model presence, Ollama API reachability, Groq/OpenAI quota
  probe).

## Current limits

- The Phase 0 smoke corpus has one golden query and two chunks, so Recall@3 is
  already saturated in dense-only mode.
- For this dataset, Phase 2 improvement is measured as no regression in
  Recall@3/MRR plus an improved expected-chunk score.
- Phase 4 local-vs-cloud benchmark is **complete**: `local-extractive`, `ollama`
  and `groq` all completed in the same artifact (`phase4ModelBenchmarkPassed: true`).

## Phase 4 provider configuration

Recommended flow:

```bash
# Validate provider readiness first.
npm run benchmark:models:precheck -- --providers local-extractive,ollama,groq --strict
```

```bash
# Full Phase 4 benchmark (Ollama local + Groq free-tier cloud).
npm run benchmark:models -- --providers local-extractive,ollama,groq

# Alternative: OpenAI cloud provider (requires paid quota).
OPENAI_API_KEY=... OPENAI_MODEL=gpt-5-mini npm run benchmark:models -- --providers local-extractive,ollama,openai
```
