# Corpus Drift Detection

This document describes how to use the Corpus Drift Detection system to monitor
recall quality over time as new documents are ingested into the retrieval index.

## Overview

Corpus Drift Detection compares retrieval recall on a fixed set of **golden
queries** before and after ingestion events. It highlights queries whose recall
changed, assigns severity levels to regressions, identifies possibly responsible
documents, and emits structured recommendations.

The detection pipeline is deliberately decoupled from the main RAG pipeline:
it does not modify any production code path and does not require a running
server.

---

## How to create golden queries

Golden queries live in `datasets/golden/`. Each file contains a JSON object
with a `version`, `description`, and an `entries` array.

Each entry must include:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✓ | Unique stable identifier (e.g. `p5-gd-001`) |
| `question` | `string` | ✓ | The canonical question |
| `document_ref` | `string` | ✓ | Dataset ID this question targets |
| `expected_chunk_ids` | `string[]` | ✓ | Chunk IDs that should appear in results |
| `expected_answer_contains` | `string[]` | ✓ | Key phrases expected in the answer |
| `expected_sources` | `Array<{documentId, sectionId}>` | ✓ | Expected source locations |
| `expected_answer_hints` | `string[]` | | Ideal answer text fragments |
| `tags` | `string[]` | | Thematic labels (e.g. `["retrieval", "hybrid"]`) |
| `priority` | `"critical"\|"high"\|"medium"\|"low"` | | Importance level |
| `notes` | `string` | | Human-readable notes |

### Example entry

```json
{
  "id": "p5-gd-002",
  "question": "What does hybrid retrieval blend with sparse lexical scoring?",
  "document_ref": "phase-5-retrieval-text",
  "expected_answer_contains": ["dense vector similarity", "sparse lexical scoring"],
  "expected_chunk_ids": ["phase-5-retrieval-001:section-3:chunk-1"],
  "expected_sources": [{ "documentId": "phase-5-retrieval-001", "sectionId": "section-3" }],
  "expected_answer_hints": [
    "Hybrid retrieval blends dense vector similarity with sparse lexical scoring."
  ],
  "tags": ["retrieval", "hybrid", "lexical", "dense"],
  "priority": "critical",
  "notes": "Targets the hybrid retrieval section."
}
```

Good golden queries are:
- **Targeted** — each query points at a specific, narrow chunk
- **Stable** — the expected chunk content should not change often
- **Diverse** — cover different sections, topics, and difficulty levels
- **Prioritised** — mark queries that are essential to core functionality as `critical`

---

## How to create a baseline

A **baseline** is a snapshot of recall scores taken on the current index state.
It becomes the reference point for all future drift checks.

Run:

```bash
npm run benchmark:drift -- --dataset phase-5-retrieval-text
```

This writes two files:

| File | Description |
|---|---|
| `datasets/golden/baselines/retrieval-drift-snapshot.json` | Per-query recall snapshot (the baseline) |
| `datasets/golden/baselines/retrieval-drift-report.json` | Drift report comparing to any previous snapshot |

On the first run (no previous snapshot), all queries will be `stable` and the
report will contain `"baselineId": "no-baseline"`.

On subsequent runs, the previous snapshot is loaded automatically and compared
against the new snapshot.

### Options

```
--dataset, -d <id>   Dataset ID from datasets/registry.json (default: phase-5-retrieval-text)
--top-k, -k <n>      Number of chunks to retrieve per query (default: 3)
--snapshot <path>    Custom snapshot output path
--report <path>      Custom report output path
--help, -h           Show help
```

---

## How to run a drift check

After ingesting new documents or modifying the index:

```bash
npm run benchmark:drift -- --dataset phase-5-retrieval-text
```

The tool:
1. Reads the current saved snapshot as the **baseline**
2. Runs all golden queries against the freshly built index
3. Computes `recallAtK` and rank for each query
4. Compares against baseline values
5. Assigns severity levels to regressions
6. Writes an updated snapshot and a new drift report

### Via the REST API

Start the API server, then:

```bash
# Read the most recently saved drift report
GET /rag/metrics/corpus-drift

# Trigger a new drift check run (uses default dataset and paths)
POST /rag/metrics/corpus-drift/run
Content-Type: application/json
{ "dataset": "phase-5-retrieval-text", "topK": 3 }

# Save current run as the new baseline
POST /rag/metrics/corpus-drift/baseline
Content-Type: application/json
{ "dataset": "phase-5-retrieval-text" }
```

---

## How to interpret the drift report

### Top-level fields

