/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerPanel } from "./AnswerPanel";
import type { RagAskResponse, TradeoffMetricsResponse } from "../api/types";

const response: RagAskResponse = {
  document: {
    documentId: "doc-1",
    title: "phase-0-smoke.txt",
    modality: "text",
    checksum: "abc",
  },
  query: "What does this command verify?",
  answer: {
    grounded: true,
    text: "This command verifies that the ETL dispatcher returns a NormalizedDocument.",
    citations: [
      {
        chunkId: "doc-1:section-2:chunk-1",
        documentId: "doc-1",
        sectionId: "section-2",
        score: 0.4416,
        source: { originalFilename: "phase-0-smoke.txt" },
        offsets: {
          offsetBasis: "document",
          startOffset: 28,
          endOffset: 166,
        },
      },
    ],
  },
  index: {
    chunkCount: 2,
    embeddingProvider: "api-lexical",
    embeddingDimensions: 64,
  },
  devMode: {
    results: [
      {
        rank: 1,
        chunkId: "doc-1:section-2:chunk-1",
        documentId: "doc-1",
        sectionId: "section-2",
        score: 0.4416,
        text: "This command verifies that the ETL dispatcher returns a NormalizedDocument.",
        source: { originalFilename: "phase-0-smoke.txt" },
        offsets: {
          offsetBasis: "document",
          startOffset: 28,
          endOffset: 166,
        },
      },
    ],
    hybrid: {
      mode: "hybrid",
      denseWeight: 0.65,
      sparseWeight: 0.35,
      candidateCount: 2,
      candidates: [
        {
          chunkId: "doc-1:section-2:chunk-1",
          sectionId: "section-2",
          denseRank: 2,
          hybridRank: 1,
          denseScore: 0.35,
          sparseScore: 0.8,
          combinedScore: 0.5075,
        },
      ],
    },
    reranking: {
      applied: true,
      candidateCount: 2,
      returnedCount: 1,
      candidates: [
        {
          chunkId: "doc-1:section-2:chunk-1",
          sectionId: "section-2",
          beforeRank: 1,
          afterRank: 1,
          hybridScore: 0.5075,
          lexicalOverlapScore: 0.6,
          finalScore: 0.526,
        },
      ],
    },
    cache: { hit: false },
    workflowContext: {
      workflowId: "wf-1",
      steps: {
        "process-query": { status: "success", durationMs: 0.4 },
        "retrieve-chunks": { status: "success", durationMs: 0.3 },
      },
      totalDurationMs: 0.7,
    },
    processedQuery: {
      original: "What does this command verify?",
      expanded: ["command", "verify"],
      intent: "factual",
      confidence: 0.8,
    },
  },
};

const tradeoffs: TradeoffMetricsResponse = {
  generatedAt: Date.now(),
  windowSize: 100,
  totals: {
    requests: 2,
    avgLatencyMs: 12,
    p95LatencyMs: 20,
    avgCostUsd: 0,
    groundedRate: 1,
    cacheHitRate: 0.5,
    avgResultCount: 2,
  },
  providers: [
    {
      provider: "api-lexical",
      requests: 2,
      avgLatencyMs: 12,
      p95LatencyMs: 20,
      avgCostUsd: 0,
      groundedRate: 1,
      cacheHitRate: 0.5,
      avgResultCount: 2,
    },
  ],
  recent: [],
};

describe("AnswerPanel", () => {
  afterEach(() => cleanup());

  it.skip("keeps all educational tabs available without a response", () => {
    render(
      <AnswerPanel
        response={null}
        tradeoffs={null}
        tradeoffsLoading={false}
        onRefreshTradeoffs={vi.fn()}
      />
    );

    expect(screen.getByRole("tab", { name: /Cache hit/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Citações/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Workflow/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Trade-offs/i })).toBeTruthy();
    expect(screen.getByText(/retrieved chunks will appear/i)).toBeTruthy();
  });

  it("renders chunks, citations, workflow, and trade-offs from full data", () => {
    render(
      <AnswerPanel
        response={response}
        tradeoffs={tradeoffs}
        tradeoffsLoading={false}
        onRefreshTradeoffs={vi.fn()}
      />
    );

    expect(screen.getByText(/melhor match/i)).toBeTruthy();
    expect(screen.getAllByText(/retrieval pipeline/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/dense \+ sparse/i)).toBeTruthy();
    expect(screen.getByText(/combined → reranked final order/i)).toBeTruthy();
    expect(screen.getByText(/dev mode json/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /citações/i }));
    expect(screen.getAllByText(/grounding significa/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: /workflow/i }));
    expect(screen.getByText(/process-query/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /trade-offs/i }));
    expect(screen.getByText(/total requests/i)).toBeTruthy();
    expect(screen.getAllByText(/api-lexical/i).length).toBeGreaterThan(0);
  });
});
