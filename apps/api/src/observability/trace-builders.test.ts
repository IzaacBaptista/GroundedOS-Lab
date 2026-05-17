import { describe, expect, it } from "vitest";
import { createAgentTrace, createRagErrorTrace, createRagSuccessTrace } from "./trace-builders";

describe("trace-builders", () => {
  it("builds structured RAG success traces with retrieval metadata", () => {
    const trace = createRagSuccessTrace({
      request: {
        query: "what is grounded ai?",
        topK: 3,
        sessionId: "session-1",
        requestId: "req-1",
      },
      response: {
        document: {
          documentId: "doc-1",
          title: "Doc",
          modality: "text",
          checksum: "abc",
        },
        query: "what is grounded ai?",
        answer: {
          grounded: true,
          text: "answer",
          citations: [],
        },
        index: {
          chunkCount: 2,
          embeddingProvider: "api-lexical",
          embeddingDimensions: 64,
        },
        devMode: {
          query: "what is grounded ai?",
          resultCount: 1,
          results: [
            {
              rank: 1,
              chunkId: "chunk-1",
              documentId: "doc-1",
              sectionId: "s1",
              score: 0.8,
              text: "chunk",
              source: {
                documentTitle: "Doc",
                modality: "text",
                sourceType: "manual",
              },
              offsets: { startOffset: 0, endOffset: 10, offsetBasis: "document" },
              embedding: { provider: "api-lexical", dimensions: 64 },
            },
          ],
          retrievalSpans: [
            { stage: "retrieve-chunks", latencyMs: 12, chunkCount: 3, score: { min: 0.1, max: 0.9, avg: 0.5 } },
            { stage: "rerank-chunks", latencyMs: 6, chunkCount: 1, score: { min: 0.2, max: 0.8, avg: 0.5 } },
          ],
          cache: { hit: true },
          evals: { groundedness: 1, answerOverlap: 1, retrievalAccuracy: 0.9, pipelineScore: 0.95, modelScore: 0.95 },
          workflowContext: {
            workflowId: "wf-1",
            startedAt: Date.now(),
            metadata: {},
            steps: {
              "retrieve-chunks": { status: "success", durationMs: 12 },
            },
          },
        },
      },
      durationMs: 55,
      correlation: { requestId: "req-1", traceId: "trace-1" },
    });

    expect(trace.component).toBe("retrieval");
    expect(trace.operation).toBe("rag.pipeline");
    expect(trace.correlation.requestId).toBe("req-1");
    expect(trace.metadata?.retrievalMs).toBe(12);
  });

  it("builds structured RAG error traces", () => {
    const trace = createRagErrorTrace({
      request: { query: "q", requestId: "req-2" },
      durationMs: 9,
      correlation: { requestId: "req-2" },
      error: new Error("boom"),
    });

    expect(trace.status).toBe("error");
    expect(trace.error?.message).toContain("boom");
  });

  it("builds structured agent traces with tool sequence", () => {
    const trace = createAgentTrace({
      request: {
        agentType: "document-qa",
        query: "q",
        indexId: "doc-1",
      },
      response: {
        success: true,
        answer: "a",
        sources: ["chunk-1"],
        reasoning: ["r1"],
        devMode: {
          durationMs: 20,
          state: {},
          toolCalls: [
            {
              id: "tool-1",
              toolName: "retrieve-from-index",
              input: { query: "q" },
              status: "success",
              durationMs: 10,
            },
          ],
        },
      },
      durationMs: 30,
      correlation: { requestId: "req-3", agentExecutionId: "agent-exec-1" },
    });

    expect(trace.component).toBe("agent");
    expect(trace.metadata?.toolSequence).toEqual(["retrieve-from-index"]);
    expect(trace.correlation.agentExecutionId).toBe("agent-exec-1");
  });
});
