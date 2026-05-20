import { z } from "zod";

export const ExecutionSnapshotSchema = z.object({
  version: z.literal("v1"),
  capturedAt: z.string(),
  mode: z.enum(["inline", "persisted"]),
  query: z.string(),
  correlation: z.object({
    requestId: z.string().optional(),
    sessionId: z.string().optional(),
    traceId: z.string().optional(),
  }),
  document: z.object({
    documentId: z.string(),
    title: z.string().optional(),
    checksum: z.string().optional(),
    persisted: z.boolean(),
    indexPath: z.string().optional(),
    originalFilename: z.string().optional(),
  }),
  indexRef: z.object({
    indexId: z.string(),
    indexVersion: z.string().optional(),
    snapshotId: z.string().optional(),
  }),
  parameters: z.object({
    topK: z.number(),
    reasoningEnabled: z.boolean(),
    useMultiModelOrchestration: z.boolean(),
    enableShadowRetrieval: z.boolean(),
  }),
  retrievalConfig: z.object({
    mode: z.string(),
    candidateCount: z.number(),
    returnedCount: z.number(),
    rerankingApplied: z.boolean(),
  }),
  providers: z.object({
    embeddingProvider: z.string(),
    embeddingModel: z.string().optional(),
    selectedModel: z.string().optional(),
    selectedProvider: z.string().optional(),
  }),
  generation: z.object({
    strategy: z.literal("extractive-grounded"),
    deterministic: z.boolean(),
    config: z.object({
      temperature: z.literal(0),
      topP: z.literal(1),
      maxTokens: z.number().optional(),
    }),
  }),
  prompts: z.object({
    systemPrompt: z.string(),
    answerPolicy: z.string(),
  }),
  policies: z.object({
    groundingPolicy: z.string(),
    refusalPolicy: z.string(),
    citationPolicy: z.string(),
  }),
  chunks: z.array(
    z.object({
      chunkId: z.string(),
      sectionId: z.string(),
      rank: z.number(),
      score: z.number(),
      text: z.string(),
      textHash: z.string(),
      textPreview: z.string(),
    })
  ),
  rerankingConfig: z.object({
    applied: z.boolean(),
    candidateCount: z.number(),
    returnedCount: z.number(),
  }),
  reranking: z.array(
    z.object({
      chunkId: z.string(),
      beforeRank: z.number(),
      afterRank: z.number(),
      finalScore: z.number(),
    })
  ),
  original: z.object({
    answer: z.object({
      text: z.string(),
      grounded: z.boolean(),
      citations: z.array(
        z.object({
          chunkId: z.string(),
          documentId: z.string(),
          sectionId: z.string(),
        })
      ),
    }),
    costUsd: z.number().optional(),
    latencyMs: z.number().optional(),
    groundedness: z.number().optional(),
  }),
  environment: z.object({
    runtime: z.literal("node"),
    nodeVersion: z.string(),
    platform: z.string(),
    nodeEnv: z.string().optional(),
  }),
});

export type ExecutionSnapshot = z.infer<typeof ExecutionSnapshotSchema>;
export type ReplaySnapshot = ExecutionSnapshot;

export const ReplayComparisonReportSchema = z.object({
  version: z.literal("v1"),
  replayId: z.string(),
  originalTraceId: z.string().optional(),
  createdAt: z.string(),
  status: z.enum(["matched", "diverged", "error"]),
  original: ExecutionSnapshotSchema,
  replay: ExecutionSnapshotSchema,
  differences: z.object({
    responseChanged: z.boolean(),
    retrievalChanged: z.boolean(),
    chunkOrderChanged: z.boolean(),
    scoresChanged: z.boolean(),
    groundednessChanged: z.boolean(),
    modelChanged: z.boolean(),
    providerChanged: z.boolean(),
    embeddingProviderChanged: z.boolean(),
    costDeltaUsd: z.number(),
    latencyDeltaMs: z.number(),
    addedChunkIds: z.array(z.string()),
    removedChunkIds: z.array(z.string()),
    reorderedChunkIds: z.array(z.string()),
    scoreDeltas: z.array(
      z.object({
        chunkId: z.string(),
        originalScore: z.number().optional(),
        replayScore: z.number().optional(),
        delta: z.number().optional(),
      })
    ),
  }),
  errors: z.array(z.string()),
  summary: z.array(z.string()),
});

export type ReplayComparisonReport = z.infer<typeof ReplayComparisonReportSchema>;
