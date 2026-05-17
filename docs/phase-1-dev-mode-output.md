# Dev Mode Output Contract

This document defines the stable Dev Mode contract for the local Core RAG flow.
It started as a Phase 1 retrieval-only shape and now includes adaptive
extensions used by routing, orchestration, cache analysis, evals and cost
inspection.

The contract is produced by `retrieveForDevMode()` or by passing retrieval
results to `createRetrievalDevOutput()`.

## Shape

```ts
type RetrievalDevModeOutput = {
  query: string;
  resultCount: number;
  results: RetrievalDevModeResult[];
  cache?: {
    hit: boolean;
    similarity?: number;
    thresholdUsed?: number;
    adaptiveThresholdReason?: string;
    cacheKey?: string;
    contextHash?: string;
    reason?: string;
    savingsMs?: number;
    hitRate?: number;
    quality?: {
      score?: number;
      label?: "high" | "medium" | "low";
      shadowChecked?: boolean;
    };
  };
  routing?: {
    selectedModel: string;
    selectedProvider: string;
    reason: string;
    confidence: number;
    tradeoff: {
      latency: string;
      cost: string;
      quality: string;
    };
    alternatives: Array<{
      model: string;
      provider: string;
      reason: string;
    }>;
    features: Record<string, unknown>;
  };
  orchestration?: {
    mode: "single-model" | "multi-model";
    enabled: boolean;
    steps: Array<{
      id: string;
      model: string;
      role: string;
      durationMs: number;
    }>;
  };
  reasoning?: {
    enabled: boolean;
    summary: string[];
    decisionSteps: string[];
  };
  evals?: {
    groundedness: number;
    answerOverlap: number;
    retrievalAccuracy: number;
    pipelineScore: number;
    modelScore: number;
    taxonomy?: {
      category: string;
      probableCause: string;
      confidence: number;
    };
    confidence?: {
      confidenceScore: number;
      confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
      confidenceReasoning: string[];
    };
  };
  cacheAwareRetrieval?: {
    influenced: boolean;
    boostedChunkIds: string[];
    hybridScoreMode: string;
  };
  costBreakdown?: {
    embeddingsUsd: number;
    retrievalUsd: number;
    generationUsd: number;
    totalUsd: number;
  };
  hybrid?: {
    mode: "hybrid";
    denseWeight: number;
    sparseWeight: number;
    candidateCount: number;
  };
  retrievalDiagnostics?: {
    topScore: number;
    avgScore: number;
    sourceDiversity: number;
    evidenceCoverage: number;
    groundedConsistency: number;
    conflictCount: number;
  };
  replay?: {
    reproducible: boolean;
    command: string;
    snapshot: {
      version: "v1";
      mode: "inline" | "persisted";
      query: string;
    };
  };
  reportReferences?: {
    drift?: {
      degraded: boolean;
      regressions: number;
    };
    diff?: {
      winner: string;
      regressions: number;
      improvements: number;
    };
  };
};

type RetrievalDevModeResult = {
  rank: number;
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  text: string;
  source: {
    documentTitle: string;
    modality: string;
    sourceType: string;
    originalFilename?: string;
    sectionHeading?: string;
    page?: number;
  };
  offsets: {
    startOffset: number;
    endOffset: number;
    offsetBasis: "document" | "section";
  };
  embedding: {
    provider: string;
    dimensions: number;
    model?: string;
    normalized?: boolean;
  };
};
```

## Request controls

The ask endpoints accept the following optional booleans in both JSON and
multipart flows:

- `useMultiModelOrchestration` (default: `true`)
- `reasoningEnabled` (default: `false`)
- `enableShadowRetrieval` (default: `true`)

These flags influence `devMode.orchestration`, `devMode.reasoning` and cache
quality/diagnostic fields.

## Example

```json
{
  "query": "beta question",
  "resultCount": 1,
  "results": [
    {
      "rank": 1,
      "chunkId": "doc-1:section-2:chunk-1",
      "documentId": "doc-1",
      "sectionId": "section-2",
      "score": 1,
      "text": "Beta retrieval note.",
      "source": {
        "documentTitle": "Dev Mode Test",
        "modality": "text",
        "sourceType": "manual"
      },
      "offsets": {
        "startOffset": 20,
        "endOffset": 40,
        "offsetBasis": "document"
      },
      "embedding": {
        "provider": "local-hash",
        "dimensions": 256,
        "model": "local-hash-v1",
        "normalized": true
      }
    }
  ]
}
```

## Semantics

- `rank` is one-based and follows descending retrieval score order.
- `score` is the vector-store similarity score for the retrieved chunk.
- `chunkId`, `documentId` and `sectionId` are stable identifiers for tracing.
- `source` identifies the original document and section/page when available.
- `offsets` point to the emitted chunk text. `offsetBasis: "document"` means the
  offsets are absolute inside `NormalizedDocument.content.fullText`;
  `offsetBasis: "section"` means they are relative to the source section.
- `embedding` identifies the provider and vector dimensions used for retrieval.
  Newer providers may also include model name and whether vectors are
  normalized.
- `cache` captures adaptive semantic-cache behavior and quality diagnostics.
- `routing` explains model/provider selection and candidate tradeoffs.
- `orchestration` captures multi-step generation metadata when enabled.
- `evals` provides per-request quality indicators for lab analysis.
- `evals.taxonomy` classifies the dominant retrieval failure mode.
- `evals.confidence` calibrates reliability from evidence, not model score alone.
- `costBreakdown` provides per-request cost attribution by stage.
- `retrievalDiagnostics` summarizes evidence breadth, consistency and conflict risk.
- `replay` provides a reproducible snapshot/command for deterministic replay.
- `reportReferences` links the latest drift/diff summaries when those artifacts exist.

## Non-goals

- This does not define UI layout or tab structure.
- This does not replace persisted benchmark artifacts in `datasets/golden`.
- This does not imply production vector database support.