| Field | Description |
|---|---|
| `driftReportId` | Unique UUID generated for each report |
| `baselineId` | Deterministic 16-char hex derived from the previous snapshot; `"no-baseline"` when there is no previous |
| `currentRunId` | Unique UUID for this run |
| `indexId` | The index or dataset identifier |
| `dataset` | Dataset ID |
| `baselineCreatedAt` | Timestamp of the snapshot used as baseline |
| `currentCreatedAt` | Timestamp of the current snapshot |
| `summary.degraded` | `true` when one or more regressions were found |
| `summary.regressions` | Count of regressed queries |
| `summary.improvements` | Count of improved queries |
| `summary.missingRelevantChunks` | Total missing chunk count across all queries |
| `affectedQueries` | IDs of queries with any status change |
| `degradedQueries` | IDs of regressed queries |
| `improvedQueries` | IDs of improved queries |
| `recommendations` | Actionable text strings generated from the analysis |

### Per-query fields

| Field | Description |
|---|---|
| `id` | Query ID |
| `question` | The query text |
| `recallPrevious` | Recall@K in the baseline |
| `recallCurrent` | Recall@K in the current run |
| `difference` | `recallCurrent − recallPrevious` (negative = regression) |
| `rankPrevious` | 1-based rank of the first expected chunk in baseline; `null` if not found |
| `rankCurrent` | 1-based rank of the first expected chunk now; `null` if not found |
| `missingRelevantChunks` | Expected chunks absent from current results |
| `possibleResponsibleDocuments` | Document IDs extracted from missing chunk IDs |
| `relatedIngestion` | Timestamp of the ingestion event passed via `--ingest-at` (optional) |
| `severity` | `"critical" \| "high" \| "medium" \| "low"` |
| `status` | `"regressed" \| "improved" \| "stable"` |

### Severity levels

Severity is assigned only to regressed queries:

| Severity | Condition |
|---|---|
| `critical` | `difference ≤ −0.5` (recall fell by 50 % or more) |
| `high` | `−0.5 < difference ≤ −0.25` (fell by 25–50 %) |
| `medium` | `difference < 0` and above thresholds (fell by less than 25 %) |
| `low` | Query is not regressed |

A rank regression (expected chunk slid down the ranking without recall changing)
also marks the query as `regressed`.

### Example drift report (regression scenario)

```json
{
  "version": "v1",
  "driftReportId": "a1b2c3d4-...",
  "baselineId": "4f9a2e1c8b3d7f0a",
  "currentRunId": "e5f6a7b8-...",
  "indexId": "phase-5-retrieval-text",
  "dataset": "phase-5-retrieval-text",
  "baselineCreatedAt": "2026-05-01T00:00:00.000Z",
  "currentCreatedAt": "2026-05-10T12:00:00.000Z",
  "summary": {
    "degraded": true,
    "queriesEvaluated": 6,
    "regressions": 1,
    "improvements": 0,
    "missingRelevantChunks": 1
  },
  "affectedQueries": ["p5-gd-002"],
  "degradedQueries": ["p5-gd-002"],
  "improvedQueries": [],
  "recommendations": [
    "Review 1 regressed query and identify recently ingested documents that may interfere with retrieval.",
    "1 critical regression detected — consider blocking the ingestion or rolling back the index.",
    "1 expected chunk is no longer surfaced — verify chunking and embedding pipeline integrity."
  ],
  "queries": [
    {
      "id": "p5-gd-002",
      "question": "What does hybrid retrieval blend with sparse lexical scoring?",
      "recallPrevious": 1,
      "recallCurrent": 0,
      "difference": -1,
      "rankPrevious": 1,
      "rankCurrent": null,
      "missingRelevantChunks": ["phase-5-retrieval-001:section-3:chunk-1"],
      "possibleResponsibleDocuments": ["phase-5-retrieval-001"],
      "severity": "critical",
      "status": "regressed",
      "timestamp": "2026-05-10T12:00:00.000Z"
    }
  ]
}
```

---

## Limitations

- Drift detection is driven by the golden dataset. Sparse golden coverage limits
  sensitivity — add more queries targeting critical sections to improve coverage.
- The lexical embedding provider used by the CLI script is deterministic but
  different from dense/neural embedding providers. Results reflect lexical recall,
  not semantic recall.
- Baseline snapshots are stored as flat JSON files. There is no versioned history
  beyond the most recent snapshot; the previous snapshot is overwritten each run.
- The `relatedIngestion` field is only populated when `--ingest-at` is explicitly
  passed; the tool does not automatically detect which ingestion caused a regression.
- The REST API endpoints (`POST /rag/metrics/corpus-drift/run` and
  `POST /rag/metrics/corpus-drift/baseline`) are thin wrappers that invoke the
  CLI script. They run synchronously and may time out for large datasets.

---

## Next steps

- Add more golden queries targeting harder negative and multi-hop scenarios.
- Integrate drift checks into CI so that regressions block merges automatically.
- Persist a history of snapshots (not just the latest) to enable trend analysis.
- Support passing `--ingest-at` from the ingestion pipeline to link ingestion
  events directly to drift reports.
- Expand `possibleResponsibleDocuments` using chunk-to-document provenance from
  the lineage metadata stored during ingestion.
