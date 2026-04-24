# benchmarks

Benchmarking suite for comparing model performance across latency, cost and output quality dimensions.

## Responsibilities

- Run standardized benchmark tasks against local and cloud models
- Measure and compare latency, throughput and cost per model
- Evaluate output quality using predefined eval metrics
- Generate comparative reports and leaderboards
- Support scheduled and on-demand benchmark runs

## Status

Implemented baseline (Phase 2 retrieval benchmark)

## Current implementation

- `npm run benchmark:hybrid` compares dense-only retrieval with hybrid retrieval
  on the Phase 0 smoke golden dataset.
- The benchmark records Recall@K, top-1 recall, mean reciprocal rank, average
  top score and expected-chunk score.
- The current artifact is committed at
  `datasets/golden/baselines/phase-2-hybrid-benchmark.json`.

## Current limits

- The Phase 0 smoke corpus has one golden query and two chunks, so Recall@3 is
  already saturated in dense-only mode.
- For this dataset, Phase 2 improvement is measured as no regression in
  Recall@3/MRR plus an improved expected-chunk score.
- Broader model/provider benchmarks remain Phase 4 work.
