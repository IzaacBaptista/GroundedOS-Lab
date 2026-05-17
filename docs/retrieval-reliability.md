# Retrieval Reliability & Evaluation Systems

This phase adds reliability analysis on top of the existing RAG and agent stack
without replacing the current pipeline.

## What was added

- **Retrieval Failure Taxonomy**
  - `NOT_FOUND`
  - `WRONG_CONTEXT`
  - `PARTIAL_CONTEXT`
  - `UNGROUNDED_ANSWER`
  - `LOW_CONFIDENCE`
- **Confidence Calibration**
  - `confidenceScore`
  - `confidenceLevel`
  - `confidenceReasoning`
- **Deterministic Replay**
  - versioned replay snapshots in Dev Mode
  - historical replay creation from stored traces
  - structured replay comparison report
- **Corpus Drift Detection**
  - golden-query snapshot + temporal comparison report
- **Prompt / Policy Diff Testing**
  - structured comparison report for prompt, policy, and retrieval variants

## Architecture

The implementation is incremental:

- `apps/api/src/rag-service.ts`
  enriches the existing Dev Mode response with reliability metadata
- `apps/api/src/retrieval-reliability.ts`
  owns taxonomy, confidence, replay, drift, and diff report generation
- `apps/api/src/observability/trace-builders.ts`
  persists taxonomy/confidence/replay metadata to traces
- `scripts/replay-rag-query.ts`
  replays historical queries and produces a replay report
- `scripts/detect-corpus-drift.ts`
  benchmarks golden queries over time and produces a drift report
- `scripts/prompt-policy-diff.ts`
  compares prompt/policy/retrieval variants under controlled conditions

## Dev Mode fields

The RAG response now exposes:

- `devMode.evals.taxonomy`
- `devMode.evals.confidence`
- `devMode.retrievalDiagnostics`
- `devMode.replay`
- `devMode.reportReferences`

These fields are also written to structured traces for observability.

## How to run

### Replay

```bash
npm run rag:replay -- \
  --content-file datasets/samples/phase-0-smoke.txt \
  --query "What does this command verify?"
```

For persisted indexes:

```bash
npm run rag:replay -- \
  --document-id <persisted-document-id> \
  --query "What does this command verify?"
```

Create a replay snapshot from a historical trace:

```bash
npm run rag:replay -- \
  --trace-id <original-trace-id> \
  --create-only \
  --snapshot-out /tmp/replay-snapshot.json
```

Execute replay from a stored snapshot:

```bash
npm run rag:replay -- \
  --snapshot-file /tmp/replay-snapshot.json \
  --output /tmp/replay-report.json
```

Inline snapshots still need the original file path at execution time:

```bash
npm run rag:replay -- \
  --snapshot-file /tmp/inline-replay-snapshot.json \
  --content-file datasets/samples/phase-0-smoke.txt
```

### Corpus drift

```bash
npm run benchmark:drift -- --dataset phase-5-retrieval-text
```

Outputs:

- `datasets/golden/baselines/retrieval-drift-snapshot.json`
- `datasets/golden/baselines/retrieval-drift-report.json`

### Prompt / policy diff

```bash
npm run experiment:prompts:diff -- --dataset phase-5-retrieval-text
```

Output:

- `datasets/golden/baselines/prompt-policy-diff-report.json`

## How to interpret reports

### Taxonomy

- `NOT_FOUND`: retrieval failed to surface enough evidence
- `WRONG_CONTEXT`: the system found context, but it likely does not match the question
- `PARTIAL_CONTEXT`: only part of the evidence was recovered
- `UNGROUNDED_ANSWER`: the answer went beyond the retrieved evidence
- `LOW_CONFIDENCE`: evidence is weak, narrow, or conflicting

### Confidence

`confidenceScore` is calibrated from:

- retrieval scores
- source diversity
- groundedness / faithfulness
- answer coverage
- evidence quantity
- conflict penalty

It is intentionally not based on a model score alone.

### Replay report

Replay reports compare:

- response changes
- retrieval changes
- chunk ordering changes
- score deltas
- groundedness changes
- cost deltas
- latency deltas
- model/provider drift
- replay errors when the snapshot is incomplete

### Drift report

Drift reports highlight:

- affected query
- previous recall
- current recall
- rank change
- missing relevant chunks
- likely responsible document IDs

### Diff report

Diff reports compare:

- quality
- groundedness
- recall
- latency
- cost
- refusal rate
- stability
- answer changes

## Examples

### Example taxonomy

```json
{
  "category": "NOT_FOUND",
  "probableCause": "Retrieval returned no sufficiently relevant chunk for the question."
}
```

### Example confidence

```json
{
  "confidenceScore": 0.842,
  "confidenceLevel": "HIGH"
}
```

### Example drift summary

```json
{
  "degraded": false,
  "regressions": 0,
  "improvements": 0
}
```

### Example diff summary

```json
{
  "winner": "baseline-hybrid",
  "comparedVariants": ["baseline-hybrid", "strict-grounding-policy", "dense-retrieval-baseline"]
}
```

### Example replay metadata

```json
{
  "correlation": {
    "requestId": "req-123",
    "traceId": "trace-123"
  },
  "indexRef": {
    "indexId": "doc-1",
    "indexVersion": "1",
    "snapshotId": "2026-05-17T23:00:00.000Z"
  },
  "generation": {
    "strategy": "extractive-grounded",
    "deterministic": true
  }
}
```

## Current limitations

- Taxonomy is heuristic and intentionally explainable rather than opaque.
- Replay is fully reproducible for persisted indexes when the recorded index path is still available.
- Inline replay still needs the original file path because the snapshot does not persist raw content by default.
- Session-scoped memory can still affect replays when the original request depended on evolving session state.
- Drift detection is driven by the versioned golden dataset; sparse golden coverage limits sensitivity.
- Prompt/policy diff cost is zero for deterministic local variants because no external model is invoked.

## Recommended next steps

- Expand the golden dataset with harder negative and multi-hop queries.
- Persist replay inputs for inline requests when privacy and storage policy allow it.
- Add CI gates for drift and diff regressions once the golden dataset is larger.
- Add optional provider-backed replay for non-deterministic generation experiments.
