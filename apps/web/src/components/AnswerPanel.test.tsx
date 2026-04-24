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
    cache: { hit: false, hits: 0, misses: 1 },
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

  it("keeps all educational tabs available without a response", () => {
    render(
      <AnswerPanel
        response={null}
        tradeoffs={null}
        tradeoffsLoading={false}
        onRefreshTradeoffs={vi.fn()}
      />
    );

    expect(screen.getByRole("tab", { name: /chunks recuperados/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /citações/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /workflow/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /trade-offs/i })).toBeTruthy();
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
    expect(screen.getByText(/dev mode json/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /citações/i }));
    expect(screen.getByText(/grounding significa/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /workflow/i }));
    expect(screen.getByText(/process-query/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /trade-offs/i }));
    expect(screen.getByText(/total requests/i)).toBeTruthy();
    expect(screen.getAllByText(/api-lexical/i).length).toBeGreaterThan(0);
  });
});
