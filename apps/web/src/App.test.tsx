/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

/**
 * Basic smoke test for the React console. Network calls to `/api/*` are
 * stubbed so the component can mount without a backend.
 */
describe("App", () => {
  const originalFetch = globalThis.fetch;
  let indexListResponse: unknown;

  beforeEach(() => {
    indexListResponse = { count: 0, indexes: [] };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/api/rag/indexes")) {
        return new Response(JSON.stringify(indexListResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/api/rag/metrics/model-benchmark")) {
        return new Response(JSON.stringify({
          timestamp: "2026-04-24T23:21:46.691Z",
          phase: "phase-4",
          dataset: "phase-0-smoke-text",
          goldenSize: 1,
          topK: 3,
          requestedProviders: ["local-extractive", "ollama", "openai"],
          successCriteria: {
            phase4ModelBenchmarkPassed: false,
            includesOllamaProvider: true,
            includesCloudProvider: false,
            note: "Cloud provider has not completed yet.",
          },
          providers: [
            {
              provider: "ollama",
              kind: "ollama",
              model: "qwen2.5:0.5b",
              status: "completed",
              metrics: {
                requestCount: 1,
                avgLatencyMs: 533,
                p95LatencyMs: 533,
                avgFaithfulness: 1,
                avgRelevance: 0.416,
                avgQuality: 0.708,
                containsExpectedAnswerRate: 1,
                avgCostUsd: 0,
                totalCostUsd: 0,
              },
              perQuery: [
                {
                  id: "gd-001",
                  question: "What does this command verify?",
                  status: "completed",
                  latencyMs: 533,
                  answer: "The command verifies the ETL dispatcher.",
                  expectedAnswerContains: ["ETL dispatcher"],
                  containsExpectedAnswer: true,
                  costUsd: 0,
                  retrievedChunkIds: ["smoke-text-001:section-2:chunk-1"],
                },
              ],
            },
            {
              provider: "openai",
              kind: "cloud",
              model: "gpt-5-mini",
              status: "error",
              metrics: {
                requestCount: 0,
                avgLatencyMs: 0,
                p95LatencyMs: 0,
                avgFaithfulness: 0,
                avgRelevance: 0,
                avgQuality: 0,
                containsExpectedAnswerRate: 0,
                avgCostUsd: 0,
                totalCostUsd: 0,
              },
              perQuery: [
                {
                  id: "gd-001",
                  question: "What does this command verify?",
                  status: "error",
                  latencyMs: 2062,
                  error: "OpenAI request failed with status 429: insufficient_quota",
                  expectedAnswerContains: ["ETL dispatcher"],
                  containsExpectedAnswer: false,
                  costUsd: 0,
                  retrievedChunkIds: ["smoke-text-001:section-2:chunk-1"],
                },
              ],
            },
          ],
          summary: {
            completedProviders: ["ollama"],
            skippedProviders: [],
            errorProviders: ["openai"],
            bestByQuality: "ollama",
            bestByLatency: "ollama",
            bestByCost: "ollama",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/api/rag/indexes/visual-test/embedding-map")) {
        return new Response(JSON.stringify({
          document: {
            documentId: "visual-test",
            title: "Visual Test",
            modality: "text",
            checksum: "abc",
          },
          index: {
            chunkCount: 2,
            embeddingProvider: "api-lexical",
            embeddingDimensions: 64,
          },
          projection: {
            method: "variance-dimensions",
            xDimension: 1,
            yDimension: 2,
          },
          points: [
            {
              chunkId: "visual-test:section-1:chunk-1",
              documentId: "visual-test",
              sectionId: "section-1",
              x: 8,
              y: 92,
              clusterLabel: "section-1",
              textPreview: "Alpha setup notes.",
              offsets: {
                startOffset: 0,
                endOffset: 18,
                offsetBasis: "document",
              },
            },
            {
              chunkId: "visual-test:section-2:chunk-1",
              documentId: "visual-test",
              sectionId: "section-2",
              x: 92,
              y: 8,
              clusterLabel: "section-2",
              textPreview: "Beta retrieval notes.",
              offsets: {
                startOffset: 20,
                endOffset: 41,
                offsetBasis: "document",
              },
            },
          ],
          clusters: [
            { label: "section-1", count: 1, centroid: { x: 8, y: 92 } },
            { label: "section-2", count: 1, centroid: { x: 92, y: 8 } },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: { message: "unhandled" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the Local RAG Console header and empty state", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /local rag console/i })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /ask/i })).toBeTruthy();

    // Empty index list means the select shows "No indexed documents".
    await waitFor(() => {
      expect(screen.getByText(/no indexed documents/i)).toBeTruthy();
    });

    // Health check resolves "online" after the first successful fetch.
    await waitFor(() => {
      expect(screen.getByText(/api online/i)).toBeTruthy();
    });
  });

  it("shows a validation error when submitting without a query", async () => {
    const { container } = render(<App />);
    const form = container.querySelector("form");

    if (!form) {
      throw new Error("form not rendered");
    }

    // HTMLFormElement.requestSubmit triggers onSubmit without native
    // constraint validation interrupting the handler.
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    await waitFor(() => {
      const matches = screen.getAllByText(/question is required/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("loads the embedding map for a selected persisted index", async () => {
    indexListResponse = {
      count: 1,
      indexes: [
        {
          createdAt: "2026-04-24T00:00:00.000Z",
          document: {
            documentId: "visual-test",
            title: "Visual Test",
            modality: "text",
            checksum: "abc",
          },
          index: {
            chunkCount: 2,
            embeddingProvider: "api-lexical",
            embeddingDimensions: 64,
          },
          storage: {
            persisted: true,
            indexPath: ".groundedos/indexes/visual-test.json",
          },
        },
      ],
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/visual test \| 2 chunks \| api-lexical/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/indexed documents/i), {
      target: { value: "visual-test" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /embeddings/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/alpha setup notes/i).length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(/section-1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/section-2/i).length).toBeGreaterThan(0);
  });

  it("shows OpenAI model benchmark details", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: /models/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/model provider/i)).toBeTruthy();
    });

    expect(screen.getByDisplayValue("openai")).toBeTruthy();
    expect(screen.getByText(/gpt-5-mini/i)).toBeTruthy();
    expect(screen.getAllByText(/insufficient_quota/i).length).toBeGreaterThan(0);
  });
});
