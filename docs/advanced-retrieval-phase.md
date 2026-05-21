# Advanced Retrieval Phase

## 1. Proposed architecture

The advanced retrieval slice extends the current hybrid RAG loop instead of replacing it:

```text
query
  ↓
query understanding
  ↓
adaptive retrieval planner
  ├─ direct answer candidate (traced, currently guarded by grounding fallback)
  ├─ standard / hybrid retrieval
  ├─ GraphRAG traversal
  ├─ HyDE expansion
  └─ RAPTOR hierarchy traversal
  ↓
retrieval fusion
  ↓
reranking + grounded answer generation
  ↓
evals + observability + replay
```

## 2. Folder structure

```text
packages/
  adaptive-rag/src/index.ts
  graphrag/src/index.ts
  rag/src/advanced-retrieval.ts
  rag/src/retrieval.ts
docs/
  advanced-retrieval-phase.md
  concepts/adaptive-rag.md
  concepts/graphrag.md
  concepts/hyde.md
  concepts/raptor.md
```

## 3. New packages

- `packages/graphrag`: entity extraction, graph storage abstraction, traversal, graph retrieval traces
- `packages/adaptive-rag`: query classification and retrieval planning

## 4. Main interfaces

- `EntityNode`, `RelationEdge`, `KnowledgeGraph`
- `EntityExtractor`, `GraphStore`, `GraphTraversalStrategy`
- `AdaptiveRetrievalPlanner`, `AdaptiveRetrievalPlan`
- `HyDETrace`
- `RaptorNode`, `RaptorTree`, `ClusterSummary`
- `RetrievalFusionTrace`

## 5. Complete flows

- **GraphRAG**: chunk → extract entities → build co-occurrence graph → entity hit search → BFS traversal → graph-ranked chunks
- **Adaptive RAG**: query → classify intent/risk/ambiguity → choose `DIRECT_LLM | STANDARD_RAG | HYBRID_RAG | GRAPH_RAG | HYDE_RAG | FULL_PIPELINE`
- **HyDE**: query → hypothetical grounded document → hypothetical embedding → auxiliary dense retrieval → fusion
- **RAPTOR**: chunks → section summaries → root summary → hierarchical summary-first retrieval → fusion

## 6. TypeScript types

The implementation adds typed dev-mode surfaces:

- `adaptiveRoutingTrace`
- `graphRetrievalTrace`
- `hydeTrace`
- `raptorTrace`
- `retrievalFusionTrace`

## 7. Integration strategy

- Keep `retrieveForDevMode()` as the integration seam
- Build graph + RAPTOR tree during `buildRetrievalIndex()`
- Only activate advanced retrieval augmentation in hybrid mode, preserving dense-mode determinism and existing tests
- Let API/web inherit new traces through existing dev-mode plumbing

## 8. Incremental implementation strategy

1. Add planner and graph abstractions
2. Add deterministic GraphRAG retrieval
3. Add HyDE expansion and RAPTOR summaries
4. Fuse signals without removing the current hybrid baseline
5. Surface traces in Dev Mode and frontend panels
6. Expand benchmark/eval datasets once real providers are wired in

## 9. Benchmark / eval strategy

- Compare baseline hybrid vs advanced fusion
- Track recall@k, MRR, NDCG, faithfulness
- Add adaptive routing metrics:
  - retrieval unnecessary rate
  - saved latency
  - cost reduction
  - hallucination reduction
- Add RAPTOR metrics:
  - context compression
  - token efficiency
  - long-context answer quality

## 10. Frontend visualization suggestions

- Graph panel with entity hit chips + traversal edges
- HyDE card with hypothetical document preview and before/after delta
- RAPTOR summary tree with top-down selection path
- Fusion heatmap showing semantic vs graph vs HyDE contributions

## 11. Trade-offs

- Deterministic extractors are explainable but lower recall than LLM extraction
- HyDE improves recall but adds embedding cost
- RAPTOR compresses context but can lose detail in summaries
- Fusion improves robustness but complicates debugging if weights drift

## 12. Architectural risks

- Graph explosion on noisy corpora
- Query planner overfitting to heuristics
- Summary drift between RAPTOR levels and raw evidence
- Provider cost growth if HyDE becomes default without guardrails

## 13. Example Dev Mode payloads

```json
{
  "adaptiveRoutingTrace": {
    "selectedPipeline": "FULL_PIPELINE",
    "executedPipeline": "FULL_PIPELINE",
    "reason": ["complexity=high", "relational-query-uses-graph"]
  },
  "graphRetrievalTrace": {
    "entityHits": [{ "label": "semantic cache", "score": 0.81 }],
    "traversalSteps": [{ "fromLabel": "semantic cache", "toLabel": "retrieval", "depth": 1 }]
  },
  "hydeTrace": {
    "hypotheticalDocument": "Hypothetical grounded answer for retrieval: ..."
  },
  "raptorTrace": {
    "hierarchyDepth": 2,
    "selectedNodes": [{ "label": "doc:section-2", "level": 1 }]
  }
}
```

## 14. End-to-end example

Query: `How does semantic cache depend on retrieval?`

1. Query understanding expands retrieval terminology
2. Adaptive planner marks the query as relational + retrieval-heavy
3. Hybrid retrieval gets lexical + dense candidates
4. GraphRAG finds `semantic cache` and traverses to `retrieval`
5. HyDE generates a hypothetical answer document and performs auxiliary retrieval
6. RAPTOR selects the most relevant section summary
7. Fusion combines the signals and returns grounded chunks for reranking

## 15. Future suggestions

- Add pluggable LLM-based entity extraction
- Support persistent graph stores such as Neo4j
- Learn fusion weights from eval runs instead of fixed heuristics
- Add dedicated graph and hierarchy tabs in the web app
- Route `DIRECT_LLM` to a real provider path once non-grounded flows are supported
