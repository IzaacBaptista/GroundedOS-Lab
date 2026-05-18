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
          evals: {
            groundedness: 1,
            answerOverlap: 1,
            retrievalAccuracy: 0.9,
            pipelineScore: 0.95,
            modelScore: 0.95,
            confidence: {
              confidenceScore: 0.91,
              confidenceLevel: "HIGH",
              confidenceReasoning: ["retrieval score=0.9"],
              evidenceSignals: {
                retrievalScore: 0.9,
                sourceDiversity: 0.5,
                questionCoverage: 1,
                groundedness: 1,
                answerConsistency: 1,
                citationCoverage: 1,
                relevantEvidenceCount: 1,
                conflictCount: 0,
                insufficientEvidence: false,
                contradictoryContext: false,
                missingCitations: false,
                lowGroundedness: false,
                partialCoverage: false,
                inconsistentAnswer: false,
              },
              factors: {
                retrievalScore: 0.9,
                sourceDiversity: 0.5,
                groundedness: 1,
                questionCoverage: 1,
                evidenceQuantity: 0.5,
                answerConsistency: 1,
                conflictPenalty: 0,
              },
            },
            taxonomy: {
              category: "LOW_CONFIDENCE",
              confidence: 0.66,
              probableCause: "limited evidence breadth",
              involvedChunks: ["chunk-1"],
              retrievalMetadata: {
                retrievalMode: "hybrid",
                rerankingApplied: true,
                topScore: 0.8,
                avgScore: 0.8,
                sourceDiversity: 1,
                evidenceCoverage: 0.7,
                groundedConsistency: 1,
                conflictCount: 0,
              },
            },
          },
          replay: {
            snapshot: {
              version: "v1",
              capturedAt: "2026-01-01T00:00:00.000Z",
              mode: "persisted",
              query: "what is grounded ai?",
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
                returnedCount: 1,
                rerankingApplied: true,
              },
              providers: {
                embeddingProvider: "api-lexical",
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
                systemPrompt: "grounded",
                answerPolicy: "answer from evidence",
              },
              policies: {
                groundingPolicy: "support answer claims with retrieved chunks only",
                refusalPolicy: "avoid fabricated certainty",
                citationPolicy: "carry chunk identifiers",
              },
              rerankingConfig: {
                applied: false,
                candidateCount: 1,
                returnedCount: 1,
              },
              chunks: [],
              reranking: [],
              original: {
                answer: {
                  text: "answer",
                  grounded: true,
                  citations: [],
                },
              },
              environment: {
                runtime: "node",
                nodeVersion: process.version,
                platform: process.platform,
                nodeEnv: process.env.NODE_ENV,
              },
            },
            reproducible: true,
            command: "npm run rag:replay -- --document-id 'doc-1'",
          },
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
    expect(trace.metadata?.confidenceLevel).toBe("HIGH");
    expect(trace.metadata?.failureCategory).toBe("LOW_CONFIDENCE");
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
