import { describe, expect, it } from "vitest";
import type { ExecutionSnapshot, GoldenDataset } from "@groundedos/core";
import { executeExperiment } from "./index";

describe("experiment harness", () => {
  it("returns report, snapshots and metadata", async () => {
    const dataset: GoldenDataset = {
      name: "experiment-dataset",
      version: "1.0.0",
      entries: [
        {
          id: "sample-1",
          question: "What is grounded retrieval?",
          expectedChunkIds: ["chunk-1"],
        },
      ],
    };

    const snapshot = makeExecutionSnapshot();
    const result = await executeExperiment({
      dataset,
      provider: "openai",
      modelName: "gpt-4o-mini",
      embeddingProvider: "text-embedding-3-small",
      retrievalStrategy: "hybrid",
      reranker: "cross-encoder",
      promptVersion: "v3",
      evalSuite: "default",
      tags: ["smoke", "experiment"],
      pipeline: {
        async retrieve() {
          return [{ chunkId: "chunk-1", text: "Grounded retrieval uses evidence.", score: 0.9 }];
        },
        async generate() {
          return "Grounded retrieval uses retrieved evidence.";
        },
      },
      snapshots: [snapshot],
    });

    expect(result.report.version).toBe("v1");
    expect(result.report.summary.metrics.experimentRuns).toBe(1);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toEqual(snapshot);
    expect(result.metadata.datasetId).toBe("experiment-dataset");
    expect(result.metadata.pipelineName).toBe("hybrid");
    expect(result.metadata.modelProvider).toBe("openai");
    expect(result.metadata.modelName).toBe("gpt-4o-mini");
    expect(result.metadata.embeddingProvider).toBe("text-embedding-3-small");
    expect(result.metadata.evalSuite).toBe("default");
    expect(result.metadata.tags).toEqual(["smoke", "experiment"]);
    expect(result.metadata.metadata?.reranker).toBe("cross-encoder");
    expect(result.metadata.metadata?.snapshotCount).toBe(1);
  });

  it("collects snapshots from sample metadata and resolver", async () => {
    const dataset: GoldenDataset = {
      name: "experiment-dataset",
      version: "1.0.0",
      entries: [
        {
          id: "sample-1",
          question: "What is grounded retrieval?",
          expectedChunkIds: ["chunk-1"],
          metadata: {
            executionSnapshot: makeExecutionSnapshot({ correlation: { traceId: "trace-from-entry" } }),
          },
        },
      ],
    };

    const collected = makeExecutionSnapshot({ correlation: { traceId: "trace-from-resolver" } });
    const result = await executeExperiment({
      dataset,
      pipeline: {
        async retrieve() {
          return [{ chunkId: "chunk-1", text: "Grounded retrieval uses evidence.", score: 0.9 }];
        },
        async generate() {
          return "Grounded retrieval uses retrieved evidence.";
        },
      },
      collectSnapshot({ sample }) {
        expect(sample.sampleId).toBe("sample-1");
        return collected;
      },
    });

    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots.map((item) => item.correlation.traceId)).toEqual([
      "trace-from-resolver",
      "trace-from-entry",
    ]);
    expect(result.metadata.pipelineName).toBe("default");
    expect(result.metadata.metadata?.snapshotCount).toBe(2);
  });
});

function makeExecutionSnapshot(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return {
    version: "v1",
    capturedAt: "2026-05-20T00:00:00.000Z",
    mode: "persisted",
    query: "What is grounded retrieval?",
    correlation: {
      requestId: "request-1",
      sessionId: "session-1",
      traceId: "trace-1",
    },
    document: {
      documentId: "doc-1",
      title: "Doc 1",
      checksum: "checksum",
      persisted: true,
      indexPath: "/tmp/index.json",
      originalFilename: "doc.txt",
    },
    indexRef: {
      indexId: "doc-1",
      indexVersion: "1",
      snapshotId: "snapshot-1",
    },
    parameters: {
      topK: 1,
      reasoningEnabled: false,
      useMultiModelOrchestration: true,
      enableShadowRetrieval: true,
    },
    retrievalConfig: {
      mode: "hybrid",
      candidateCount: 2,
      returnedCount: 1,
      rerankingApplied: true,
    },
    providers: {
      embeddingProvider: "test-embedding",
      embeddingModel: "test-embedding-v1",
      selectedModel: "test-model",
      selectedProvider: "test-provider",
    },
    generation: {
      strategy: "extractive-grounded",
      deterministic: true,
      config: {
        temperature: 0,
        topP: 1,
      },
    },
    prompts: {
      systemPrompt: "Answer with evidence",
      answerPolicy: "Grounded only",
    },
    policies: {
      groundingPolicy: "grounding",
      refusalPolicy: "refusal",
      citationPolicy: "citation",
    },
    chunks: [
      {
        chunkId: "doc-1:section-1:chunk-1",
        sectionId: "section-1",
        rank: 1,
        score: 0.9,
        text: "Primary evidence",
        textHash: "hash-1",
        textPreview: "Primary evidence",
      },
    ],
    rerankingConfig: {
      applied: true,
      candidateCount: 2,
      returnedCount: 1,
    },
    reranking: [
      {
        chunkId: "doc-1:section-1:chunk-1",
        beforeRank: 1,
        afterRank: 1,
        finalScore: 0.9,
      },
    ],
    original: {
      answer: {
        text: "Grounded retrieval answers from retrieved evidence.",
        grounded: true,
        citations: [
          {
            chunkId: "doc-1:section-1:chunk-1",
            documentId: "doc-1",
            sectionId: "section-1",
          },
        ],
      },
      costUsd: 0,
      latencyMs: 10,
      groundedness: 1,
    },
    environment: {
      runtime: "node",
      nodeVersion: process.version,
      platform: process.platform,
      nodeEnv: "test",
    },
    ...overrides,
  };
}
