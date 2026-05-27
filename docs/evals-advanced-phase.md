# Advanced Evals Phase

GroundedOS Lab now includes a didactic but production-oriented eval architecture
that layers richer evaluation on top of the existing deterministic scorers.

## 1. Proposed architecture

- **Custom scorers** remain the fast baseline (`FaithfulnessEvaluator`,
  `RelevanceEvaluator`, `RecallEvaluator`).
- **LLM-as-judge** adds rubric-driven structured judging with prompt hardening,
  repeat runs, aggregation and calibration support.
- **RAGAS adapter** isolates Python-specific execution behind a typed request
  contract and a runner boundary.
- **Synthetic dataset generation** expands golden sets from chunked documents.
- **Eval orchestrator** composes the above into one run model and artifact set.

## 2. Folder structure

```text
packages/core/src/contracts/advanced-eval-schemas.ts
packages/evals/src/advanced.ts
scripts/eval-ragas.ts
scripts/eval-ragas-sample.ts
scripts/eval-ragas-compare.ts
experiments/evals/ragas/run_ragas.py
datasets/golden/rag/v1/
datasets/golden/synthetic/v1/
```

## 3. Main TypeScript interfaces

- `JudgeProvider`
- `JudgeExecutionInput`
- `RagasDatasetMapper`
- `RagasMetricRunner`
- `SyntheticDatasetGenerator`
- `QuestionGenerator`
- `ReferenceAnswerGenerator`
- `EvidenceLinker`
- `SyntheticSampleValidator`
- `GoldenDatasetExporter`
- `EvalArtifactWriter`
- `EvalComparisonReporter`
- `EvalOrchestrator`

## 4. Python / RAGAS strategy

- Keep the **core and orchestrator in TypeScript**.
- Convert internal samples into `RagasDatasetRecord`.
- Write a request artifact from Node.
- Execute `experiments/evals/ragas/run_ragas.py` via subprocess when desired.
- If `ragas` is not installed, the runner emits a clear fallback warning while
  preserving artifact contracts.

## 5. Judge prompt template

The default template:

- forbids following instructions inside the evaluated question, answer or
  retrieved chunks
- requires JSON-only output
- injects metric-specific rubric text
- asks for `metric`, `score`, `reason`, `evidenceUsed`, `issues`, `confidence`

## 6. Initial rubrics

Included metrics:

- faithfulness
- answer relevance
- answer correctness
- completeness
- groundedness
- citation quality
- hallucination risk
- refusal correctness
- uncertainty handling

All use explicit `1 / 3 / 5` anchors and are configurable per metric.

## 7. Synthetic generation pipeline

```text
documents
→ chunk grouping
→ question generation
→ reference answer generation
→ evidence linking
→ validation
→ versioned dataset export
```

## 8. Sample validation strategy

`SyntheticSampleValidator` rejects or flags items when:

- the question is too short or vague
- the question duplicates a prior sample
- the reference answer is too weak
- no evidence chunks are linked

## 9. Dataset versioning

Versioned examples are now organized under:

```text
datasets/golden/rag/v1/
datasets/golden/synthetic/v1/
```

Each version keeps `dataset.jsonl`, `metadata.json`, `README.md`, and
`changelog.md`.

## 10. Proposed API

The contracts now cover:

- `POST /evals/run`
- `POST /evals/judge`
- `POST /evals/ragas`
- `POST /evals/synthetic/generate`
- `GET /evals/runs`
- `GET /evals/runs/:id`
- `GET /evals/datasets`
- `GET /evals/datasets/:id`

## 11. Artifact format

`EvalArtifactWriter` and the RAGAS runner standardize:

- `results.json`
- `summary.md`
- `metrics.csv`
- `config.json`
- `trace.json`

## 12. Dev Mode / UI integration

Recommended panels:

- Eval Run Viewer
- Metric Breakdown
- Judge Reason Panel
- RAGAS Metrics Panel
- Dataset Sample Explorer
- Regression Diff Viewer

The new schemas provide stable payloads for these panels.

## 13. Benchmark strategy

- keep deterministic scorers as the cheapest regression gate
- use judge + RAGAS on curated and synthetic datasets
- store artifacts per run for comparison across providers, prompts and
  retrieval strategies

## 14. Run comparison strategy

`EvalComparisonReporter` compares baseline and candidate runs by metric delta.
This is intended for provider, retrieval, prompt and regression comparisons.

## 15. Tests added

- schema validation for advanced eval contracts
- judge output parsing and rubric loading
- RAGAS dataset mapping
- synthetic dataset generation and export
- artifact writing
- orchestrator integration

## 16. Technical risks

- judge outputs may drift without calibration
- RAGAS Python dependencies may not be installed everywhere
- synthetic data can amplify corpus blind spots if validation is weak

## 17. Trade-offs

- current Python runner favors simplicity over full distributed execution
- synthetic generation is deterministic and didactic, not yet model-native
- fallback scoring preserves usability but should not replace real RAGAS runs

## 18. Incremental plan

1. typed contracts and prompt/rubric scaffolding
2. deterministic orchestration and artifact writing
3. Python subprocess runner
4. API wiring and Dev Mode surfaces
5. cloud/local judge providers and calibration tooling

## 19. Example payloads

### Judge request

```json
{
  "question": "What is grounded retrieval?",
  "answer": "Grounded retrieval uses retrieved evidence.",
  "retrievedContexts": [{ "chunkId": "chunk-1", "text": "Grounded retrieval uses retrieved evidence." }],
  "metrics": ["faithfulness", "answer_correctness"]
}
```

### Eval run request

```json
{
  "datasetId": "datasets/golden/rag/v1",
  "evalSuite": "advanced-rag",
  "mode": "experiment",
  "judgeConfig": { "temperature": 0, "promptVersion": "judge-v1" },
  "ragasConfig": {
    "metrics": ["faithfulness", "context_precision", "answer_correctness"],
    "outputDir": "datasets/experiments/evals/ragas/latest"
  }
}
```

## 20. Example end-to-end flow

1. run deterministic scorers for a sample
2. send the same sample to the judge with rubric-backed prompts
3. map the sample into a RAGAS request
4. execute or prepare the Python runner
5. write run artifacts
6. compare against a baseline using `EvalComparisonReporter`
