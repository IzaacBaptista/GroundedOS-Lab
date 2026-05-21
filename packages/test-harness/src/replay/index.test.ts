import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ExecutionSnapshot } from "@groundedos/core";
import {
  captureExecutionSnapshot,
  compareReplayResults,
  loadExecutionSnapshot,
  persistExecutionSnapshot,
  replayExecution,
} from "./index";

describe("replay harness", () => {
  it("validates snapshots during capture", () => {
    const snapshot = makeSnapshot();
    expect(captureExecutionSnapshot(snapshot)).toEqual(snapshot);
    expect(() =>
      captureExecutionSnapshot({
        ...snapshot,
        version: "v2",
      } as unknown as ExecutionSnapshot)
    ).toThrow();
  });

  it("persists and loads execution snapshots", async () => {
    const snapshot = makeSnapshot();
    const dir = await mkdtemp(join(tmpdir(), "groundedos-replay-harness-"));
    const filePath = join(dir, "snapshot.json");
    try {
      await persistExecutionSnapshot(snapshot, filePath);
      await expect(loadExecutionSnapshot(filePath)).resolves.toEqual(snapshot);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("replays snapshots and returns comparison result", async () => {
    const original = makeSnapshot();
    const result = await replayExecution(original, async (input) => ({
      ...input,
      original: {
        ...input.original,
        latencyMs: (input.original.latencyMs ?? 0) + 5,
      },
    }));

    expect(result.version).toBe("v1");
    expect(result.status).toBe("matched");
    expect(result.differences.latencyDeltaMs).toBe(5);
  });

  it("detects diverged replay results", () => {
    const original = makeSnapshot();
    const replay = makeSnapshot({
      original: {
        ...original.original,
        answer: {
          ...original.original.answer,
          text: "Changed answer",
        },
      },
      chunks: [
        ...original.chunks,
        {
          chunkId: "doc-1:section-2:chunk-1",
          sectionId: "section-2",
          rank: 2,
          score: 0.45,
          text: "Secondary evidence",
          textHash: "hash-2",
          textPreview: "Secondary evidence",
        },
      ],
    });

    const result = compareReplayResults(original, replay);
    expect(result.status).toBe("diverged");
    expect(result.differences.responseChanged).toBe(true);
    expect(result.differences.addedChunkIds).toContain("doc-1:section-2:chunk-1");
  });
});

function makeSnapshot(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
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
