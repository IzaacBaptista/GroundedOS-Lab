# Evaluation Strategy

This document defines how GroundedOS Lab decides whether a response is good. It covers the golden dataset, expected outputs, metrics, and the baseline measurement process used before and after each phase.

Without this, "evals" is just a word. With it, every phase has a measurable definition of quality improvement.

---

## Core principle

Every metric must be computable from the output of the [core product loop](../README.md#-core-product-loop):

```
question → retrieved chunks → generated answer → sources
```

If a metric cannot be measured from these four things, it is out of scope until the loop is extended.

---

## Golden dataset

The golden dataset is the single source of truth for evaluating the RAG pipeline. It lives in `datasets/golden/` and is versioned alongside the code.

### Schema

Each entry in the golden dataset is a JSON object:

```json
{
  "id": "gd-001",
  "question": "What does the smoke command verify?",
  "document_ref": "phase-0-smoke-text",
  "expected_answer_contains": ["ETL dispatcher", "NormalizedDocument"],
  "expected_chunk_ids": ["smoke-text-001:section-2:chunk-1"],
  "expected_sources": [
    {
      "documentId": "smoke-text-001",
      "sectionId": "section-2"
    }
  ],
  "notes": "Phase 0 baseline question. Answer must cite the ETL dispatcher."
}
```

| Field | Required | Purpose |
|---|---|---|
| `id` | Yes | Stable identifier for tracking regressions |
| `question` | Yes | The exact question to ask the system |
| `document_ref` | Yes | Dataset registry key for the source document |
| `expected_answer_contains` | Yes | Strings that must appear in a correct answer |
| `expected_chunk_ids` | Yes | Chunk IDs that must be in the top-K retrieved results |
| `expected_sources` | Yes | Source attribution that must appear in the Dev Mode output |
| `notes` | No | Human notes about what makes this question interesting or hard |

### Phase 0–1 baseline entries

The Phase 0 smoke dataset provides the first golden entry. It covers:

- Retrieval from a multi-section document where the relevant answer is in a later section

Future golden entries should add:

- Direct factual retrieval from a single-section document
- Edge case: question with no relevant content in the document (expected: no answer, not hallucination)

Location: `datasets/golden/phase-0-baseline.json`

---

## Metrics

### Retrieval metrics (measurable today)

| Metric | Definition | Target | How to measure |
|---|---|---|---|
| **Recall@K** | Fraction of expected chunk IDs found in the top-K results | ≥ 0.8 at K=3 | Compare `expected_chunk_ids` against retrieved chunk IDs |
| **Precision@K** | Fraction of retrieved chunks that are in `expected_chunk_ids` | ≥ 0.6 at K=3 | Same comparison |
| **Source hit rate** | Fraction of queries where at least one expected source appears | ≥ 0.9 | Compare `expected_sources` against Dev Mode output |

### Answer quality metrics (require LLM judge, Phase 3+)

| Metric | Definition | Target | Notes |
|---|---|---|---|
| **Faithfulness** | Answer claims are supported by retrieved chunks | ≥ 0.85 | Use LLM judge: "Is this claim supported by the given context?" |
| **Answer relevance** | Answer addresses the question asked | ≥ 0.80 | Use LLM judge or embedding similarity |
| **Hallucination rate** | Fraction of claims not grounded in retrieved context | ≤ 0.10 | Inverse of faithfulness |

### Operational metrics (measurable today via Dev Mode output)

| Metric | Definition | Target | How to measure |
|---|---|---|---|
| **End-to-end latency** | Time from request to first byte of response | < 2 s (local, p95) | Log timestamps at request start and response end |
| **Retrieval latency** | Time spent in vector search | < 200 ms (local, p95) | Log before/after `vectorStore.search()` |
| **Token count** | Tokens in the prompt + completion | Tracked, no hard target yet | Sum from LLM provider response |
| **Estimated cost** | USD per request based on token count and model price | Tracked, no hard target yet | `tokens × price_per_token` |

---

## Baselines

A baseline is a snapshot of all metrics measured at the **end of each phase**, run against the full golden dataset. It is committed to `datasets/golden/baselines/` as a JSON file named `phase-N-baseline.json`.

Before any phase improvement is declared complete, its success criteria must be verified by comparing the new metrics against the previous baseline.

### Baseline file schema

```json
{
  "phase": 1,
  "date": "2026-01-01",
  "commit": "abc1234",
  "embedding_provider": "api-lexical",
  "topK": 3,
  "golden_dataset": "datasets/golden/phase-0-baseline.json",
  "metrics": {
    "recall_at_3": 0.82,
    "precision_at_3": 0.61,
    "source_hit_rate": 0.94,
    "p95_latency_ms": 180,
    "p95_retrieval_latency_ms": 42
  }
}
```

### Current baseline

Phase 1 metric baseline: *not yet measured* — will be recorded at `datasets/golden/baselines/phase-1-baseline.json` before Phase 2 work begins.

---

## What "good" looks like per phase

### Phase 1 — Core RAG

- Recall@3 ≥ 0.8 on the Phase 0 golden entries
- All answers cite at least one source from `expected_sources`
- No hallucinated answers on the Phase 0 smoke dataset (extractive answers only, no generation yet)

### Phase 2 — Retrieval Quality

- Recall@3 improves by ≥ 10 percentage points vs Phase 1 baseline when hybrid search is enabled
- Retrieval latency per request is logged and within target
- Baseline file committed at `datasets/golden/baselines/phase-2-baseline.json`

### Phase 3 — Intelligence

- Faithfulness ≥ 0.85 on the golden dataset using the LLM judge
- Hallucination rate ≤ 0.10
- Baseline file committed at `datasets/golden/baselines/phase-3-baseline.json`
- Guardrails: all entries in the threat matrix (see [`docs/concepts/guardrails.md`](./concepts/guardrails.md)) have at least one test fixture

### Phase 4+ — Lab and Advanced ML

- Each new provider or technique is evaluated against the current baseline before being declared an improvement
- All benchmarks use the same golden dataset version for cross-phase comparability

---

## Running evals

### Today (Phase 1, manual)

```bash
# Ask against the golden dataset entries manually
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text \
  --query "What does the smoke command verify?"

# Compare retrieved chunk IDs in the output against expected_chunk_ids in the golden dataset
```

### Phase 3 (automated, planned)

```bash
# Run the full golden dataset eval and print a metrics summary
npm run eval:golden -- --dataset datasets/golden/phase-0-baseline.json

# Output: per-entry pass/fail, aggregate metrics, comparison to previous baseline
```

---

## Adding to the golden dataset

1. Write a new entry following the schema above.
2. Include at least one "interesting" case: a question that is hard to retrieve, an answer that spans multiple chunks, or a question with no good answer in the corpus.
3. Run the eval before and after any retrieval change to verify no regressions.
4. Commit the new entry alongside the code change that motivated it.
