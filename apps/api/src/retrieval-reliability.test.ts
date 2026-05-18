import { describe, expect, it } from "vitest";

import {
  assertReplaySnapshotComplete,
  buildRetrievalDiagnostics,
  buildReplaySnapshot,
  calibrateConfidence,
  classifyRetrievalFailure,
  compareReplaySnapshots,
  createCorpusDriftReport,
  createPromptPolicyDiffReport,
} from "./retrieval-reliability";

describe("retrieval reliability", () => {
  it("classifies not found retrieval failures", () => {
    const diagnostics = buildRetrievalDiagnostics({
      results: [],
      citations: [],
      evals: {
        groundedness: 0,
        answerOverlap: 0,
      },
      retrievalMode: "hybrid",
      rerankingApplied: false,
    });

    const taxonomy = classifyRetrievalFailure({
      diagnostics,
      answerGrounded: false,
      answerText: "No answer.",
      evals: {
        groundedness: 0,
        answerOverlap: 0,
        retrievalAccuracy: 0,
      },
    });

    expect(taxonomy.category).toBe("NOT_FOUND");
    expect(taxonomy.probableCause).toContain("no sufficiently relevant chunk");
  });

  it("classifies ungrounded answers and calibrates low confidence", () => {
    const diagnostics = buildRetrievalDiagnostics({
      results: [
        {
          chunkId: "doc:section-1:chunk-1",
          documentId: "doc",
          sectionId: "section-1",
          score: 0.32,
          text: "The dispatcher routes plain text input.",
        },
      ],
      citations: [],
      evals: {
        groundedness: 0.2,
        answerOverlap: 0.1,
      },
      retrievalMode: "hybrid",
      rerankingApplied: true,
    });

    const taxonomy = classifyRetrievalFailure({
      diagnostics,
      answerGrounded: false,
      answerText: "It also performs semantic chunk compression.",
      evals: {
        groundedness: 0.2,
        answerOverlap: 0.1,
        retrievalAccuracy: 0.3,
        scorerResults: {
          faithfulness: { score: 0.1 },
          recall: { score: 0.3 },
        },
      },
    });
    const confidence = calibrateConfidence({
      diagnostics,
      evals: {
        groundedness: 0.2,
        answerOverlap: 0.1,
        scorerResults: {
          faithfulness: { score: 0.1 },
        },
      },
    });

    expect(taxonomy.category).toBe("UNGROUNDED_ANSWER");
    expect(confidence.confidenceLevel).toBe("UNRELIABLE");
    expect(confidence.evidenceSignals.lowGroundedness).toBe(true);
    expect(confidence.confidenceReasoning.join(" ")).toContain("FLAG low-groundedness");
  });

  it("calibrates high confidence for grounded diverse evidence", () => {
    const diagnostics = buildRetrievalDiagnostics({
      results: [
        {
          chunkId: "doc:section-1:chunk-1",
          documentId: "doc",
          sectionId: "section-1",
          score: 0.94,
          text: "Hybrid retrieval blends dense vector similarity with sparse lexical scoring.",
        },
        {
          chunkId: "doc:section-2:chunk-1",
          documentId: "doc",
          sectionId: "section-2",
          score: 0.88,
          text: "Reranking reorders candidates after initial retrieval.",
        },
      ],
      citations: [{ chunkId: "doc:section-1:chunk-1" }, { chunkId: "doc:section-2:chunk-1" }],
      evals: {
        groundedness: 1,
        answerOverlap: 0.92,
      },
      retrievalMode: "hybrid",
      rerankingApplied: true,
      provider: "api-lexical",
    });

    const confidence = calibrateConfidence({
      diagnostics,
      evals: {
        groundedness: 1,
        answerOverlap: 0.92,
        scorerResults: {
          faithfulness: { score: 1 },
          relevance: { score: 0.92 },
        },
      },
    });

    expect(confidence.confidenceLevel).toBe("HIGH");
    expect(confidence.confidenceScore).toBeGreaterThan(0.8);
    expect(confidence.evidenceSignals.insufficientEvidence).toBe(false);
    expect(confidence.evidenceSignals.missingCitations).toBe(false);
  });

  it("calibrates medium confidence for partial but grounded evidence", () => {
    const diagnostics = buildRetrievalDiagnostics({
      results: [
        {
          chunkId: "doc:section-1:chunk-1",
          documentId: "doc",
          sectionId: "section-1",
          score: 0.72,
          text: "Hybrid retrieval combines dense and sparse signals.",
        },
        {
          chunkId: "doc:section-1:chunk-2",
          documentId: "doc",
          sectionId: "section-1",
          score: 0.54,
          text: "Reranking adjusts order based on lexical overlap.",
        },
      ],
      citations: [{ chunkId: "doc:section-1:chunk-1" }],
      evals: {
        groundedness: 0.72,
        answerOverlap: 0.58,
      },
      retrievalMode: "hybrid",
      rerankingApplied: true,
    });

    const confidence = calibrateConfidence({
      diagnostics,
      evals: {
        groundedness: 0.72,
        answerOverlap: 0.58,
        scorerResults: {
          faithfulness: { score: 0.71 },
          relevance: { score: 0.59 },
        },
      },
    });

    expect(confidence.confidenceLevel).toBe("MEDIUM");
    expect(confidence.evidenceSignals.partialCoverage).toBe(false);
  });

  it("flags insufficient evidence as unreliable confidence", () => {
    const diagnostics = buildRetrievalDiagnostics({
      results: [
        {
          chunkId: "doc:section-1:chunk-1",
          documentId: "doc",
          sectionId: "section-1",
          score: 0.08,
          text: "General note without direct answer.",
        },
      ],
      citations: [],
      evals: {
        groundedness: 0.3,
        answerOverlap: 0.1,
      },
      retrievalMode: "hybrid",
      rerankingApplied: true,
    });

    const confidence = calibrateConfidence({
      diagnostics,
      evals: {
        groundedness: 0.3,
        answerOverlap: 0.1,
        scorerResults: {
          faithfulness: { score: 0.28 },
        },
      },
    });

    expect(confidence.confidenceLevel).toBe("UNRELIABLE");
    expect(confidence.evidenceSignals.insufficientEvidence).toBe(true);
    expect(confidence.confidenceReasoning.join(" ")).toContain("FLAG low-evidence");
  });

  it("flags conflicting chunks as contradictory context", () => {
    const diagnostics = buildRetrievalDiagnostics({
      results: [
        {
          chunkId: "doc:section-1:chunk-1",
          documentId: "doc",
          sectionId: "section-1",
          score: 0.89,
          text: "The retrieval pipeline uses reranking for quality verification on every answer.",
        },
        {
          chunkId: "doc:section-2:chunk-1",
          documentId: "doc",
          sectionId: "section-2",
          score: 0.87,
          text: "The retrieval pipeline does not use reranking for quality verification on every answer.",
        },
      ],
      citations: [{ chunkId: "doc:section-1:chunk-1" }, { chunkId: "doc:section-2:chunk-1" }],
      evals: {
        groundedness: 0.76,
        answerOverlap: 0.79,
      },
      retrievalMode: "hybrid",
      rerankingApplied: true,
    });

    const confidence = calibrateConfidence({
      diagnostics,
      evals: {
        groundedness: 0.76,
        answerOverlap: 0.79,
      },
    });

    expect(diagnostics.conflictCount).toBeGreaterThan(0);
    expect(confidence.evidenceSignals.contradictoryContext).toBe(true);
    expect(confidence.confidenceReasoning.join(" ")).toContain("FLAG contradictory-context");
  });

  it("flags answers without citations as fragile", () => {
    const diagnostics = buildRetrievalDiagnostics({
      results: [
        {
          chunkId: "doc:section-1:chunk-1",
          documentId: "doc",
          sectionId: "section-1",
          score: 0.84,
          text: "Grounded answers should carry chunk citations in metadata.",
        },
      ],
      citations: [],
      evals: {
        groundedness: 0.81,
        answerOverlap: 0.8,
      },
      retrievalMode: "hybrid",
      rerankingApplied: true,
    });

    const confidence = calibrateConfidence({
      diagnostics,
      evals: {
        groundedness: 0.81,
        answerOverlap: 0.8,
        scorerResults: {
          faithfulness: { score: 0.84 },
          relevance: { score: 0.79 },
        },
      },
    });

    expect(confidence.evidenceSignals.missingCitations).toBe(true);
    expect(confidence.confidenceReasoning.join(" ")).toContain("FLAG missing-citations");
  });

  it("compares deterministic replay snapshots", () => {
    const original = buildReplaySnapshot({
      query: "What does hybrid retrieval blend?",
      correlation: {
        requestId: "req-1",
        traceId: "trace-1",
      },
      document: {
        documentId: "doc-1",
        persisted: true,
      },
      indexRef: {
        indexId: "doc-1",
        indexVersion: "1",
        snapshotId: "2026-01-01T00:00:00.000Z",
      },
      parameters: {
        topK: 3,
        reasoningEnabled: false,
        useMultiModelOrchestration: true,
        enableShadowRetrieval: true,
      },
      retrievalConfig: {
        mode: "hybrid",
        candidateCount: 3,
        returnedCount: 2,
        rerankingApplied: true,
      },
      providers: {
        embeddingProvider: "api-lexical",
        selectedModel: "local-extractive",
      },
      original: {
        answer: {
          text: "It blends dense vector similarity and sparse lexical scoring.",
          grounded: true,
          citations: [
            {
              chunkId: "doc-1:section-1:chunk-1",
              documentId: "doc-1",
              sectionId: "section-1",
            },
          ],
        },
        costUsd: 0.01,
        latencyMs: 30,
        groundedness: 1,
      },
      results: [
        {
          chunkId: "doc-1:section-1:chunk-1",
          sectionId: "section-1",
          rank: 1,
          score: 0.9,
          text: "Hybrid retrieval blends dense vector similarity and sparse lexical scoring.",
        },
      ],
    });
    const replay = buildReplaySnapshot({
      query: "What does hybrid retrieval blend?",
      document: {
        documentId: "doc-1",
        persisted: true,
      },
      parameters: original.parameters,
      retrievalConfig: original.retrievalConfig,
      providers: original.providers,
      results: [
        {
          chunkId: "doc-1:section-2:chunk-1",
          sectionId: "section-2",
          rank: 1,
          score: 0.88,
          text: "Reranking reorders candidate chunks after retrieval.",
        },
      ],
    });

    const report = compareReplaySnapshots({
      original,
      replay,
      originalAnswer: { text: "It blends dense vector similarity and sparse lexical scoring.", grounded: true },
      replayAnswer: { text: "It reorders candidate chunks.", grounded: false },
      originalCostUsd: 0.01,
      replayCostUsd: 0.02,
      originalLatencyMs: 30,
      replayLatencyMs: 45,
    });

    expect(report.differences.responseChanged).toBe(true);
    expect(report.differences.retrievalChanged).toBe(true);
    expect(report.differences.chunkOrderChanged).toBe(false);
    expect(report.differences.scoresChanged).toBe(false);
    expect(report.differences.addedChunkIds).toContain("doc-1:section-2:chunk-1");
    expect(report.status).toBe("diverged");
    expect(report.originalTraceId).toBe("trace-1");
  });

  it("marks stable replay snapshots as matched", () => {
    const snapshot = buildReplaySnapshot({
      query: "What does hybrid retrieval blend?",
      document: {
        documentId: "doc-1",
        persisted: true,
      },
      parameters: {
        topK: 1,
        reasoningEnabled: false,
        useMultiModelOrchestration: true,
        enableShadowRetrieval: true,
      },
      retrievalConfig: {
        mode: "hybrid",
        candidateCount: 1,
        returnedCount: 1,
        rerankingApplied: false,
      },
      providers: {
        embeddingProvider: "api-lexical",
        selectedModel: "local-extractive",
      },
      original: {
        answer: {
          text: "It blends dense vector similarity and sparse lexical scoring.",
          grounded: true,
          citations: [],
        },
      },
      results: [
        {
          chunkId: "doc-1:section-1:chunk-1",
          sectionId: "section-1",
          rank: 1,
          score: 0.9,
          text: "Hybrid retrieval blends dense vector similarity and sparse lexical scoring.",
        },
      ],
    });

    const report = compareReplaySnapshots({
      original: snapshot,
      replay: snapshot,
      originalAnswer: { text: snapshot.original.answer.text, grounded: true },
      replayAnswer: { text: snapshot.original.answer.text, grounded: true },
      originalCostUsd: 0.01,
      replayCostUsd: 0.01,
      originalLatencyMs: 30,
      replayLatencyMs: 30,
    });

    expect(report.status).toBe("matched");
    expect(report.differences.retrievalChanged).toBe(false);
    expect(report.differences.chunkOrderChanged).toBe(false);
    expect(report.differences.scoresChanged).toBe(false);
  });

  it("throws a controlled error when a replay snapshot is incomplete", () => {
    const snapshot = buildReplaySnapshot({
      query: "What does hybrid retrieval blend?",
      document: {
        documentId: "doc-1",
        persisted: false,
      },
      parameters: {
        topK: 1,
        reasoningEnabled: false,
        useMultiModelOrchestration: true,
        enableShadowRetrieval: true,
      },
      retrievalConfig: {
        mode: "hybrid",
        candidateCount: 1,
        returnedCount: 1,
        rerankingApplied: false,
      },
      providers: {
        embeddingProvider: "api-lexical",
      },
      results: [],
    });

    expect(() => assertReplaySnapshotComplete(snapshot)).toThrow(
      "Replay snapshot is incomplete: inline replay requires the original content file path or a persisted index."
    );
  });

  it("detects corpus drift regressions", () => {
    const report = createCorpusDriftReport({
      dataset: "phase-5-retrieval-text",
      previous: {
        version: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        dataset: "phase-5-retrieval-text",
        topK: 3,
        queries: [
          {
            id: "q-1",
            question: "What does hybrid retrieval blend?",
            expectedChunkIds: ["doc:section-1:chunk-1"],
            retrievedChunkIds: ["doc:section-1:chunk-1"],
            recallAtK: 1,
            rankOfExpected: 1,
            topScore: 0.9,
          },
        ],
      },
      current: {
        version: "v1",
        createdAt: "2026-02-01T00:00:00.000Z",
        dataset: "phase-5-retrieval-text",
        topK: 3,
        queries: [
          {
            id: "q-1",
            question: "What does hybrid retrieval blend?",
            expectedChunkIds: ["doc:section-1:chunk-1"],
            retrievedChunkIds: ["doc:section-2:chunk-1"],
            recallAtK: 0,
            rankOfExpected: null,
            topScore: 0.41,
          },
        ],
      },
    });

    expect(report.summary.degraded).toBe(true);
    expect(report.queries[0]?.status).toBe("regressed");
    expect(report.queries[0]?.missingRelevantChunks).toEqual(["doc:section-1:chunk-1"]);
  });

  it("builds prompt and policy diff reports", () => {
    const report = createPromptPolicyDiffReport({
      dataset: "phase-5-retrieval-text",
      runs: [
        {
          variant: "baseline",
          description: "baseline prompt",
          metrics: {
            sampleSize: 1,
            avgFaithfulness: 0.8,
            avgRelevance: 0.7,
            avgRecall: 0.7,
            avgQuality: 0.74,
            avgGroundedness: 0.8,
            avgLatencyMs: 30,
            avgCostUsd: 0.01,
            refusalRate: 0.1,
            stability: 0.8,
          },
          perQuery: [
            {
              id: "q-1",
              question: "What does hybrid retrieval blend?",
              answer: "It blends dense and sparse retrieval.",
              retrievedChunkIds: ["doc:section-1:chunk-1"],
              scores: { faithfulness: 0.8, relevance: 0.7, recall: 0.7, quality: 0.74, groundedness: 0.8 },
            },
          ],
        },
        {
          variant: "candidate",
          description: "policy diff",
          metrics: {
            sampleSize: 1,
            avgFaithfulness: 0.95,
            avgRelevance: 0.92,
            avgRecall: 0.9,
            avgQuality: 0.92,
            avgGroundedness: 0.95,
            avgLatencyMs: 35,
            avgCostUsd: 0.012,
            refusalRate: 0,
            stability: 0.9,
          },
          perQuery: [
            {
              id: "q-1",
              question: "What does hybrid retrieval blend?",
              answer: "It blends dense vector similarity with sparse lexical scoring.",
              retrievedChunkIds: ["doc:section-1:chunk-1"],
              scores: { faithfulness: 0.95, relevance: 0.92, recall: 0.9, quality: 0.92, groundedness: 0.95 },
            },
          ],
        },
      ],
    });

    expect(report.winner).toBe("candidate");
    expect(report.metricsComparison).toHaveLength(2);
    expect(report.relevantDifferences[0]?.changed).toBe(true);
  });
});
