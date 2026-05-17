import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { basename, extname } from "path";
import {
  validateNormalizedDocument,
  validateProcessedQuery,
  validateRagAskResponse,
  WorkflowRunner,
  type DocumentModality,
  type ProcessedQuery,
  type WorkflowContext,
  type WorkflowStep,
} from "@groundedos/core";
import { ingest } from "@groundedos/etl";
import { orchestrateAnswerPipeline } from "@groundedos/agents";
import {
  FileSessionMemoryStore,
  type MemoryEntry,
  type MemorySearchResult,
} from "@groundedos/memory";
import { routeModel } from "@groundedos/model-routing";
import {
  CostBudgetEnforcer,
  CostLedger,
  CostTracker,
  TradeoffMetricsStore,
  resolveCostBudgetFromEnv,
  resolveUnitCostUsd,
  type RequestCostSummary,
  type TradeoffMetricsSummary,
} from "@groundedos/observability";
import {
  buildRetrievalIndex,
  createVectorStoreForDualWrite,
  InMemoryVectorStore,
  isVectorDualWriteEnabled,
  LocalHashEmbeddingsProvider,
  OpenAIEmbeddingsProvider,
  OllamaEmbeddingsProvider,
  QdrantVectorStore,
  SemanticCache,
  resolveVectorBackend,
  retrieveForDevMode,
  selectAdaptiveCacheThreshold,
  semanticToEmbeddingProvider,
  type EmbeddingModelInfo,
  type EmbeddingProvider,
  type EmbeddingProviderId,
  type EmbeddingVector,
  type RetrievalIndex,
  type RetrievalDevModeOutput,
  type VectorStore,
} from "@groundedos/rag";
import { processQuery } from "@groundedos/query-understanding";
import {
  FaithfulnessEvaluator,
  RelevanceEvaluator,
  RecallEvaluator,
} from "@groundedos/evals";
import {
  buildRetrievalDiagnostics,
  buildReplaySnapshot,
  calibrateConfidence,
  classifyRetrievalFailure,
  loadReliabilityReportSummaries,
  type ConfidenceCalibration,
  type ReplaySnapshot,
  type ReliabilityReportSummaries,
  type RetrievalDiagnostics,
  type RetrievalFailureClassification,
} from "./retrieval-reliability";
import { ApiRequestError } from "./errors";
import {
  recordEvalHistory,
  getEvalHistorySummary,
} from "./eval-history-store.js";
import {
  deleteRagIndex,
  listRagIndexes,
  loadRagIndex,
  saveRagIndex,
  type PersistedRagIndexListItem,
} from "./rag-index-store";

const DEFAULT_TOP_K = 3;
const EMBEDDING_DIMENSIONS = 64;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_EMBEDDING_MODEL = "embeddinggemma";
const DEFAULT_OLLAMA_EMBEDDING_DIMENSIONS = 768;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MEMORY_RECALL_LIMIT = 3;
const DEFAULT_RETRIEVAL_MODE = "hybrid" as const;
const DEFAULT_RERANK_CANDIDATE_MULTIPLIER = 3;
const DEFAULT_QDRANT_COLLECTION = "rag_chunks";
const DEFAULT_QDRANT_TIMEOUT_MS = 5_000;
const semanticCache = new SemanticCache();
const costLedger = new CostLedger();
const tradeoffMetricsStore = new TradeoffMetricsStore();
const sessionMemoryStore = new FileSessionMemoryStore(
  process.env.GROUNDEDOS_MEMORY_DIR ?? ".groundedos/memory/sessions"
);

// Singleton eval scorers — reused across requests to avoid allocation overhead
const faithfulnessEvaluator = new FaithfulnessEvaluator();
const relevanceEvaluator = new RelevanceEvaluator();
const recallEvaluator = new RecallEvaluator(3);

export { ApiRequestError } from "./errors";

type SupportedApiModality = Extract<DocumentModality, "text" | "pdf">;
type ApiEmbeddingProviderId = Extract<
  EmbeddingProviderId,
  "api-lexical" | "local-hash" | "ollama" | "openai"
>;

const DEFAULT_API_EMBEDDING_PROVIDER: ApiEmbeddingProviderId = "api-lexical";
const API_LEXICAL_MODEL_INFO: EmbeddingModelInfo = {
  provider: "api-lexical",
  model: "api-lexical-v1",
  dimensions: EMBEDDING_DIMENSIONS,
  normalized: true,
};

export type RagAskRequest = {
  type?: DocumentModality;
  content?: string;
  query?: string;
  sessionId?: string;
  topK?: number;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
  useMultiModelOrchestration?: boolean;
  reasoningEnabled?: boolean;
  enableShadowRetrieval?: boolean;
  tenantId?: string;
  ownerId?: string;
  requestId?: string;
  apiKeyId?: string;
};

export type RagAskFileRequest = {
  type?: SupportedApiModality;
  filePath?: string;
  originalFilename?: string;
  query?: string;
  sessionId?: string;
  topK?: number;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
  useMultiModelOrchestration?: boolean;
  reasoningEnabled?: boolean;
  enableShadowRetrieval?: boolean;
  tenantId?: string;
  ownerId?: string;
  requestId?: string;
  apiKeyId?: string;
};

export type RagIndexRequest = {
  type?: DocumentModality;
  content?: string;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
  tenantId?: string;
  ownerId?: string;
  requestId?: string;
  apiKeyId?: string;
};

export type RagIndexFileRequest = {
  type?: SupportedApiModality;
  filePath?: string;
  originalFilename?: string;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
  tenantId?: string;
  ownerId?: string;
  requestId?: string;
  apiKeyId?: string;
};

export type RagDocumentSummary = {
  documentId: string;
  title: string;
  modality: SupportedApiModality;
  checksum: string;
  originalFilename?: string;
};

export type RagIndexSummary = {
  chunkCount: number;
  embeddingProvider: string;
  embeddingDimensions: number;
  embeddingModel?: EmbeddingModelInfo;
};

export type RagAskResponse = {
  document: RagDocumentSummary;
  query: string;
  answer: GroundedAnswer;
  index: RagIndexSummary;
  storage?: {
    persisted: boolean;
    indexPath?: string;
  };
  devMode: RetrievalDevModeOutput & {
    processedQuery?: ProcessedQuery;
    workflowContext?: WorkflowContext;
    cache?: {
      hit: boolean;
      similarity?: number;
      thresholdUsed?: number;
      adaptiveThresholdReason?: string;
      cacheKey?: string;
      contextHash?: string;
      reason?: string;
      quality?: {
        score?: number;
        label?: "high" | "medium" | "low";
        shadowChecked?: boolean;
      };
      savingsMs?: number;
      hits?: number;
      misses?: number;
      evictions?: number;
      hitRate?: number;
    };
    routing?: {
      selectedModel: string;
      selectedProvider: string;
      reason: string;
      stage?: "pre-retrieval" | "post-retrieval";
      strategy?: "query-only" | "hybrid";
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
      retrievalSignals?: RetrievalRoutingSignalsSummary;
      initialDecision?: {
        selectedModel: string;
        selectedProvider: string;
        reason: string;
        confidence: number;
        tradeoff: {
          latency: string;
          cost: string;
          quality: string;
        };
      };
      refinement?: {
        changed: boolean;
        reason: string;
        triggeredBy: string[];
      };
    };
    orchestration?: {
      mode: "single-model" | "multi-model";
      enabled: boolean;
      steps: Array<{
        id: string;
        model: string;
        role: string;
        inputPreview: string;
        outputPreview: string;
        durationMs: number;
        grounded?: boolean;
        qualityDelta?: number;
      }>;
      comparison?: {
        singleModelAnswer: string;
        multiModelAnswer: string;
      };
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
      scorerResults?: {
        faithfulness?: { score: number; passed: boolean; reason?: string };
        relevance?: { score: number; passed: boolean; reason?: string };
        recall?: { score: number; passed: boolean; reason?: string };
        averageScore: number;
        passedCount: number;
      };
      evalHistory?: {
        count: number;
        avgPipelineScore: number;
        avgFaithfulness: number;
        avgRelevance: number;
        trend: "improving" | "declining" | "stable";
        recent: Array<{
          timestamp: number;
          query: string;
          pipelineScore: number;
          scorerResults?: { averageScore: number; passedCount: number };
        }>;
      };
      taxonomy?: RetrievalFailureClassification;
      confidence?: ConfidenceCalibration;
    };
    costBreakdown?: {
      embeddingsUsd: number;
      retrievalUsd: number;
      generationUsd: number;
      totalUsd: number;
    };
    cacheAwareRetrieval?: {
      influenced: boolean;
      boostedChunkIds: string[];
      hybridScoreMode: string;
    };
    cost?: RequestCostSummary;
    memory?: {
      sessionId?: string;
      recalled: number;
      stored: boolean;
      matches: Array<{
        score: number;
        query: string;
        answer: string;
        createdAt: number;
      }>;
    };
    reranking?: {
      applied: boolean;
      candidateCount: number;
      returnedCount: number;
      candidates?: Array<{
        chunkId: string;
        sectionId: string;
        beforeRank: number;
        afterRank: number;
        hybridScore: number;
        lexicalOverlapScore: number;
        finalScore: number;
      }>;
    };
    stageMetrics?: Array<{
      stage: "process-query" | "retrieve-chunks" | "rerank-chunks";
      durationMs: number;
      inputTokens: number;
      outputUnits: number;
    }>;
    retrievalSpans?: {
      stage: "retrieve-chunks" | "rerank-chunks";
      latencyMs: number;
      chunkCount: number;
      score: {
        min: number;
        max: number;
        avg: number;
      };
    }[];
    contextEngineering?: {
      retrievalQuery: string;
      rewrittenQuery?: string;
      expansionTerms: string[];
      memoryAugmented: boolean;
      memoryRecallCount: number;
      candidateCount: number;
      returnedCount: number;
      selectedChunkIds: string[];
      selectedSections: string[];
      tokenEstimate: {
        rawQuery: number;
        retrievalQuery: number;
        retrievedContext: number;
        answer: number;
      };
      truncation: {
        applied: boolean;
        keptRatio: number;
      };
    };
    agentLoop?: {
      enabled: boolean;
      mode: "inline-rag-agent";
      steps: Array<{
        id: string;
        type: "reasoning" | "tool" | "decision";
        title: string;
        detail: string;
        model?: string;
        durationMs?: number;
      }>;
    };
    retrievalDiagnostics?: RetrievalDiagnostics;
    replay?: {
      snapshot: ReplaySnapshot;
      reproducible: boolean;
      command: string;
    };
    reportReferences?: ReliabilityReportSummaries;
  };
};

type RetrievalRoutingSignalsSummary = {
  resultCount: number;
  topScore: number;
  avgScore: number;
  scoreSpread: number;
  groundedResultRatio: number;
  uniqueDocuments: number;
};

export type RagIndexResponse = {
  document: RagDocumentSummary;
  index: RagIndexSummary;
  storage: {
    persisted: true;
    indexPath: string;
  };
};

export type RagIndexListResponse = {
  count: number;
  indexes: PersistedRagIndexListItem[];
};

export type RagIndexDeleteResponse = {
  deleted: true;
  index: PersistedRagIndexListItem;
};

export type RagEmbeddingMapPoint = {
  chunkId: string;
  documentId: string;
  sectionId: string;
  x: number;
  y: number;
  clusterLabel: string;
  textPreview: string;
  offsets: {
    startOffset: number;
    endOffset: number;
    offsetBasis: string;
  };
};

export type RagEmbeddingMapCluster = {
  label: string;
  count: number;
  centroid: {
    x: number;
    y: number;
  };
};

export type RagEmbeddingMapResponse = {
  document: RagDocumentSummary;
  index: RagIndexSummary;
  projection: {
    method: "variance-dimensions";
    xDimension: number;
    yDimension: number;
  };
  points: RagEmbeddingMapPoint[];
  clusters: RagEmbeddingMapCluster[];
};

export type RagTradeoffMetricsResponse = TradeoffMetricsSummary;

export type RagModelBenchmarkStatus = "completed" | "skipped" | "error";

export type RagModelBenchmarkQueryRun = {
  id: string;
  question: string;
  status: RagModelBenchmarkStatus;
  latencyMs: number;
  answer?: string;
  error?: string;
  expectedAnswerContains: string[];
  containsExpectedAnswer: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  costUsd: number;
  evals?: {
    faithfulness: number;
    relevance: number;
    quality: number;
  };
  retrievedChunkIds: string[];
};

export type RagModelBenchmarkProviderRun = {
  provider: string;
  kind: "local" | "ollama" | "cloud";
  model: string;
  status: RagModelBenchmarkStatus;
  skippedReason?: string;
  metrics: {
    requestCount: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    avgFaithfulness: number;
    avgRelevance: number;
    avgQuality: number;
    containsExpectedAnswerRate: number;
    avgCostUsd: number;
    totalCostUsd: number;
  };
  perQuery: RagModelBenchmarkQueryRun[];
};

export type RagModelBenchmarkResponse = {
  timestamp: string;
  version: number;
  phase: string;
  description: string;
  dataset: string;
  goldenSize: number;
  topK: number;
  requestedProviders: string[];
  successCriteria: {
    atLeastTwoProvidersCompleted: boolean;
    includesLocalProvider: boolean;
    includesOllamaProvider: boolean;
    includesCloudProvider: boolean;
    phase4ModelBenchmarkPassed: boolean;
    note: string;
  };
  providers: RagModelBenchmarkProviderRun[];
  summary: {
    completedProviders: string[];
    skippedProviders: string[];
    errorProviders: string[];
    bestByQuality?: string;
    bestByLatency?: string;
    bestByCost?: string;
  };
};

export type RagModelBenchmarkPrecheckProvider = "local-extractive" | "ollama" | "openai" | "groq";

export type RagModelBenchmarkPrecheckStatus = "pass" | "fail" | "warn";

export type RagModelBenchmarkPrecheckItem = {
  name: string;
  status: RagModelBenchmarkPrecheckStatus;
  detail: string;
};

export type RagModelBenchmarkPrecheckProviderResult = {
  provider: RagModelBenchmarkPrecheckProvider;
  ready: boolean;
  checks: RagModelBenchmarkPrecheckItem[];
  blocker?: string;
};

export type RagModelBenchmarkPrecheckResponse = {
  timestamp: string;
  requestedProviders: RagModelBenchmarkPrecheckProvider[];
  phase4Ready: boolean;
  strictMode: boolean;
  results: RagModelBenchmarkPrecheckProviderResult[];
  nextAction: string;
};

export type RagModelBenchmarkRunResponse = {
  startedAt: string;
  finishedAt: string;
  command: string;
  providers: string[];
  success: boolean;
  output: string;
};

export type RagAdminClearIndexesResponse = {
  deletedCount: number;
  deletedDocumentIds: string[];
};

export type RagAdminCostSummaryResponse = {
  dailyTotalUsd: number;
  tradeoffs: RagTradeoffMetricsResponse;
};

export type RagSessionMemoryResponse = {
  sessionId: string;
  count: number;
  entries: MemoryEntry[];
};

export type GroundedAnswer = {
  grounded: boolean;
  text: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    sectionId: string;
    score: number;
    source: RetrievalDevModeOutput["results"][number]["source"];
    offsets: RetrievalDevModeOutput["results"][number]["offsets"];
  }>;
};

export function getRagTradeoffMetrics(): RagTradeoffMetricsResponse {
  return tradeoffMetricsStore.getSummary();
}

export async function clearAllPersistedRagIndexes(
  indexDir?: string
): Promise<RagAdminClearIndexesResponse> {
  const indexes = await listRagIndexes(indexDir);
  const deletedDocumentIds: string[] = [];

  for (const item of indexes) {
    await deleteRagIndex(item.document.documentId, indexDir);
    semanticCache.invalidate(item.document.documentId);
    deletedDocumentIds.push(item.document.documentId);
  }

  return {
    deletedCount: deletedDocumentIds.length,
    deletedDocumentIds,
  };
}

export async function getRagAdminCostSummary(): Promise<RagAdminCostSummaryResponse> {
  return {
    dailyTotalUsd: await costLedger.getDailyTotalUsd(),
    tradeoffs: getRagTradeoffMetrics(),
  };
}

export async function getRagSessionMemory(
  sessionId: string,
  limit = 20,
  ownerId?: string,
  tenantId?: string
): Promise<RagSessionMemoryResponse> {
  const normalized = normalizeSessionId(sessionId);
  const scopedSessionId = createOwnedSessionId(ownerId, normalized, tenantId);
  const entries = await sessionMemoryStore.list(scopedSessionId, limit);

  return {
    sessionId: normalized,
    count: entries.length,
    entries,
  };
}

export async function resetRagRuntimeStateForTests(): Promise<void> {
  semanticCache.clear();
  tradeoffMetricsStore.clear();
  await sessionMemoryStore.clearAll();
}

class ApiLexicalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "api-lexical";
  readonly dimensions = EMBEDDING_DIMENSIONS;
  readonly modelInfo = API_LEXICAL_MODEL_INFO;

  async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((text) => this.embedText(text));
  }

  private embedText(text: string): EmbeddingVector {
    const vector = Array.from({ length: this.dimensions }, () => 0);

    for (const token of tokenize(text)) {
      vector[hashToken(token) % this.dimensions] += 1;
    }

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0)
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => Number((value / magnitude).toFixed(12)));
  }
}

export async function askRag(request: RagAskRequest): Promise<RagAskResponse> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  if (request.content === undefined) {
    return await askPersistedRag(request);
  }

  const normalizedRequest = normalizeRequest(request);
  const checksum = createHash("sha256")
    .update(normalizedRequest.content)
    .digest("hex");
  const documentId = normalizedRequest.documentId ?? `api-${checksum.slice(0, 16)}`;
  const title = normalizedRequest.title ?? "Inline text";
  const document = await ingest({
    type: "text",
    content: normalizedRequest.content,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
    },
  });
  validateNormalizedDocument(document);
  const ragOutput = await runLocalRag(
    document,
    normalizedRequest.query,
    normalizedRequest.topK,
    normalizedRequest.embeddingProvider,
    normalizedRequest.sessionId,
    request.ownerId,
    request.tenantId,
    {
      useMultiModelOrchestration: normalizedRequest.useMultiModelOrchestration,
      reasoningEnabled: normalizedRequest.reasoningEnabled,
      enableShadowRetrieval: normalizedRequest.enableShadowRetrieval,
    }
  );

  const response: RagAskResponse = {
    document: {
      documentId,
      title,
      modality: "text",
      checksum,
    },
    query: normalizedRequest.query,
    ...ragOutput,
  };

  validateRagAskResponse(response);

  return response;
}

export async function askRagFromFile(
  request: RagAskFileRequest
): Promise<RagAskResponse> {
  const normalizedRequest = normalizeFileRequest(request);
  const rawBytes = await readFile(normalizedRequest.filePath);
  const checksum = createHash("sha256").update(rawBytes).digest("hex");
  const documentId = normalizedRequest.documentId ?? `upload-${checksum.slice(0, 16)}`;
  const title =
    normalizedRequest.title ??
    normalizedRequest.originalFilename ??
    basename(normalizedRequest.filePath);
  const document = await ingest({
    type: normalizedRequest.type,
    filePath: normalizedRequest.filePath,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
      originalFilename: normalizedRequest.originalFilename,
    },
  });
  validateNormalizedDocument(document);
  const ragOutput = await runLocalRag(
    document,
    normalizedRequest.query,
    normalizedRequest.topK,
    normalizedRequest.embeddingProvider,
    normalizedRequest.sessionId,
    request.ownerId,
    request.tenantId,
    {
      useMultiModelOrchestration: normalizedRequest.useMultiModelOrchestration,
      reasoningEnabled: normalizedRequest.reasoningEnabled,
      enableShadowRetrieval: normalizedRequest.enableShadowRetrieval,
    }
  );

  const response: RagAskResponse = {
    document: {
      documentId,
      title,
      modality: normalizedRequest.type,
      checksum,
      originalFilename: normalizedRequest.originalFilename,
    },
    query: normalizedRequest.query,
    ...ragOutput,
  };

  validateRagAskResponse(response);

  return response;
}

export async function indexRag(request: RagIndexRequest): Promise<RagIndexResponse> {
  const normalizedRequest = normalizeIndexRequest(request);
  const checksum = createHash("sha256")
    .update(normalizedRequest.content)
    .digest("hex");
  const documentId = normalizedRequest.documentId ?? `api-${checksum.slice(0, 16)}`;
  const title = normalizedRequest.title ?? "Inline text";
  const document = await ingest({
    type: "text",
    content: normalizedRequest.content,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
    },
  });
  validateNormalizedDocument(document);
  const provider = createApiEmbeddingProvider(normalizedRequest.embeddingProvider);
  const index = await buildRetrievalIndex(document, {
    embeddingProvider: provider,
    store: createApiVectorStore(),
  });
  const documentSummary: RagDocumentSummary = {
    documentId,
    title,
    modality: "text",
    checksum,
  };
  const indexSummary = createIndexSummary(index);
  const ownership = resolveOwnershipForPersistence(request.ownerId, request.tenantId);
  const saved = await saveRagIndex(
    {
      ownership,
      resourceOwner: ownership.userId,
      document: documentSummary,
      index: indexSummary,
      embeddedChunks: index.embeddedChunks,
    },
    normalizedRequest.indexDir
  );

  semanticCache.invalidate(documentId);

  return {
    document: documentSummary,
    index: indexSummary,
    storage: {
      persisted: true,
      indexPath: saved.relativeIndexPath,
    },
  };
}

export async function indexRagFromFile(
  request: RagIndexFileRequest
): Promise<RagIndexResponse> {
  const normalizedRequest = normalizeIndexFileRequest(request);
  const rawBytes = await readFile(normalizedRequest.filePath);
  const checksum = createHash("sha256").update(rawBytes).digest("hex");
  const documentId = normalizedRequest.documentId ?? `upload-${checksum.slice(0, 16)}`;
  const title =
    normalizedRequest.title ??
    normalizedRequest.originalFilename ??
    basename(normalizedRequest.filePath);
  const document = await ingest({
    type: normalizedRequest.type,
    filePath: normalizedRequest.filePath,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
      originalFilename: normalizedRequest.originalFilename,
    },
  });
  validateNormalizedDocument(document);
  const provider = createApiEmbeddingProvider(normalizedRequest.embeddingProvider);
  const index = await buildRetrievalIndex(document, {
    embeddingProvider: provider,
    store: createApiVectorStore(),
  });
  const documentSummary: RagDocumentSummary = {
    documentId,
    title,
    modality: normalizedRequest.type,
    checksum,
    originalFilename: normalizedRequest.originalFilename,
  };
  const indexSummary = createIndexSummary(index);
  const ownership = resolveOwnershipForPersistence(request.ownerId, request.tenantId);
  const saved = await saveRagIndex(
    {
      ownership,
      resourceOwner: ownership.userId,
      document: documentSummary,
      index: indexSummary,
      embeddedChunks: index.embeddedChunks,
    },
    normalizedRequest.indexDir
  );

  semanticCache.invalidate(documentId);

  return {
    document: documentSummary,
    index: indexSummary,
    storage: {
      persisted: true,
      indexPath: saved.relativeIndexPath,
    },
  };
}

export async function askPersistedRag(
  request: Pick<
    RagAskRequest,
    | "documentId"
    | "query"
    | "topK"
    | "indexDir"
    | "sessionId"
    | "ownerId"
    | "tenantId"
    | "useMultiModelOrchestration"
    | "reasoningEnabled"
    | "enableShadowRetrieval"
  >
): Promise<RagAskResponse> {
  const normalizedRequest = normalizePersistedAskRequest(request);
  const saved = await loadRagIndex(
    normalizedRequest.documentId,
    normalizedRequest.indexDir,
    resolveOwnershipForLookup(normalizedRequest.ownerId, normalizedRequest.tenantId)
  );
  const provider = createApiEmbeddingProviderFromIndex(
    saved.record.index,
    normalizedRequest.documentId
  );

  const store = createApiVectorStore();
  store.insert(saved.record.embeddedChunks);

  const ragOutput = await runPersistedRag(
    {
      embeddingProvider: provider,
      store,
      embeddedChunks: saved.record.embeddedChunks,
    },
    normalizedRequest.query,
    normalizedRequest.topK,
    normalizedRequest.sessionId,
    normalizedRequest.ownerId,
    normalizedRequest.tenantId,
    {
      useMultiModelOrchestration: normalizedRequest.useMultiModelOrchestration,
      reasoningEnabled: normalizedRequest.reasoningEnabled,
      enableShadowRetrieval: normalizedRequest.enableShadowRetrieval,
    }
  );

  const response: RagAskResponse = {
    document: saved.record.document,
    query: normalizedRequest.query,
    storage: {
      persisted: true,
      indexPath: saved.relativeIndexPath,
    },
    ...ragOutput,
  };

  validateRagAskResponse(response);

  return response;
}

export async function listPersistedRagIndexes(
  indexDir?: string,
  ownerId?: string,
  tenantId?: string
): Promise<RagIndexListResponse> {
  const indexes = await listRagIndexes(indexDir, resolveOwnershipForLookup(ownerId, tenantId));

  return {
    count: indexes.length,
    indexes,
  };
}

export async function getPersistedRagEmbeddingMap(
  documentId: string,
  indexDir?: string,
  ownerId?: string,
  tenantId?: string
): Promise<RagEmbeddingMapResponse> {
  if (typeof documentId !== "string" || documentId.trim().length === 0) {
    throw new ApiRequestError("documentId must be a non-empty string.");
  }

  const saved = await loadRagIndex(
    documentId.trim(),
    indexDir,
    resolveOwnershipForLookup(ownerId, tenantId)
  );
  const chunks = saved.record.embeddedChunks;
  const { xDimension, yDimension } = selectProjectionDimensions(
    chunks.map((chunk) => chunk.embedding)
  );
  const rawPoints = chunks.map((chunk) => ({
    chunk,
    x: chunk.embedding[xDimension] ?? 0,
    y: chunk.embedding[yDimension] ?? 0,
  }));
  const xs = rawPoints.map((point) => point.x);
  const ys = rawPoints.map((point) => point.y);
  const points: RagEmbeddingMapPoint[] = rawPoints.map(({ chunk, x, y }) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    sectionId: chunk.sectionId,
    x: normalizeProjectionValue(x, xs),
    y: normalizeProjectionValue(y, ys),
    clusterLabel: chunk.sectionId,
    textPreview: previewChunkText(chunk.text),
    offsets: {
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      offsetBasis:
        typeof chunk.metadata.offsetBasis === "string"
          ? chunk.metadata.offsetBasis
          : "document",
    },
  }));

  return {
    document: saved.record.document,
    index: saved.record.index,
    projection: {
      method: "variance-dimensions",
      xDimension,
      yDimension,
    },
    points,
    clusters: buildEmbeddingMapClusters(points),
  };
}

export async function deletePersistedRagIndex(
  documentId: string,
  indexDir?: string,
  ownerId?: string,
  tenantId?: string
): Promise<RagIndexDeleteResponse> {
  if (typeof documentId !== "string" || documentId.trim().length === 0) {
    throw new ApiRequestError("documentId must be a non-empty string.");
  }

  const index = await deleteRagIndex(
    documentId.trim(),
    indexDir,
    resolveOwnershipForLookup(ownerId, tenantId)
  );
  semanticCache.invalidate(documentId.trim());

  return {
    deleted: true,
    index,
  };
}

function selectProjectionDimensions(vectors: EmbeddingVector[]): {
  xDimension: number;
  yDimension: number;
} {
  const dimensions = vectors[0]?.length ?? 0;

  if (dimensions <= 1) {
    return { xDimension: 0, yDimension: 0 };
  }

  const variances = Array.from({ length: dimensions }, (_, dimension) => {
    const values = vectors.map((vector) => vector[dimension] ?? 0);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

    return { dimension, variance };
  }).sort((left, right) => right.variance - left.variance || left.dimension - right.dimension);

  return {
    xDimension: variances[0]?.dimension ?? 0,
    yDimension: variances[1]?.dimension ?? variances[0]?.dimension ?? 0,
  };
}

function normalizeProjectionValue(value: number, values: number[]): number {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return 50;
  }

  return Number((8 + ((value - min) / (max - min)) * 84).toFixed(2));
}

function previewChunkText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function buildEmbeddingMapClusters(
  points: RagEmbeddingMapPoint[]
): RagEmbeddingMapCluster[] {
  const byLabel = new Map<string, RagEmbeddingMapPoint[]>();

  for (const point of points) {
    const bucket = byLabel.get(point.clusterLabel) ?? [];
    bucket.push(point);
    byLabel.set(point.clusterLabel, bucket);
  }

  return Array.from(byLabel.entries())
    .map(([label, clusterPoints]) => ({
      label,
      count: clusterPoints.length,
      centroid: {
        x: Number(
          (
            clusterPoints.reduce((sum, point) => sum + point.x, 0) /
            clusterPoints.length
          ).toFixed(2)
        ),
        y: Number(
          (
            clusterPoints.reduce((sum, point) => sum + point.y, 0) /
            clusterPoints.length
          ).toFixed(2)
        ),
      },
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeRequest(request: RagAskRequest): Required<
  Pick<
    RagAskRequest,
    | "content"
    | "query"
    | "topK"
    | "embeddingProvider"
    | "useMultiModelOrchestration"
    | "reasoningEnabled"
    | "enableShadowRetrieval"
  >
> &
  Pick<RagAskRequest, "title" | "documentId" | "metadata" | "sessionId"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  const type = request.type ?? "text";

  if (type !== "text") {
    throw new ApiRequestError(
      'JSON API currently supports only type "text". Use multipart/form-data for text or PDF file uploads.'
    );
  }

  if (typeof request.content !== "string" || request.content.trim().length === 0) {
    throw new ApiRequestError("content must be a non-empty string.");
  }

  if (typeof request.query !== "string" || request.query.trim().length === 0) {
    throw new ApiRequestError("query must be a non-empty string.");
  }

  const topK = request.topK ?? DEFAULT_TOP_K;

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new ApiRequestError("topK must be a positive integer.");
  }

  if (request.title !== undefined && typeof request.title !== "string") {
    throw new ApiRequestError("title must be a string when provided.");
  }

  if (request.documentId !== undefined && typeof request.documentId !== "string") {
    throw new ApiRequestError("documentId must be a string when provided.");
  }

  if (request.sessionId !== undefined && typeof request.sessionId !== "string") {
    throw new ApiRequestError("sessionId must be a string when provided.");
  }

  if (
    request.metadata !== undefined &&
    (!request.metadata || typeof request.metadata !== "object" || Array.isArray(request.metadata))
  ) {
    throw new ApiRequestError("metadata must be an object when provided.");
  }

  validateOptionalBoolean(request.useMultiModelOrchestration, "useMultiModelOrchestration");
  validateOptionalBoolean(request.reasoningEnabled, "reasoningEnabled");
  validateOptionalBoolean(request.enableShadowRetrieval, "enableShadowRetrieval");

  return {
    content: request.content,
    query: request.query.trim(),
    topK,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    useMultiModelOrchestration: request.useMultiModelOrchestration ?? true,
    reasoningEnabled: request.reasoningEnabled ?? false,
    enableShadowRetrieval: request.enableShadowRetrieval ?? true,
    title: request.title,
    documentId: request.documentId,
    sessionId: request.sessionId,
    metadata: request.metadata,
  };
}

function normalizeIndexRequest(request: RagIndexRequest): Required<
  Pick<RagIndexRequest, "content" | "embeddingProvider">
> &
  Pick<
    RagIndexRequest,
    "title" | "documentId" | "metadata" | "indexDir" | "ownerId" | "tenantId"
  > {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  const type = request.type ?? "text";

  if (type !== "text") {
    throw new ApiRequestError(
      'JSON index API currently supports only type "text". Use multipart/form-data for text or PDF file uploads.'
    );
  }

  if (typeof request.content !== "string" || request.content.trim().length === 0) {
    throw new ApiRequestError("content must be a non-empty string.");
  }

  validateOptionalString(request.title, "title");
  validateOptionalString(request.documentId, "documentId");
  validateOptionalMetadata(request.metadata);

  return {
    content: request.content,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
    indexDir: request.indexDir,
    ownerId: request.ownerId,
    tenantId: request.tenantId,
  };
}

function normalizeFileRequest(request: RagAskFileRequest): Required<
  Pick<
    RagAskFileRequest,
    | "filePath"
    | "query"
    | "topK"
    | "type"
    | "embeddingProvider"
    | "useMultiModelOrchestration"
    | "reasoningEnabled"
    | "enableShadowRetrieval"
  >
> &
  Pick<RagAskFileRequest, "title" | "documentId" | "metadata" | "originalFilename" | "sessionId"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Multipart request data must be provided.");
  }

  if (typeof request.filePath !== "string" || request.filePath.trim().length === 0) {
    throw new ApiRequestError("file upload is required.");
  }

  const type = request.type ?? inferModality(request.originalFilename ?? request.filePath);

  if (type !== "text" && type !== "pdf") {
    throw new ApiRequestError('type must be "text" or "pdf" for file uploads.');
  }

  if (typeof request.query !== "string" || request.query.trim().length === 0) {
    throw new ApiRequestError("query must be a non-empty string.");
  }

  const topK = request.topK ?? DEFAULT_TOP_K;

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new ApiRequestError("topK must be a positive integer.");
  }

  if (request.title !== undefined && typeof request.title !== "string") {
    throw new ApiRequestError("title must be a string when provided.");
  }

  if (request.documentId !== undefined && typeof request.documentId !== "string") {
    throw new ApiRequestError("documentId must be a string when provided.");
  }

  if (request.sessionId !== undefined && typeof request.sessionId !== "string") {
    throw new ApiRequestError("sessionId must be a string when provided.");
  }

  if (
    request.metadata !== undefined &&
    (!request.metadata || typeof request.metadata !== "object" || Array.isArray(request.metadata))
  ) {
    throw new ApiRequestError("metadata must be an object when provided.");
  }

  validateOptionalBoolean(request.useMultiModelOrchestration, "useMultiModelOrchestration");
  validateOptionalBoolean(request.reasoningEnabled, "reasoningEnabled");
  validateOptionalBoolean(request.enableShadowRetrieval, "enableShadowRetrieval");

  return {
    filePath: request.filePath,
    query: request.query.trim(),
    topK,
    type,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    useMultiModelOrchestration: request.useMultiModelOrchestration ?? true,
    reasoningEnabled: request.reasoningEnabled ?? false,
    enableShadowRetrieval: request.enableShadowRetrieval ?? true,
    title: request.title,
    documentId: request.documentId,
    sessionId: request.sessionId,
    metadata: request.metadata,
    originalFilename: request.originalFilename,
  };
}

function normalizeIndexFileRequest(request: RagIndexFileRequest): Required<
  Pick<RagIndexFileRequest, "filePath" | "type" | "embeddingProvider">
> &
  Pick<
    RagIndexFileRequest,
    | "title"
    | "documentId"
    | "metadata"
    | "originalFilename"
    | "indexDir"
    | "ownerId"
    | "tenantId"
  > {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Multipart request data must be provided.");
  }

  if (typeof request.filePath !== "string" || request.filePath.trim().length === 0) {
    throw new ApiRequestError("file upload is required.");
  }

  const type = request.type ?? inferModality(request.originalFilename ?? request.filePath);

  if (type !== "text" && type !== "pdf") {
    throw new ApiRequestError('type must be "text" or "pdf" for file uploads.');
  }

  validateOptionalString(request.title, "title");
  validateOptionalString(request.documentId, "documentId");
  validateOptionalMetadata(request.metadata);

  return {
    filePath: request.filePath,
    type,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
    originalFilename: request.originalFilename,
    indexDir: request.indexDir,
    ownerId: request.ownerId,
    tenantId: request.tenantId,
  };
}

function normalizePersistedAskRequest(
  request: Pick<
    RagAskRequest,
    | "documentId"
    | "query"
    | "topK"
    | "indexDir"
    | "sessionId"
    | "ownerId"
    | "tenantId"
    | "useMultiModelOrchestration"
    | "reasoningEnabled"
    | "enableShadowRetrieval"
  >
): Required<
  Pick<
    RagAskRequest,
    | "documentId"
    | "query"
    | "topK"
    | "useMultiModelOrchestration"
    | "reasoningEnabled"
    | "enableShadowRetrieval"
  >
> &
  Pick<RagAskRequest, "indexDir" | "sessionId" | "ownerId" | "tenantId"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  if (typeof request.documentId !== "string" || request.documentId.trim().length === 0) {
    throw new ApiRequestError("documentId must be a non-empty string.");
  }

  if (typeof request.query !== "string" || request.query.trim().length === 0) {
    throw new ApiRequestError("query must be a non-empty string.");
  }

  if (request.sessionId !== undefined && typeof request.sessionId !== "string") {
    throw new ApiRequestError("sessionId must be a string when provided.");
  }

  validateOptionalBoolean(request.useMultiModelOrchestration, "useMultiModelOrchestration");
  validateOptionalBoolean(request.reasoningEnabled, "reasoningEnabled");
  validateOptionalBoolean(request.enableShadowRetrieval, "enableShadowRetrieval");

  const topK = request.topK ?? DEFAULT_TOP_K;

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new ApiRequestError("topK must be a positive integer.");
  }

  return {
    documentId: request.documentId.trim(),
    query: request.query.trim(),
    topK,
    useMultiModelOrchestration: request.useMultiModelOrchestration ?? true,
    reasoningEnabled: request.reasoningEnabled ?? false,
    enableShadowRetrieval: request.enableShadowRetrieval ?? true,
    indexDir: request.indexDir,
    sessionId: request.sessionId,
    ownerId: request.ownerId,
    tenantId: request.tenantId,
  };
}
async function runLocalRag(
  document: Awaited<ReturnType<typeof ingest>>,
  query: string,
  topK: number,
  embeddingProviderId: ApiEmbeddingProviderId,
  sessionId?: string,
  ownerId?: string,
  tenantId?: string,
  options?: {
    useMultiModelOrchestration?: boolean;
    reasoningEnabled?: boolean;
    enableShadowRetrieval?: boolean;
  }
): Promise<Pick<RagAskResponse, "answer" | "index" | "devMode">> {
  const provider = createApiEmbeddingProvider(embeddingProviderId);
  const budget = resolveCostBudgetFromEnv();
  const budgetEnforcer = new CostBudgetEnforcer(budget);
  const dailySpentUsd = await costLedger.getDailyTotalUsd();

  type RagWorkflowState = {
    document: Awaited<ReturnType<typeof ingest>>;
    rawQuery: string;
    retrievalQuery: string;
    topK: number;
    provider: EmbeddingProvider;
    index?: RetrievalIndex;
    processedQuery?: ProcessedQuery;
    devMode?: RetrievalDevModeOutput;
    answer?: GroundedAnswer;
    indexSummary?: RagIndexSummary;
    queryEmbedding?: EmbeddingVector;
    cacheHit?: boolean;
    cacheSimilarity?: number;
    cacheThresholdUsed?: number;
    cacheAdaptiveReason?: string;
    cacheLookupReason?: string;
    cacheKey?: string;
    cacheContextHash?: string;
    cachedCandidateChunkIds?: string[];
    cacheQualityLabel?: "high" | "medium" | "low";
    cacheQualityScore?: number;
    cacheShadowChecked?: boolean;
    cacheSavingsMs?: number;
    initialRoutingDecision?: ReturnType<typeof routeModel>;
    routingDecision?: ReturnType<typeof routeModel>;
    routingSignals?: RetrievalRoutingSignalsSummary;
    orchestration?: ReturnType<typeof orchestrateAnswerPipeline>;
    reasoningSummary?: string[];
    decisionSteps?: string[];
    evals?: {
      groundedness: number;
      answerOverlap: number;
      retrievalAccuracy: number;
      pipelineScore: number;
      modelScore: number;
      scorerResults?: {
        faithfulness?: { score: number; passed: boolean; reason?: string };
        relevance?: { score: number; passed: boolean; reason?: string };
        recall?: { score: number; passed: boolean; reason?: string };
        averageScore: number;
        passedCount: number;
      };
    };
    cacheAwareRetrieval?: {
      influenced: boolean;
      boostedChunkIds: string[];
      hybridScoreMode: string;
    };
    sessionId?: string;
    ownerId?: string;
    tenantId?: string;
    memoryMatches?: MemorySearchResult[];
    memoryStored?: boolean;
    rerankCandidateCount?: number;
    rerankInputTokens?: number;
    costTracker: CostTracker;
    costSummary?: RequestCostSummary;
  };

  const steps: Array<WorkflowStep<RagWorkflowState, RagWorkflowState>> = [
    {
      name: "normalize-request",
      async run(input) {
        return {
          ...input,
          retrievalQuery: input.rawQuery.trim(),
        };
      },
    },
    {
      name: "load-memory",
      async run(input) {
        if (!input.sessionId) {
          return {
            ...input,
            memoryMatches: [],
          };
        }

        const matches = await sessionMemoryStore.search(
          createOwnedSessionId(input.ownerId, input.sessionId, input.tenantId),
          input.rawQuery,
          DEFAULT_MEMORY_RECALL_LIMIT
        );

        return {
          ...input,
          memoryMatches: matches,
        };
      },
    },
    {
      name: "ingest-document",
      async run(input) {
        validateNormalizedDocument(input.document);
        return input;
      },
    },
    {
      name: "build-index",
      async run(input) {
        const estimatedUnits = Math.max(1, input.document.content.sections.length);
        const projected =
          input.costTracker.getTotalCostUsd() +
          estimatedUnits * resolveUnitCostUsd(input.provider.name, "embedding-index");
        budgetEnforcer.validateBudget(input.document.documentId, projected, dailySpentUsd);

        const index = await buildRetrievalIndex(input.document, {
          embeddingProvider: input.provider,
          store: createApiVectorStore(),
        });

        const chunkUnits = index.embeddedChunks.length;
        input.costTracker.trackEvent(
          "embedding-index",
          input.provider.name,
          chunkUnits,
          resolveUnitCostUsd(input.provider.name, "embedding-index"),
          { timestamp: Date.now(), documentId: input.document.documentId, chunkUnits }
        );

        return {
          ...input,
          index,
          indexSummary: createIndexSummary(index),
        };
      },
    },
    {
      name: "process-query",
      async run(input) {
        const processedQuery = processQuery({ text: input.rawQuery });
        validateProcessedQuery(processedQuery);
        const routingDecision = routeModel(input.rawQuery);

        const memoryHint = (input.memoryMatches ?? [])
          .map((match) => `${match.entry.query} ${match.entry.answer}`)
          .join(" ")
          .trim();

        const retrievalQuery = [
          processedQuery.rewritten ?? processedQuery.original,
          ...processedQuery.expanded,
          memoryHint,
        ]
          .join(" ")
          .trim();

        return {
          ...input,
          processedQuery,
          initialRoutingDecision: routingDecision,
          routingDecision,
          decisionSteps: [
            `intent=${processedQuery.intent}`,
            `confidence=${processedQuery.confidence.toFixed(2)}`,
            `selectedModel=${routingDecision.selectedModel}`,
          ],
          retrievalQuery: retrievalQuery.length > 0 ? retrievalQuery : input.rawQuery,
        };
      },
    },
    {
      name: "cache-lookup",
      async run(input) {
        if (!input.index) {
          throw new ApiRequestError("RAG workflow index was not built.", 500);
        }

        if (input.sessionId) {
          return {
            ...input,
            cacheHit: false,
            cacheSimilarity: undefined,
            cacheLookupReason: "session-memory-enabled",
          };
        }

        const queryEmbedding = await embedQueryVector(input.provider, input.retrievalQuery);
        const adaptive = selectAdaptiveCacheThreshold({
          queryText: input.retrievalQuery,
          intent: input.processedQuery?.intent,
          embeddingVariance: computeVectorVariance(queryEmbedding),
          recentCacheQualityScore: semanticCache.getMetrics().cacheQualityScore,
        });
        const contextSignature = `${input.processedQuery?.intent ?? "unknown"}|topK=${input.topK}|provider=${input.provider.name}`;
        const cacheLookup = semanticCache.lookupWithContext({
          indexId: input.document.documentId,
          indexVersion: input.document.metadata?.checksum as string | undefined,
          queryText: input.retrievalQuery,
          queryEmbedding,
          contextSignature,
          threshold: adaptive.threshold,
        });

        if (cacheLookup.hit && isCachedRagPayload(cacheLookup.entry?.result)) {
          const cached = cacheLookup.entry.result;

          return {
            ...input,
            queryEmbedding,
            cacheHit: true,
            cacheSimilarity: cacheLookup.similarity,
            cacheThresholdUsed: cacheLookup.thresholdUsed,
            cacheAdaptiveReason: adaptive.reason,
            cacheLookupReason: cacheLookup.reason,
            cacheKey: cacheLookup.cacheKey,
            cacheContextHash: cacheLookup.contextHash,
            devMode: cached.devMode,
            answer: cached.answer,
            indexSummary: cached.index,
          };
        }

        return {
          ...input,
          queryEmbedding,
          cacheHit: false,
          cacheSimilarity: cacheLookup.similarity,
          cacheThresholdUsed: cacheLookup.thresholdUsed,
          cacheAdaptiveReason: adaptive.reason,
          cacheLookupReason: cacheLookup.reason,
          cacheKey: cacheLookup.cacheKey,
          cacheContextHash: cacheLookup.contextHash,
          cachedCandidateChunkIds: extractCachedChunkIds(cacheLookup.entry?.result),
        };
      },
    },
    {
      name: "retrieve-chunks",
      async run(input) {
        if (!input.index) {
          throw new ApiRequestError("RAG workflow index was not built.", 500);
        }

        if (input.cacheHit && input.devMode) {
          return input;
        }

        const projected =
          input.costTracker.getTotalCostUsd() +
          input.retrievalQuery.length *
            resolveUnitCostUsd(input.provider.name, "embedding-query") +
          input.topK * resolveUnitCostUsd(input.provider.name, "retrieval");
        budgetEnforcer.validateBudget(input.document.documentId, projected, dailySpentUsd);

        input.costTracker.trackEvent(
          "embedding-query",
          input.provider.name,
          input.retrievalQuery.length,
          resolveUnitCostUsd(input.provider.name, "embedding-query"),
          { timestamp: Date.now(), queryLength: input.retrievalQuery.length }
        );

        const devMode = await retrieveForDevMode(input.index, input.retrievalQuery, {
          topK: resolveRerankCandidateTopK(input.topK),
          mode: DEFAULT_RETRIEVAL_MODE,
        });

        const cacheAware = applyCacheAwareRetrievalSignal(devMode, input.cachedCandidateChunkIds);

        input.costTracker.trackEvent(
          "retrieval",
          input.provider.name,
          input.topK,
          resolveUnitCostUsd(input.provider.name, "retrieval"),
          { timestamp: Date.now(), resultCount: devMode.resultCount }
        );

        return {
          ...input,
          devMode: cacheAware.output,
          cacheAwareRetrieval: {
            influenced: cacheAware.influenced,
            boostedChunkIds: cacheAware.boostedChunkIds,
            hybridScoreMode: cacheAware.influenced ? "retrieval+cache" : "retrieval-only",
          },
          rerankCandidateCount: devMode.resultCount,
        };
      },
    },
    {
      name: "rerank-chunks",
      async run(input) {
        if (!input.devMode) {
          throw new ApiRequestError("RAG workflow retrieval output is missing.", 500);
        }

        const reranked = rerankRetrievalOutput(input.devMode, input.retrievalQuery, input.topK);
        const routingSignals = buildRetrievalRoutingSignals(reranked);
        const refinedRoutingDecision = routeModel(input.rawQuery, {
          postRetrieval: routingSignals,
        });
        const rerankInputTokens = estimateTokenUsage(
          `${input.retrievalQuery} ${input.devMode.results.map((result) => result.text).join(" ")}`
        );
        const rerankUnits = input.rerankCandidateCount ?? input.devMode.resultCount;

        const projected =
          input.costTracker.getTotalCostUsd() +
          rerankUnits * resolveUnitCostUsd(input.provider.name, "reranking");
        budgetEnforcer.validateBudget(input.document.documentId, projected, dailySpentUsd);

        input.costTracker.trackEvent(
          "reranking",
          input.provider.name,
          rerankUnits,
          resolveUnitCostUsd(input.provider.name, "reranking"),
          { timestamp: Date.now(), candidateCount: rerankUnits, returnedCount: reranked.resultCount }
        );

        return {
          ...input,
          devMode: reranked,
          routingSignals,
          routingDecision: refinedRoutingDecision,
          decisionSteps: [
            ...(input.decisionSteps ?? []),
            `postModel=${refinedRoutingDecision.selectedModel}`,
          ],
          rerankInputTokens,
        };
      },
    },
    {
      name: "build-answer",
      async run(input) {
        if (!input.devMode) {
          throw new ApiRequestError("RAG workflow retrieval output is missing.", 500);
        }

        const answer = input.answer ?? createGroundedAnswer(input.devMode);

        if (!input.sessionId && !input.cacheHit && input.queryEmbedding) {
          const indexSummary = input.indexSummary ?? createIndexSummary(input.index!);
          const contextSignature = `${input.processedQuery?.intent ?? "unknown"}|topK=${input.topK}|provider=${input.provider.name}`;
          semanticCache.setWithContext({
            indexId: input.document.documentId,
            indexVersion: input.document.metadata?.checksum as string | undefined,
            queryText: input.retrievalQuery,
            queryEmbedding: input.queryEmbedding,
            contextSignature,
            processedQuery: input.processedQuery!,
            result: {
              answer,
              index: indexSummary,
              devMode: input.devMode,
            },
            ttlMs: semanticCache.getConfig().ttlMs,
          });
        }

        const orchestration = orchestrateAnswerPipeline({
          baseAnswer: answer.text,
          question: input.rawQuery,
          retrievedContext: input.devMode.results.map((item) => item.text).join(" "),
          config: {
            enabled: options?.useMultiModelOrchestration ?? true,
            verifyGrounding: true,
            draftModel: "local-extractive",
            refineModel: input.routingDecision?.selectedModel ?? "groq",
          },
        });

        const finalAnswer = {
          ...answer,
          text: orchestration.finalAnswer,
        };

        const evals = evaluateRagQuality({
          answer: finalAnswer.text,
          query: input.rawQuery,
          grounded: finalAnswer.grounded,
          results: input.devMode.results,
        });

        // Run structured scorers from @groundedos/evals
        const evalChunkInput = {
          question: input.rawQuery,
          answer: finalAnswer.text,
          retrievedChunks: input.devMode.results.map((item) => ({
            chunkId: item.chunkId,
            text: item.text,
            score: item.score,
          })),
        };
        const [faithResult, relevResult, recallResult] = await Promise.all([
          faithfulnessEvaluator.evaluate(evalChunkInput),
          relevanceEvaluator.evaluate(evalChunkInput),
          recallEvaluator.evaluate(evalChunkInput),
        ]);
        const scorerResults = {
          faithfulness: { score: faithResult.score, passed: faithResult.passed, reason: faithResult.reason },
          relevance: { score: relevResult.score, passed: relevResult.passed, reason: relevResult.reason },
          recall: { score: recallResult.score, passed: recallResult.passed, reason: recallResult.reason },
          averageScore: Number(((faithResult.score + relevResult.score + recallResult.score) / 3).toFixed(3)),
          passedCount: [faithResult, relevResult, recallResult].filter((r) => r.passed).length,
        };
        recordEvalHistory({
          timestamp: Date.now(),
          query: input.rawQuery,
          documentId: input.document.documentId,
          groundedness: evals.groundedness,
          answerOverlap: evals.answerOverlap,
          pipelineScore: evals.pipelineScore,
          scorerResults,
        });
        const evalsWithScorers = {
          ...evals,
          scorerResults,
          evalHistory: getEvalHistorySummary(input.document.documentId),
        };

        const reasoningSummary = buildReasoningSummary(
          options?.reasoningEnabled ?? false,
          input.routingDecision,
          input.processedQuery,
          orchestration
        );

        let cacheQualityLabel: "high" | "medium" | "low" | undefined;
        let cacheQualityScore: number | undefined;
        let cacheShadowChecked = false;
        let cacheSavingsMs: number | undefined;

        if ((options?.enableShadowRetrieval ?? true) && input.cacheHit && semanticCache.shouldRunShadowCheck()) {
          cacheShadowChecked = true;
          const shadow = semanticCache.evaluateShadow({
            indexId: input.document.documentId,
            cacheEntry: {
              cacheKey: input.cacheKey ?? "",
              indexId: input.document.documentId,
              contextSignature: input.cacheContextHash ?? "",
              indexVersion: String(input.document.metadata?.checksum ?? "v1"),
              queryEmbedding: input.queryEmbedding ?? [],
              processedQuery: input.processedQuery!,
              result: {},
              createdAt: Date.now(),
              hitCount: 0,
              ttlMs: semanticCache.getConfig().ttlMs,
            },
            freshChunkIds: input.devMode.results.map((item) => item.chunkId),
            cachedChunkIds: input.devMode.results.map((item) => item.chunkId),
            estimatedFreshLatencyMs: 40,
          });
          cacheQualityLabel = shadow.qualityLabel;
          cacheQualityScore = shadow.agreement;
          cacheSavingsMs = 40;
        }

        let memoryStored = false;

        if (input.sessionId) {
          await sessionMemoryStore.append({
            sessionId: createOwnedSessionId(input.ownerId, input.sessionId, input.tenantId),
            query: input.rawQuery,
            answer: answer.text,
            metadata: {
              documentId: input.document.documentId,
              grounded: answer.grounded,
            },
          });
          memoryStored = true;
        }

        const total = input.costTracker.getTotalCostUsd();
        const budgetRemainingUsd = budgetEnforcer.computeBudgetRemaining(total, dailySpentUsd);
        const costSummary = input.costTracker.summarize(true, budgetRemainingUsd);
        await costLedger.appendSummary(costSummary);

        return {
          ...input,
          answer: finalAnswer,
          orchestration,
          evals: evalsWithScorers,
          reasoningSummary,
          cacheQualityLabel,
          cacheQualityScore,
          cacheShadowChecked,
          cacheSavingsMs,
          costSummary,
          memoryStored,
        };
      },
    },
  ];

  const runner = new WorkflowRunner<RagWorkflowState>(steps);
  const result = await runner.run({
    document,
    rawQuery: query,
    retrievalQuery: query,
    topK,
    provider,
    sessionId: normalizeSessionIdOrUndefined(sessionId),
    ownerId,
    tenantId,
    costTracker: new CostTracker(document.documentId),
  });

  if (result.status !== "success" || !result.output?.index || !result.output.devMode) {
    const failedStep = Object.values(result.context.steps).find((step) => step.status === "failed");
    const message = failedStep?.error ?? "RAG workflow failed before producing an answer.";
    const statusCode = message.toLowerCase().includes("budget") ? 429 : 500;
    throw new ApiRequestError(message, statusCode);
  }

  const cacheMetrics = semanticCache.getMetrics();
  const resolvedIndexSummary = result.output!.indexSummary ?? createIndexSummary(result.output!.index!);
  const finalAnswer = result.output!.answer ?? createGroundedAnswer(result.output!.devMode!);
  const rerankingCandidates = getRerankingCandidates(result.output!.devMode!);
  const reliability = await buildReliabilityAugmentation({
    query,
    topK,
    answer: finalAnswer,
    devMode: result.output!.devMode!,
    rerankingCandidates,
    evals: result.output!.evals,
    document: {
      documentId: document.documentId,
      title: document.metadata?.title as string,
      modality: "text",
      checksum: String(document.metadata?.checksum ?? ""),
    },
    index: resolvedIndexSummary,
    processedQuery: result.output!.processedQuery,
    routingDecision: result.output!.routingDecision,
    options,
  });

  const response = {
    answer: finalAnswer,
    index: resolvedIndexSummary,
    devMode: {
      ...result.output!.devMode!,
      processedQuery: result.output!.processedQuery,
      workflowContext: result.context,
      cache: {
        hit: Boolean(result.output!.cacheHit),
        similarity: result.output!.cacheSimilarity,
        thresholdUsed: result.output!.cacheThresholdUsed,
        adaptiveThresholdReason: result.output!.cacheAdaptiveReason,
        cacheKey: result.output!.cacheKey,
        contextHash: result.output!.cacheContextHash,
        reason: result.output!.cacheLookupReason,
        quality: {
          score: result.output!.cacheQualityScore,
          label: result.output!.cacheQualityLabel,
          shadowChecked: result.output!.cacheShadowChecked,
        },
        savingsMs: result.output!.cacheSavingsMs,
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        evictions: cacheMetrics.evictions,
        hitRate: cacheMetrics.cacheHitRate,
      },
      routing: result.output!.routingDecision
        ? {
            selectedModel: result.output!.routingDecision.selectedModel,
            selectedProvider: result.output!.routingDecision.selectedProvider,
            reason: result.output!.routingDecision.reason,
            stage: result.output!.routingDecision.stage,
            strategy: result.output!.routingDecision.strategy,
            confidence: result.output!.routingDecision.confidence,
            tradeoff: result.output!.routingDecision.tradeoff,
            alternatives: result.output!.routingDecision.alternatives,
            features: result.output!.routingDecision.features as unknown as Record<string, unknown>,
            retrievalSignals: result.output!.routingSignals,
            initialDecision: result.output!.initialRoutingDecision
              ? {
                  selectedModel: result.output!.initialRoutingDecision.selectedModel,
                  selectedProvider: result.output!.initialRoutingDecision.selectedProvider,
                  reason: result.output!.initialRoutingDecision.reason,
                  confidence: result.output!.initialRoutingDecision.confidence,
                  tradeoff: result.output!.initialRoutingDecision.tradeoff,
                }
              : undefined,
            refinement: result.output!.routingDecision.refinement,
          }
        : undefined,
      orchestration: result.output!.orchestration
        ? {
            mode: result.output!.orchestration.mode,
            enabled: true,
            steps: result.output!.orchestration.steps,
            comparison: result.output!.orchestration.comparison,
          }
        : {
            mode: "single-model" as const,
            enabled: false,
            steps: [],
          },
      reasoning: {
        enabled: options?.reasoningEnabled ?? false,
        summary: result.output!.reasoningSummary ?? [],
        decisionSteps: result.output!.decisionSteps ?? [],
      },
      evals: result.output!.evals
        ? {
            ...result.output!.evals,
            taxonomy: reliability.taxonomy,
            confidence: reliability.confidence,
          }
        : undefined,
      cacheAwareRetrieval: result.output!.cacheAwareRetrieval,
      costBreakdown: buildCostBreakdown(result.output!.costSummary),
      cost: result.output!.costSummary,
      memory: {
        sessionId: result.output!.sessionId,
        recalled: result.output!.memoryMatches?.length ?? 0,
        stored: Boolean(result.output!.memoryStored),
        matches: (result.output!.memoryMatches ?? []).map((match) => ({
          score: match.score,
          query: match.entry.query,
          answer: match.entry.answer,
          createdAt: match.entry.createdAt,
        })),
      },
      reranking: {
        applied: true,
        candidateCount: result.output!.rerankCandidateCount ?? result.output!.devMode!.resultCount,
        returnedCount: result.output!.devMode!.resultCount,
        candidates: rerankingCandidates,
      },
      stageMetrics: buildStageMetrics(result.context, {
        rawQuery: result.output!.rawQuery,
        retrievalQuery: result.output!.retrievalQuery,
        retrievalResultCount: result.output!.rerankCandidateCount ?? result.output!.devMode!.resultCount,
        rerankResultCount: result.output!.devMode!.resultCount,
        rerankInputTokens:
          result.output!.rerankInputTokens ?? estimateTokenUsage(result.output!.retrievalQuery),
        expansionCount: result.output!.processedQuery?.expanded.length ?? 0,
      }),
      retrievalSpans: buildRetrievalSpans(result.context, {
        retrievalResults: result.output!.rerankCandidateCount ?? result.output!.devMode!.resultCount,
        rerankResults: result.output!.devMode!.resultCount,
        scores: result.output!.devMode!.results.map((item) => item.score),
      }),
      contextEngineering: buildContextEngineering(
        {
          rawQuery: result.output!.rawQuery,
          retrievalQuery: result.output!.retrievalQuery,
          processedQuery: result.output!.processedQuery,
          memoryMatches: result.output!.memoryMatches,
          rerankCandidateCount: result.output!.rerankCandidateCount,
          devMode: result.output!.devMode!,
        },
        finalAnswer
      ),
      agentLoop: buildAgentLoopTrace(
        result.context,
        {
          processedQuery: result.output!.processedQuery,
          routingDecision: result.output!.routingDecision,
          initialRoutingDecision: result.output!.initialRoutingDecision,
          devMode: result.output!.devMode!,
          rerankCandidateCount: result.output!.rerankCandidateCount,
          orchestration: result.output!.orchestration,
        },
        finalAnswer
      ),
      retrievalDiagnostics: reliability.retrievalDiagnostics,
      replay: reliability.replay,
      reportReferences: reliability.reportReferences,
    },
  };

  recordTradeoffSample({
    requestId: result.context.workflowId,
    timestamp: Date.now(),
    provider: resolvedIndexSummary.embeddingProvider,
    latencyMs: result.totalDurationMs,
    costUsd: result.output.costSummary?.totalCostUsd ?? 0,
    grounded: response.answer.grounded,
    cacheHit: Boolean(result.output.cacheHit),
    topK,
    resultCount: response.devMode.resultCount ?? response.devMode.results.length,
  });

  return response;
}

async function runPersistedRag(
  index: RetrievalIndex,
  query: string,
  topK: number,
  sessionId?: string,
  ownerId?: string,
  tenantId?: string,
  options?: {
    useMultiModelOrchestration?: boolean;
    reasoningEnabled?: boolean;
    enableShadowRetrieval?: boolean;
  }
): Promise<Pick<RagAskResponse, "answer" | "index" | "devMode">> {
  const budget = resolveCostBudgetFromEnv();
  const budgetEnforcer = new CostBudgetEnforcer(budget);
  const dailySpentUsd = await costLedger.getDailyTotalUsd();
  const persistedDocumentId = resolveDocumentIdFromIndex(index);

  type PersistedRagState = {
    index: RetrievalIndex;
    rawQuery: string;
    retrievalQuery: string;
    topK: number;
    processedQuery?: ProcessedQuery;
    devMode?: RetrievalDevModeOutput;
    answer?: GroundedAnswer;
    queryEmbedding?: EmbeddingVector;
    cacheHit?: boolean;
    cacheSimilarity?: number;
    cacheThresholdUsed?: number;
    cacheAdaptiveReason?: string;
    cacheLookupReason?: string;
    cacheKey?: string;
    cacheContextHash?: string;
    cachedCandidateChunkIds?: string[];
    cacheQualityLabel?: "high" | "medium" | "low";
    cacheQualityScore?: number;
    cacheShadowChecked?: boolean;
    cacheSavingsMs?: number;
    initialRoutingDecision?: ReturnType<typeof routeModel>;
    routingDecision?: ReturnType<typeof routeModel>;
    routingSignals?: RetrievalRoutingSignalsSummary;
    orchestration?: ReturnType<typeof orchestrateAnswerPipeline>;
    reasoningSummary?: string[];
    decisionSteps?: string[];
    evals?: {
      groundedness: number;
      answerOverlap: number;
      retrievalAccuracy: number;
      pipelineScore: number;
      modelScore: number;
      scorerResults?: {
        faithfulness?: { score: number; passed: boolean; reason?: string };
        relevance?: { score: number; passed: boolean; reason?: string };
        recall?: { score: number; passed: boolean; reason?: string };
        averageScore: number;
        passedCount: number;
      };
    };
    cacheAwareRetrieval?: {
      influenced: boolean;
      boostedChunkIds: string[];
      hybridScoreMode: string;
    };
    sessionId?: string;
    ownerId?: string;
    tenantId?: string;
    memoryMatches?: MemorySearchResult[];
    memoryStored?: boolean;
    rerankCandidateCount?: number;
    rerankInputTokens?: number;
    indexSummary?: RagIndexSummary;
    costTracker: CostTracker;
    costSummary?: RequestCostSummary;
  };

  const steps: Array<WorkflowStep<PersistedRagState, PersistedRagState>> = [
    {
      name: "normalize-request",
      async run(input) {
        return {
          ...input,
          retrievalQuery: input.rawQuery.trim(),
        };
      },
    },
    {
      name: "load-memory",
      async run(input) {
        if (!input.sessionId) {
          return {
            ...input,
            memoryMatches: [],
          };
        }

        const matches = await sessionMemoryStore.search(
          createOwnedSessionId(input.ownerId, input.sessionId, input.tenantId),
          input.rawQuery,
          DEFAULT_MEMORY_RECALL_LIMIT
        );

        return {
          ...input,
          memoryMatches: matches,
        };
      },
    },
    {
      name: "ingest-document",
      async run(input) {
        // Persisted flow does not re-ingest the document. Keep step for parity.
        return input;
      },
    },
    {
      name: "build-index",
      async run(input) {
        // Persisted flow already has an index. Keep step for consistent tracing.
        return {
          ...input,
          indexSummary: createIndexSummary(input.index),
        };
      },
    },
    {
      name: "process-query",
      async run(input) {
        const processedQuery = processQuery({ text: input.rawQuery });
        validateProcessedQuery(processedQuery);
        const routingDecision = routeModel(input.rawQuery);

        const memoryHint = (input.memoryMatches ?? [])
          .map((match) => `${match.entry.query} ${match.entry.answer}`)
          .join(" ")
          .trim();

        const retrievalQuery = [
          processedQuery.rewritten ?? processedQuery.original,
          ...processedQuery.expanded,
          memoryHint,
        ]
          .join(" ")
          .trim();

        return {
          ...input,
          processedQuery,
          initialRoutingDecision: routingDecision,
          routingDecision,
          decisionSteps: [
            `intent=${processedQuery.intent}`,
            `confidence=${processedQuery.confidence.toFixed(2)}`,
            `selectedModel=${routingDecision.selectedModel}`,
          ],
          retrievalQuery: retrievalQuery.length > 0 ? retrievalQuery : input.rawQuery,
        };
      },
    },
    {
      name: "cache-lookup",
      async run(input) {
        if (input.sessionId) {
          return {
            ...input,
            cacheHit: false,
            cacheSimilarity: undefined,
            cacheLookupReason: "session-memory-enabled",
          };
        }

        const queryEmbedding = await embedQueryVector(input.index.embeddingProvider, input.retrievalQuery);
        const adaptive = selectAdaptiveCacheThreshold({
          queryText: input.retrievalQuery,
          intent: input.processedQuery?.intent,
          embeddingVariance: computeVectorVariance(queryEmbedding),
          recentCacheQualityScore: semanticCache.getMetrics().cacheQualityScore,
        });
        const contextSignature = `${input.processedQuery?.intent ?? "unknown"}|topK=${input.topK}|provider=${input.index.embeddingProvider.name}`;
        const cacheLookup = semanticCache.lookupWithContext({
          indexId: persistedDocumentId,
          indexVersion: persistedDocumentId,
          queryText: input.retrievalQuery,
          queryEmbedding,
          contextSignature,
          threshold: adaptive.threshold,
        });

        if (cacheLookup.hit && isCachedRagPayload(cacheLookup.entry?.result)) {
          const cached = cacheLookup.entry.result;

          return {
            ...input,
            queryEmbedding,
            cacheHit: true,
            cacheSimilarity: cacheLookup.similarity,
            cacheThresholdUsed: cacheLookup.thresholdUsed,
            cacheAdaptiveReason: adaptive.reason,
            cacheLookupReason: cacheLookup.reason,
            cacheKey: cacheLookup.cacheKey,
            cacheContextHash: cacheLookup.contextHash,
            devMode: cached.devMode,
            answer: cached.answer,
            indexSummary: cached.index,
          };
        }

        return {
          ...input,
          queryEmbedding,
          cacheHit: false,
          cacheSimilarity: cacheLookup.similarity,
          cacheThresholdUsed: cacheLookup.thresholdUsed,
          cacheAdaptiveReason: adaptive.reason,
          cacheLookupReason: cacheLookup.reason,
          cacheKey: cacheLookup.cacheKey,
          cacheContextHash: cacheLookup.contextHash,
          cachedCandidateChunkIds: extractCachedChunkIds(cacheLookup.entry?.result),
        };
      },
    },
    {
      name: "retrieve-chunks",
      async run(input) {
        if (input.cacheHit && input.devMode) {
          return input;
        }

        const providerName = input.index.embeddingProvider.name;
        const projected =
          input.costTracker.getTotalCostUsd() +
          input.retrievalQuery.length * resolveUnitCostUsd(providerName, "embedding-query") +
          input.topK * resolveUnitCostUsd(providerName, "retrieval");
        budgetEnforcer.validateBudget(persistedDocumentId, projected, dailySpentUsd);

        input.costTracker.trackEvent(
          "embedding-query",
          providerName,
          input.retrievalQuery.length,
          resolveUnitCostUsd(providerName, "embedding-query"),
          { timestamp: Date.now(), queryLength: input.retrievalQuery.length }
        );

        const devMode = await retrieveForDevMode(input.index, input.retrievalQuery, {
          topK: resolveRerankCandidateTopK(input.topK),
          mode: DEFAULT_RETRIEVAL_MODE,
        });

        const cacheAware = applyCacheAwareRetrievalSignal(devMode, input.cachedCandidateChunkIds);

        input.costTracker.trackEvent(
          "retrieval",
          providerName,
          input.topK,
          resolveUnitCostUsd(providerName, "retrieval"),
          { timestamp: Date.now(), resultCount: devMode.resultCount }
        );

        return {
          ...input,
          devMode: cacheAware.output,
          cacheAwareRetrieval: {
            influenced: cacheAware.influenced,
            boostedChunkIds: cacheAware.boostedChunkIds,
            hybridScoreMode: cacheAware.influenced ? "retrieval+cache" : "retrieval-only",
          },
          rerankCandidateCount: devMode.resultCount,
        };
      },
    },
    {
      name: "rerank-chunks",
      async run(input) {
        if (!input.devMode) {
          throw new ApiRequestError("Persisted RAG workflow retrieval output is missing.", 500);
        }

        const providerName = input.index.embeddingProvider.name;
        const reranked = rerankRetrievalOutput(input.devMode, input.retrievalQuery, input.topK);
        const routingSignals = buildRetrievalRoutingSignals(reranked);
        const refinedRoutingDecision = routeModel(input.rawQuery, {
          postRetrieval: routingSignals,
        });
        const rerankInputTokens = estimateTokenUsage(
          `${input.retrievalQuery} ${input.devMode.results.map((result) => result.text).join(" ")}`
        );
        const rerankUnits = input.rerankCandidateCount ?? input.devMode.resultCount;

        const projected =
          input.costTracker.getTotalCostUsd() +
          rerankUnits * resolveUnitCostUsd(providerName, "reranking");
        budgetEnforcer.validateBudget(persistedDocumentId, projected, dailySpentUsd);

        input.costTracker.trackEvent(
          "reranking",
          providerName,
          rerankUnits,
          resolveUnitCostUsd(providerName, "reranking"),
          { timestamp: Date.now(), candidateCount: rerankUnits, returnedCount: reranked.resultCount }
        );

        return {
          ...input,
          devMode: reranked,
          routingSignals,
          routingDecision: refinedRoutingDecision,
          decisionSteps: [
            ...(input.decisionSteps ?? []),
            `postModel=${refinedRoutingDecision.selectedModel}`,
          ],
          rerankInputTokens,
        };
      },
    },
    {
      name: "build-answer",
      async run(input) {
        if (!input.devMode) {
          throw new ApiRequestError("Persisted RAG workflow retrieval output is missing.", 500);
        }

        const answer = input.answer ?? createGroundedAnswer(input.devMode);

        if (!input.sessionId && !input.cacheHit && input.queryEmbedding) {
          const indexSummary = input.indexSummary ?? createIndexSummary(input.index);
          const contextSignature = `${input.processedQuery?.intent ?? "unknown"}|topK=${input.topK}|provider=${input.index.embeddingProvider.name}`;
          semanticCache.setWithContext({
            indexId: persistedDocumentId,
            indexVersion: persistedDocumentId,
            queryText: input.retrievalQuery,
            queryEmbedding: input.queryEmbedding,
            contextSignature,
            processedQuery: input.processedQuery!,
            result: {
              answer,
              index: indexSummary,
              devMode: input.devMode,
            },
            ttlMs: semanticCache.getConfig().ttlMs,
          });
        }

        const orchestration = orchestrateAnswerPipeline({
          baseAnswer: answer.text,
          question: input.rawQuery,
          retrievedContext: input.devMode.results.map((item) => item.text).join(" "),
          config: {
            enabled: options?.useMultiModelOrchestration ?? true,
            verifyGrounding: true,
            draftModel: "local-extractive",
            refineModel: input.routingDecision?.selectedModel ?? "groq",
          },
        });

        const finalAnswer = {
          ...answer,
          text: orchestration.finalAnswer,
        };

        const evals = evaluateRagQuality({
          answer: finalAnswer.text,
          query: input.rawQuery,
          grounded: finalAnswer.grounded,
          results: input.devMode.results,
        });

        // Run structured scorers from @groundedos/evals
        const evalChunkInput = {
          question: input.rawQuery,
          answer: finalAnswer.text,
          retrievedChunks: input.devMode.results.map((item) => ({
            chunkId: item.chunkId,
            text: item.text,
            score: item.score,
          })),
        };
        const [faithResult, relevResult, recallResult] = await Promise.all([
          faithfulnessEvaluator.evaluate(evalChunkInput),
          relevanceEvaluator.evaluate(evalChunkInput),
          recallEvaluator.evaluate(evalChunkInput),
        ]);
        const scorerResults = {
          faithfulness: { score: faithResult.score, passed: faithResult.passed, reason: faithResult.reason },
          relevance: { score: relevResult.score, passed: relevResult.passed, reason: relevResult.reason },
          recall: { score: recallResult.score, passed: recallResult.passed, reason: recallResult.reason },
          averageScore: Number(((faithResult.score + relevResult.score + recallResult.score) / 3).toFixed(3)),
          passedCount: [faithResult, relevResult, recallResult].filter((r) => r.passed).length,
        };
        recordEvalHistory({
          timestamp: Date.now(),
          query: input.rawQuery,
          documentId: persistedDocumentId,
          groundedness: evals.groundedness,
          answerOverlap: evals.answerOverlap,
          pipelineScore: evals.pipelineScore,
          scorerResults,
        });
        const evalsWithScorers = {
          ...evals,
          scorerResults,
          evalHistory: getEvalHistorySummary(persistedDocumentId),
        };

        const reasoningSummary = buildReasoningSummary(
          options?.reasoningEnabled ?? false,
          input.routingDecision,
          input.processedQuery,
          orchestration
        );

        let cacheQualityLabel: "high" | "medium" | "low" | undefined;
        let cacheQualityScore: number | undefined;
        let cacheShadowChecked = false;
        let cacheSavingsMs: number | undefined;

        if ((options?.enableShadowRetrieval ?? true) && input.cacheHit && semanticCache.shouldRunShadowCheck()) {
          cacheShadowChecked = true;
          const shadow = semanticCache.evaluateShadow({
            indexId: persistedDocumentId,
            cacheEntry: {
              cacheKey: input.cacheKey ?? "",
              indexId: persistedDocumentId,
              contextSignature: input.cacheContextHash ?? "",
              indexVersion: persistedDocumentId,
              queryEmbedding: input.queryEmbedding ?? [],
              processedQuery: input.processedQuery!,
              result: {},
              createdAt: Date.now(),
              hitCount: 0,
              ttlMs: semanticCache.getConfig().ttlMs,
            },
            freshChunkIds: input.devMode.results.map((item) => item.chunkId),
            cachedChunkIds: input.devMode.results.map((item) => item.chunkId),
            estimatedFreshLatencyMs: 40,
          });
          cacheQualityLabel = shadow.qualityLabel;
          cacheQualityScore = shadow.agreement;
          cacheSavingsMs = 40;
        }

        let memoryStored = false;

        if (input.sessionId) {
          await sessionMemoryStore.append({
            sessionId: createOwnedSessionId(input.ownerId, input.sessionId, input.tenantId),
            query: input.rawQuery,
            answer: answer.text,
            metadata: {
              documentId: persistedDocumentId,
              grounded: answer.grounded,
            },
          });
          memoryStored = true;
        }

        const total = input.costTracker.getTotalCostUsd();
        const budgetRemainingUsd = budgetEnforcer.computeBudgetRemaining(total, dailySpentUsd);
        const costSummary = input.costTracker.summarize(true, budgetRemainingUsd);
        await costLedger.appendSummary(costSummary);

        return {
          ...input,
          answer: finalAnswer,
          orchestration,
          evals: evalsWithScorers,
          reasoningSummary,
          cacheQualityLabel,
          cacheQualityScore,
          cacheShadowChecked,
          cacheSavingsMs,
          costSummary,
          memoryStored,
        };
      },
    },
  ];

  const runner = new WorkflowRunner<PersistedRagState>(steps);
  const result = await runner.run({
    index,
    rawQuery: query,
    retrievalQuery: query,
    topK,
    sessionId: normalizeSessionIdOrUndefined(sessionId),
    ownerId,
    tenantId,
    costTracker: new CostTracker(persistedDocumentId),
  });

  if (result.status !== "success" || !result.output?.devMode) {
    const failedStep = Object.values(result.context.steps).find((step) => step.status === "failed");
    const message = failedStep?.error ?? "Persisted RAG workflow failed before producing an answer.";
    const statusCode = message.toLowerCase().includes("budget") ? 429 : 500;
    throw new ApiRequestError(message, statusCode);
  }

  const cacheMetrics = semanticCache.getMetrics();
  const indexSummary = result.output!.indexSummary ?? createIndexSummary(index);
  const finalAnswer = result.output!.answer ?? createGroundedAnswer(result.output!.devMode!);
  const rerankingCandidates = getRerankingCandidates(result.output!.devMode!);
  const reliability = await buildReliabilityAugmentation({
    query,
    topK,
    answer: finalAnswer,
    devMode: result.output!.devMode!,
    rerankingCandidates,
    evals: result.output!.evals,
    document: {
      documentId: persistedDocumentId,
      title: persistedDocumentId,
      modality: "text",
      checksum: persistedDocumentId,
    },
    storage: {
      persisted: true,
      indexPath: undefined,
    },
    index: indexSummary,
    processedQuery: result.output!.processedQuery,
    routingDecision: result.output!.routingDecision,
    options,
  });

  const response = {
    answer: finalAnswer,
    index: indexSummary,
    devMode: {
      ...result.output!.devMode!,
      processedQuery: result.output!.processedQuery,
      workflowContext: result.context,
      cache: {
        hit: Boolean(result.output!.cacheHit),
        similarity: result.output!.cacheSimilarity,
        thresholdUsed: result.output!.cacheThresholdUsed,
        adaptiveThresholdReason: result.output!.cacheAdaptiveReason,
        cacheKey: result.output!.cacheKey,
        contextHash: result.output!.cacheContextHash,
        reason: result.output!.cacheLookupReason,
        quality: {
          score: result.output!.cacheQualityScore,
          label: result.output!.cacheQualityLabel,
          shadowChecked: result.output!.cacheShadowChecked,
        },
        savingsMs: result.output!.cacheSavingsMs,
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        evictions: cacheMetrics.evictions,
        hitRate: cacheMetrics.cacheHitRate,
      },
      routing: result.output!.routingDecision
        ? {
            selectedModel: result.output!.routingDecision.selectedModel,
            selectedProvider: result.output!.routingDecision.selectedProvider,
            reason: result.output!.routingDecision.reason,
            stage: result.output!.routingDecision.stage,
            strategy: result.output!.routingDecision.strategy,
            confidence: result.output!.routingDecision.confidence,
            tradeoff: result.output!.routingDecision.tradeoff,
            alternatives: result.output!.routingDecision.alternatives,
            features: result.output!.routingDecision.features as unknown as Record<string, unknown>,
            retrievalSignals: result.output!.routingSignals,
            initialDecision: result.output!.initialRoutingDecision
              ? {
                  selectedModel: result.output!.initialRoutingDecision.selectedModel,
                  selectedProvider: result.output!.initialRoutingDecision.selectedProvider,
                  reason: result.output!.initialRoutingDecision.reason,
                  confidence: result.output!.initialRoutingDecision.confidence,
                  tradeoff: result.output!.initialRoutingDecision.tradeoff,
                }
              : undefined,
            refinement: result.output!.routingDecision.refinement,
          }
        : undefined,
      orchestration: result.output!.orchestration
        ? {
            mode: result.output!.orchestration.mode,
            enabled: true,
            steps: result.output!.orchestration.steps,
            comparison: result.output!.orchestration.comparison,
          }
        : {
            mode: "single-model" as const,
            enabled: false,
            steps: [],
          },
      reasoning: {
        enabled: options?.reasoningEnabled ?? false,
        summary: result.output!.reasoningSummary ?? [],
        decisionSteps: result.output!.decisionSteps ?? [],
      },
      evals: result.output!.evals
        ? {
            ...result.output!.evals,
            taxonomy: reliability.taxonomy,
            confidence: reliability.confidence,
          }
        : undefined,
      cacheAwareRetrieval: result.output!.cacheAwareRetrieval,
      costBreakdown: buildCostBreakdown(result.output!.costSummary),
      cost: result.output!.costSummary,
      memory: {
        sessionId: result.output!.sessionId,
        recalled: result.output!.memoryMatches?.length ?? 0,
        stored: Boolean(result.output!.memoryStored),
        matches: (result.output!.memoryMatches ?? []).map((match) => ({
          score: match.score,
          query: match.entry.query,
          answer: match.entry.answer,
          createdAt: match.entry.createdAt,
        })),
      },
      reranking: {
        applied: true,
        candidateCount: result.output!.rerankCandidateCount ?? result.output!.devMode!.resultCount,
        returnedCount: result.output!.devMode!.resultCount,
        candidates: rerankingCandidates,
      },
      stageMetrics: buildStageMetrics(result.context, {
        rawQuery: result.output!.rawQuery,
        retrievalQuery: result.output!.retrievalQuery,
        retrievalResultCount: result.output!.rerankCandidateCount ?? result.output!.devMode!.resultCount,
        rerankResultCount: result.output!.devMode!.resultCount,
        rerankInputTokens:
          result.output!.rerankInputTokens ?? estimateTokenUsage(result.output!.retrievalQuery),
        expansionCount: result.output!.processedQuery?.expanded.length ?? 0,
      }),
      retrievalSpans: buildRetrievalSpans(result.context, {
        retrievalResults: result.output!.rerankCandidateCount ?? result.output!.devMode!.resultCount,
        rerankResults: result.output!.devMode!.resultCount,
        scores: result.output!.devMode!.results.map((item) => item.score),
      }),
      contextEngineering: buildContextEngineering(
        {
          rawQuery: result.output!.rawQuery,
          retrievalQuery: result.output!.retrievalQuery,
          processedQuery: result.output!.processedQuery,
          memoryMatches: result.output!.memoryMatches,
          rerankCandidateCount: result.output!.rerankCandidateCount,
          devMode: result.output!.devMode!,
        },
        finalAnswer
      ),
      agentLoop: buildAgentLoopTrace(
        result.context,
        {
          processedQuery: result.output!.processedQuery,
          routingDecision: result.output!.routingDecision,
          initialRoutingDecision: result.output!.initialRoutingDecision,
          devMode: result.output!.devMode!,
          rerankCandidateCount: result.output!.rerankCandidateCount,
          orchestration: result.output!.orchestration,
        },
        finalAnswer
      ),
      retrievalDiagnostics: reliability.retrievalDiagnostics,
      replay: reliability.replay,
      reportReferences: reliability.reportReferences,
    },
  };

  recordTradeoffSample({
    requestId: result.context.workflowId,
    timestamp: Date.now(),
    provider: indexSummary.embeddingProvider,
    latencyMs: result.totalDurationMs,
    costUsd: result.output.costSummary?.totalCostUsd ?? 0,
    grounded: response.answer.grounded,
    cacheHit: Boolean(result.output.cacheHit),
    topK,
    resultCount: response.devMode.resultCount ?? response.devMode.results.length,
  });

  return response;
}

function createIndexSummary(index: RetrievalIndex): RagIndexSummary {
  return {
    chunkCount: index.embeddedChunks.length,
    embeddingProvider: index.embeddingProvider.name,
    embeddingDimensions: index.embeddingProvider.dimensions,
    embeddingModel: index.embeddingProvider.modelInfo,
  };
}

function computeVectorVariance(vector: EmbeddingVector): number {
  if (vector.length === 0) {
    return 0;
  }

  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  const variance =
    vector.reduce((sum, value) => sum + (value - mean) ** 2, 0) / vector.length;

  return Number(Math.min(1, Math.max(0, variance)).toFixed(4));
}

function extractCachedChunkIds(result: unknown): string[] {
  if (!isCachedRagPayload(result)) {
    return [];
  }

  return (result.devMode?.results ?? []).map((item) => item.chunkId);
}

function applyCacheAwareRetrievalSignal(
  output: RetrievalDevModeOutput,
  cachedChunkIds: string[] | undefined
): {
  output: RetrievalDevModeOutput;
  influenced: boolean;
  boostedChunkIds: string[];
} {
  if (!cachedChunkIds || cachedChunkIds.length === 0) {
    return {
      output,
      influenced: false,
      boostedChunkIds: [],
    };
  }

  const cacheSet = new Set(cachedChunkIds);
  const boostedChunkIds: string[] = [];
  const boostedResults = output.results
    .map((result) => {
      if (!cacheSet.has(result.chunkId)) {
        return result;
      }

      boostedChunkIds.push(result.chunkId);
      return {
        ...result,
        score: Number((result.score + 0.03).toFixed(12)),
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));

  return {
    output: {
      ...output,
      results: boostedResults,
    },
    influenced: boostedChunkIds.length > 0,
    boostedChunkIds,
  };
}

function evaluateRagQuality(input: {
  query: string;
  answer: string;
  grounded: boolean;
  results: RetrievalDevModeOutput["results"];
}): {
  groundedness: number;
  answerOverlap: number;
  retrievalAccuracy: number;
  pipelineScore: number;
  modelScore: number;
} {
  const groundedness = input.grounded ? 1 : 0.35;

  const answerTokens = new Set((input.answer.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []));
  const retrievalTokens = new Set(
    input.results
      .flatMap((item) => item.text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
      .slice(0, 800)
  );

  let overlap = 0;
  for (const token of answerTokens) {
    if (retrievalTokens.has(token)) {
      overlap += 1;
    }
  }

  const answerOverlap = Number((overlap / Math.max(1, answerTokens.size)).toFixed(3));
  const retrievalAccuracy = Number(
    (
      input.results.filter((item) => item.score >= 0.2).length / Math.max(1, input.results.length)
    ).toFixed(3)
  );

  const pipelineScore = Number(
    (groundedness * 0.4 + answerOverlap * 0.35 + retrievalAccuracy * 0.25).toFixed(3)
  );
  const modelScore = Number((answerOverlap * 0.55 + groundedness * 0.45).toFixed(3));

  return {
    groundedness,
    answerOverlap,
    retrievalAccuracy,
    pipelineScore,
    modelScore,
  };
}

async function buildReliabilityAugmentation(input: {
  query: string;
  topK: number;
  answer: GroundedAnswer;
  devMode: RetrievalDevModeOutput;
  rerankingCandidates?: NonNullable<RagAskResponse["devMode"]["reranking"]>["candidates"];
  evals?: NonNullable<RagAskResponse["devMode"]["evals"]>;
  document: RagDocumentSummary;
  storage?: RagAskResponse["storage"];
  index: RagIndexSummary;
  processedQuery?: ProcessedQuery;
  routingDecision?: ReturnType<typeof routeModel>;
  options?: {
    reasoningEnabled?: boolean;
    useMultiModelOrchestration?: boolean;
    enableShadowRetrieval?: boolean;
  };
}): Promise<{
  taxonomy: RetrievalFailureClassification;
  confidence: ConfidenceCalibration;
  retrievalDiagnostics: RetrievalDiagnostics;
  replay: NonNullable<RagAskResponse["devMode"]["replay"]>;
  reportReferences: ReliabilityReportSummaries;
}> {
  const retrievalDiagnostics = buildRetrievalDiagnostics({
    results: input.devMode.results.map((item) => ({
      chunkId: item.chunkId,
      documentId: item.documentId,
      sectionId: item.sectionId,
      score: item.score,
      text: item.text,
    })),
    candidateCount:
      input.rerankingCandidates?.length ?? input.devMode.hybrid?.candidateCount ?? input.devMode.resultCount,
    citations: input.answer.citations.map((citation) => ({ chunkId: citation.chunkId })),
    evals: {
      groundedness: input.evals?.groundedness,
      answerOverlap: input.evals?.answerOverlap,
    },
    retrievalMode: input.devMode.hybrid?.mode ?? DEFAULT_RETRIEVAL_MODE,
    rerankingApplied: Boolean(input.rerankingCandidates?.length),
    provider: input.index.embeddingProvider,
    model: input.index.embeddingModel?.model,
    queryIntent: input.processedQuery?.intent,
  });
  const taxonomy = classifyRetrievalFailure({
    diagnostics: retrievalDiagnostics,
    answerGrounded: input.answer.grounded,
    answerText: input.answer.text,
    evals: input.evals,
  });
  const confidence = calibrateConfidence({
    diagnostics: retrievalDiagnostics,
    evals: input.evals,
  });
  const replaySnapshot = buildReplaySnapshot({
    query: input.query,
    document: {
      documentId: input.document.documentId,
      title: input.document.title,
      checksum: input.document.checksum,
      persisted: Boolean(input.storage?.persisted),
      indexPath: input.storage?.indexPath,
    },
    parameters: {
      topK: input.topK,
      reasoningEnabled: input.options?.reasoningEnabled ?? false,
      useMultiModelOrchestration: input.options?.useMultiModelOrchestration ?? true,
      enableShadowRetrieval: input.options?.enableShadowRetrieval ?? true,
    },
    retrievalConfig: {
      mode: input.devMode.hybrid?.mode ?? DEFAULT_RETRIEVAL_MODE,
      candidateCount: input.devMode.hybrid?.candidateCount ?? input.devMode.resultCount,
      returnedCount: input.devMode.resultCount,
      rerankingApplied: Boolean(input.rerankingCandidates?.length),
    },
    providers: {
      embeddingProvider: input.index.embeddingProvider,
      embeddingModel: input.index.embeddingModel?.model,
      selectedModel: input.routingDecision?.selectedModel,
      selectedProvider: input.routingDecision?.selectedProvider,
    },
    results: input.devMode.results.map((item) => ({
      chunkId: item.chunkId,
      sectionId: item.sectionId,
      rank: item.rank,
      score: item.score,
      text: item.text,
    })),
    reranking: (input.rerankingCandidates ?? []).map((candidate) => ({
      chunkId: candidate.chunkId,
      beforeRank: candidate.beforeRank,
      afterRank: candidate.afterRank,
      finalScore: candidate.finalScore,
    })),
  });
  const replayCommand = input.storage?.persisted
    ? `npm run rag:replay -- --document-id ${shellQuote(input.document.documentId)} --query ${shellQuote(input.query)} --top-k ${input.topK}`
    : `npm run rag:replay -- --content-file <path> --query ${shellQuote(input.query)} --top-k ${input.topK}`;

  return {
    taxonomy,
    confidence,
    retrievalDiagnostics,
    replay: {
      snapshot: replaySnapshot,
      reproducible: Boolean(input.storage?.persisted),
      command: replayCommand,
    },
    reportReferences: await loadReliabilityReportSummaries(),
  };
}

function buildReasoningSummary(
  enabled: boolean,
  routingDecision: ReturnType<typeof routeModel> | undefined,
  processedQuery: ProcessedQuery | undefined,
  orchestration: ReturnType<typeof orchestrateAnswerPipeline> | undefined
): string[] {
  if (!enabled) {
    return [];
  }

  return [
    `Intent detected: ${processedQuery?.intent ?? "unknown"}.`,
    `Routing selected model: ${routingDecision?.selectedModel ?? "unknown"} (${routingDecision?.stage ?? "pre-retrieval"}; ${routingDecision?.reason ?? "no reason"}).`,
    `Orchestration mode: ${orchestration?.mode ?? "single-model"} with ${orchestration?.steps.length ?? 0} steps.`,
  ];
}

function buildRetrievalRoutingSignals(
  devMode: RetrievalDevModeOutput
): RetrievalRoutingSignalsSummary {
  const scores = devMode.results.map((item) => item.score);
  const topScore = scores[0] ?? 0;
  const avgScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const groundedResultRatio =
    devMode.results.filter((item) => item.score >= 0.2).length / Math.max(1, devMode.results.length);

  return {
    resultCount: devMode.resultCount,
    topScore: Number(topScore.toFixed(3)),
    avgScore: Number(avgScore.toFixed(3)),
    scoreSpread: Number(Math.max(0, topScore - minScore).toFixed(3)),
    groundedResultRatio: Number(groundedResultRatio.toFixed(3)),
    uniqueDocuments: new Set(devMode.results.map((item) => item.documentId)).size,
  };
}

function buildContextEngineering(
  output: {
    rawQuery: string;
    retrievalQuery: string;
    processedQuery?: ProcessedQuery;
    memoryMatches?: MemorySearchResult[];
    rerankCandidateCount?: number;
    devMode: RetrievalDevModeOutput;
  },
  answer: GroundedAnswer
): NonNullable<RagAskResponse["devMode"]["contextEngineering"]> {
  const retrievedContext = output.devMode.results.map((item) => item.text).join(" ");
  const candidateCount = output.rerankCandidateCount ?? output.devMode.resultCount;

  return {
    retrievalQuery: output.retrievalQuery,
    rewrittenQuery: output.processedQuery?.rewritten,
    expansionTerms: output.processedQuery?.expanded ?? [],
    memoryAugmented: (output.memoryMatches?.length ?? 0) > 0,
    memoryRecallCount: output.memoryMatches?.length ?? 0,
    candidateCount,
    returnedCount: output.devMode.resultCount,
    selectedChunkIds: output.devMode.results.map((item) => item.chunkId),
    selectedSections: output.devMode.results.map((item) => item.sectionId),
    tokenEstimate: {
      rawQuery: estimateTokenUsage(output.rawQuery),
      retrievalQuery: estimateTokenUsage(output.retrievalQuery),
      retrievedContext: estimateTokenUsage(retrievedContext),
      answer: estimateTokenUsage(answer.text),
    },
    truncation: {
      applied: candidateCount > output.devMode.resultCount,
      keptRatio: Number((output.devMode.resultCount / Math.max(1, candidateCount)).toFixed(3)),
    },
  };
}

function buildAgentLoopTrace(
  context: WorkflowContext,
  output: {
    processedQuery?: ProcessedQuery;
    routingDecision?: ReturnType<typeof routeModel>;
    initialRoutingDecision?: ReturnType<typeof routeModel>;
    devMode: RetrievalDevModeOutput;
    rerankCandidateCount?: number;
    orchestration?: ReturnType<typeof orchestrateAnswerPipeline>;
  },
  answer: GroundedAnswer
): NonNullable<RagAskResponse["devMode"]["agentLoop"]> {
  return {
    enabled: true,
    mode: "inline-rag-agent",
    steps: [
      {
        id: "understand-query",
        type: "reasoning",
        title: "Interpret query",
        detail: `Intent ${output.processedQuery?.intent ?? "unknown"} with ${output.processedQuery?.expanded.length ?? 0} expansion(s).`,
        durationMs: context.steps["process-query"]?.durationMs ?? 0,
      },
      {
        id: "retrieve-evidence",
        type: "tool",
        title: "Retrieve evidence",
        detail: `Retrieved ${output.rerankCandidateCount ?? output.devMode.resultCount} candidates and kept ${output.devMode.resultCount}.`,
        durationMs: context.steps["retrieve-chunks"]?.durationMs ?? 0,
      },
      {
        id: "refine-route",
        type: "decision",
        title: "Refine model route",
        detail:
          output.initialRoutingDecision && output.routingDecision
            ? `${output.initialRoutingDecision.selectedModel} → ${output.routingDecision.selectedModel} (${output.routingDecision.reason})`
            : output.routingDecision?.reason ?? "No routing decision captured.",
        model: output.routingDecision?.selectedModel,
        durationMs: context.steps["rerank-chunks"]?.durationMs ?? 0,
      },
      {
        id: "synthesize-answer",
        type: "reasoning",
        title: "Synthesize grounded answer",
        detail: `Produced grounded=${answer.grounded} answer with ${answer.citations.length} citation(s).`,
        model: output.orchestration?.steps.at(-1)?.model ?? output.routingDecision?.selectedModel,
      },
    ],
  };
}

function buildCostBreakdown(costSummary?: RequestCostSummary): {
  embeddingsUsd: number;
  retrievalUsd: number;
  generationUsd: number;
  totalUsd: number;
} {
  if (!costSummary) {
    return {
      embeddingsUsd: 0,
      retrievalUsd: 0,
      generationUsd: 0,
      totalUsd: 0,
    };
  }

  const embeddingsUsd = costSummary.breakdown
    .filter((item) => item.stage.includes("embedding"))
    .reduce((sum, item) => sum + item.totalCost, 0);
  const retrievalUsd = costSummary.breakdown
    .filter((item) => item.stage.includes("retrieval") || item.stage.includes("reranking"))
    .reduce((sum, item) => sum + item.totalCost, 0);
  const generationUsd = Math.max(0, costSummary.totalCostUsd - embeddingsUsd - retrievalUsd);

  return {
    embeddingsUsd: Number(embeddingsUsd.toFixed(6)),
    retrievalUsd: Number(retrievalUsd.toFixed(6)),
    generationUsd: Number(generationUsd.toFixed(6)),
    totalUsd: Number(costSummary.totalCostUsd.toFixed(6)),
  };
}

function createApiVectorStore(): VectorStore {
  const backend = resolveVectorBackend();
  if (backend === "qdrant") {
    const baseUrl = process.env.QDRANT_URL?.trim();
    if (!baseUrl) {
      console.warn(
        "[api/rag-service] VECTOR_BACKEND=qdrant ignored because QDRANT_URL is not configured. Falling back to in-memory."
      );
      return new InMemoryVectorStore();
    }

    const qdrantStore = new QdrantVectorStore({
      baseUrl,
      collectionName: process.env.QDRANT_COLLECTION?.trim() ?? DEFAULT_QDRANT_COLLECTION,
      apiKey: process.env.QDRANT_API_KEY,
      timeoutMs: parsePositiveIntegerOrDefault(process.env.QDRANT_TIMEOUT_MS, DEFAULT_QDRANT_TIMEOUT_MS),
    });

    if (isVectorDualWriteEnabled()) {
      return createVectorStoreForDualWrite(new InMemoryVectorStore(), qdrantStore);
    }

    return qdrantStore;
  }

  if (backend === "pgvector") {
    console.warn(
      "[api/rag-service] VECTOR_BACKEND=pgvector is not wired in this API service yet. Falling back to in-memory."
    );
  }

  return new InMemoryVectorStore();
}

function createApiEmbeddingProvider(
  providerId: ApiEmbeddingProviderId,
  modelInfo?: EmbeddingModelInfo
): EmbeddingProvider {
  switch (providerId) {
    case "api-lexical":
      return new ApiLexicalEmbeddingProvider();
    case "local-hash":
      return semanticToEmbeddingProvider(new LocalHashEmbeddingsProvider());
    case "ollama":
      return semanticToEmbeddingProvider(createOllamaEmbeddingsProvider(modelInfo));
    case "openai":
      return semanticToEmbeddingProvider(createOpenAiEmbeddingsProvider(modelInfo));
  }
}

function createApiEmbeddingProviderFromIndex(
  index: RagIndexSummary,
  documentId: string
): EmbeddingProvider {
  const providerId = parseStoredEmbeddingProvider(index.embeddingProvider, documentId);
  const provider = createApiEmbeddingProvider(providerId, index.embeddingModel);

  if (index.embeddingDimensions !== provider.dimensions) {
    throw new ApiRequestError(
      `Persisted RAG index "${documentId}" uses ${index.embeddingDimensions} dimensions for provider "${index.embeddingProvider}", but this runtime expects ${provider.dimensions}.`,
      500
    );
  }

  return provider;
}

function normalizeEmbeddingProvider(
  providerId: ApiEmbeddingProviderId | undefined
): ApiEmbeddingProviderId {
  if (providerId === undefined) {
    return DEFAULT_API_EMBEDDING_PROVIDER;
  }

  if (
    providerId === "api-lexical" ||
    providerId === "local-hash" ||
    providerId === "ollama" ||
    providerId === "openai"
  ) {
    return providerId;
  }

  throw new ApiRequestError(
    'embeddingProvider must be "api-lexical", "local-hash", "ollama" or "openai".'
  );
}

function parseStoredEmbeddingProvider(
  providerId: string,
  documentId: string
): ApiEmbeddingProviderId {
  if (
    providerId === "api-lexical" ||
    providerId === "local-hash" ||
    providerId === "ollama" ||
    providerId === "openai"
  ) {
    return providerId;
  }

  throw new ApiRequestError(
    `Persisted RAG index "${documentId}" uses unsupported embedding provider "${providerId}".`,
    500
  );
}

function parsePositiveIntegerOrDefault(rawValue: string | undefined, defaultValue: number): number {
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

function createOllamaEmbeddingsProvider(modelInfo?: EmbeddingModelInfo): OllamaEmbeddingsProvider {
  return new OllamaEmbeddingsProvider({
    baseUrl: process.env.GROUNDEDOS_OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    model:
      modelInfo?.model ??
      process.env.GROUNDEDOS_OLLAMA_EMBED_MODEL ??
      DEFAULT_OLLAMA_EMBEDDING_MODEL,
    dimensions:
      modelInfo?.dimensions ??
      parseOptionalPositiveInteger(
        process.env.GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS,
        "GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS"
      ) ??
      DEFAULT_OLLAMA_EMBEDDING_DIMENSIONS,
    keepAlive: process.env.GROUNDEDOS_OLLAMA_KEEP_ALIVE,
    requestTimeoutMs:
      parseOptionalPositiveInteger(
        process.env.GROUNDEDOS_OLLAMA_REQUEST_TIMEOUT_MS,
        "GROUNDEDOS_OLLAMA_REQUEST_TIMEOUT_MS"
      ) ?? undefined,
  });
}

function createOpenAiEmbeddingsProvider(modelInfo?: EmbeddingModelInfo): OpenAIEmbeddingsProvider {
  return new OpenAIEmbeddingsProvider({
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.GROUNDEDOS_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL,
    model:
      modelInfo?.model ??
      process.env.GROUNDEDOS_OPENAI_EMBED_MODEL ??
      DEFAULT_OPENAI_EMBEDDING_MODEL,
    dimensions:
      modelInfo?.dimensions ??
      parseOptionalPositiveInteger(
        process.env.GROUNDEDOS_OPENAI_EMBED_DIMENSIONS,
        "GROUNDEDOS_OPENAI_EMBED_DIMENSIONS"
      ) ??
      DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
    requestTimeoutMs:
      parseOptionalPositiveInteger(
        process.env.GROUNDEDOS_OPENAI_REQUEST_TIMEOUT_MS,
        "GROUNDEDOS_OPENAI_REQUEST_TIMEOUT_MS"
      ) ?? undefined,
    organization: process.env.OPENAI_ORG_ID,
    project: process.env.OPENAI_PROJECT_ID,
  });
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  name: string
): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiRequestError(`${name} must be a positive integer.`, 500);
  }

  return parsed;
}

function validateOptionalString(value: string | undefined, fieldName: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new ApiRequestError(`${fieldName} must be a string when provided.`);
  }
}

function validateOptionalBoolean(value: boolean | undefined, fieldName: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new ApiRequestError(`${fieldName} must be a boolean when provided.`);
  }
}

function normalizeSessionIdOrUndefined(sessionId: string | undefined): string | undefined {
  if (sessionId === undefined) {
    return undefined;
  }

  return normalizeSessionId(sessionId);
}

function normalizeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim();

  if (trimmed.length === 0) {
    throw new ApiRequestError("sessionId must be a non-empty string.");
  }

  return trimmed;
}

function resolveOwnershipForPersistence(
  ownerId: string | undefined,
  tenantId: string | undefined
): {
  tenantId: string;
  userId: string;
  createdBy: string;
} {
  const normalizedUser = ownerId?.trim() || "anonymous";
  const normalizedTenant = tenantId?.trim() || normalizedUser;
  return {
    tenantId: normalizedTenant,
    userId: normalizedUser,
    createdBy: normalizedUser,
  };
}

function resolveOwnershipForLookup(
  ownerId: string | undefined,
  tenantId: string | undefined
): {
  tenantId: string;
  userId: string;
} {
  const normalizedUser = ownerId?.trim() || "anonymous";
  const normalizedTenant = tenantId?.trim() || normalizedUser;
  return {
    tenantId: normalizedTenant,
    userId: normalizedUser,
  };
}

function createOwnedSessionId(
  ownerId: string | undefined,
  sessionId: string,
  tenantId?: string
): string {
  const normalizedTenant = tenantId?.trim();
  const normalizedOwner = ownerId?.trim();

  if (!normalizedTenant && !normalizedOwner) {
    return sessionId;
  }

  if (!normalizedTenant || !normalizedOwner) {
    return `${normalizedTenant ?? normalizedOwner}__${sessionId}`;
  }

  return `${normalizedTenant}__${normalizedOwner}__${sessionId}`;
}

function validateOptionalMetadata(metadata: Record<string, unknown> | undefined): void {
  if (
    metadata !== undefined &&
    (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
  ) {
    throw new ApiRequestError("metadata must be an object when provided.");
  }
}

function inferModality(filePath: string): SupportedApiModality {
  if (extname(filePath).toLowerCase() === ".pdf") {
    return "pdf";
  }

  return "text";
}

function createGroundedAnswer(devMode: RetrievalDevModeOutput): GroundedAnswer {
  const topResult = devMode.results[0];

  if (!topResult) {
    return {
      grounded: false,
      text: "No retrieved chunk was available for this query.",
      citations: [],
    };
  }

  return {
    grounded: true,
    text: `Based on the top retrieved chunk: ${topResult.text}`,
    citations: [
      {
        chunkId: topResult.chunkId,
        documentId: topResult.documentId,
        sectionId: topResult.sectionId,
        score: topResult.score,
        source: topResult.source,
        offsets: topResult.offsets,
      },
    ],
  };
}

function rerankRetrievalOutput(
  devMode: RetrievalDevModeOutput,
  retrievalQuery: string,
  topK: number
): RetrievalDevModeWithRerank {
  if (devMode.results.length <= 1) {
    return {
      ...devMode,
      resultCount: Math.min(devMode.results.length, topK),
      results: devMode.results.slice(0, topK).map((result, index) => ({
        ...result,
        rank: index + 1,
      })),
      reranking: devMode.results.slice(0, topK).map((result, index) => ({
        chunkId: result.chunkId,
        sectionId: result.sectionId,
        beforeRank: result.rank,
        afterRank: index + 1,
        hybridScore: result.score,
        lexicalOverlapScore: 0,
        finalScore: result.score,
      })),
    };
  }

  const queryTokens = new Set(tokenize(retrievalQuery));

  const reranked = devMode.results
    .map((result) => {
      const candidateTokens = new Set(tokenize(result.text));
      let overlap = 0;

      for (const token of queryTokens) {
        if (candidateTokens.has(token)) {
          overlap += 1;
        }
      }

      const sparseScore =
        queryTokens.size > 0 && candidateTokens.size > 0
          ? overlap / Math.sqrt(queryTokens.size * candidateTokens.size)
          : 0;
      const finalScore = Number((0.8 * result.score + 0.2 * sparseScore).toFixed(12));

      return {
        ...result,
        beforeRank: result.rank,
        hybridScore: result.score,
        lexicalOverlapScore: Number(sparseScore.toFixed(12)),
        score: finalScore,
      };
    })
    .sort((left, right) => {
      if (right.score === left.score) {
        return left.rank - right.rank;
      }

      return right.score - left.score;
    })
    .slice(0, topK)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));

  return {
    ...devMode,
    resultCount: reranked.length,
    results: reranked,
    reranking: reranked.map((result) => ({
      chunkId: result.chunkId,
      sectionId: result.sectionId,
      beforeRank: result.beforeRank,
      afterRank: result.rank,
      hybridScore: result.hybridScore,
      lexicalOverlapScore: result.lexicalOverlapScore,
      finalScore: result.score,
    })),
  };
}

type RetrievalDevModeWithRerank = RetrievalDevModeOutput & {
  reranking?: NonNullable<RagAskResponse["devMode"]["reranking"]>["candidates"];
};

function getRerankingCandidates(devMode: RetrievalDevModeOutput): NonNullable<
  NonNullable<RagAskResponse["devMode"]["reranking"]>["candidates"]
> {
  const maybe = devMode as RetrievalDevModeOutput & {
    reranking?: NonNullable<RagAskResponse["devMode"]["reranking"]>["candidates"];
  };

  return Array.isArray(maybe.reranking) ? maybe.reranking : [];
}

function resolveRerankCandidateTopK(topK: number): number {
  return Math.max(topK * DEFAULT_RERANK_CANDIDATE_MULTIPLIER, topK + 2, 5);
}

function estimateTokenUsage(text: string): number {
  return tokenize(text).length;
}

function buildStageMetrics(
  context: WorkflowContext,
  input: {
    rawQuery: string;
    retrievalQuery: string;
    retrievalResultCount: number;
    rerankResultCount: number;
    rerankInputTokens: number;
    expansionCount: number;
  }
): Array<{
  stage: "process-query" | "retrieve-chunks" | "rerank-chunks";
  durationMs: number;
  inputTokens: number;
  outputUnits: number;
}> {
  const processDuration = context.steps["process-query"]?.durationMs ?? 0;
  const retrievalDuration = context.steps["retrieve-chunks"]?.durationMs ?? 0;
  const rerankDuration = context.steps["rerank-chunks"]?.durationMs ?? 0;

  return [
    {
      stage: "process-query",
      durationMs: processDuration,
      inputTokens: estimateTokenUsage(input.rawQuery),
      outputUnits: 1 + input.expansionCount,
    },
    {
      stage: "retrieve-chunks",
      durationMs: retrievalDuration,
      inputTokens: estimateTokenUsage(input.retrievalQuery),
      outputUnits: input.retrievalResultCount,
    },
    {
      stage: "rerank-chunks",
      durationMs: rerankDuration,
      inputTokens: input.rerankInputTokens,
      outputUnits: input.rerankResultCount,
    },
  ];
}

function buildRetrievalSpans(
  context: WorkflowContext,
  input: {
    retrievalResults: number;
    rerankResults: number;
    scores: number[];
  }
): {
  stage: "retrieve-chunks" | "rerank-chunks";
  latencyMs: number;
  chunkCount: number;
  score: {
    min: number;
    max: number;
    avg: number;
  };
}[] {
  const score = summarizeScores(input.scores);

  return [
    {
      stage: "retrieve-chunks",
      latencyMs: context.steps["retrieve-chunks"]?.durationMs ?? 0,
      chunkCount: input.retrievalResults,
      score,
    },
    {
      stage: "rerank-chunks",
      latencyMs: context.steps["rerank-chunks"]?.durationMs ?? 0,
      chunkCount: input.rerankResults,
      score,
    },
  ];
}

function summarizeScores(scores: number[]): { min: number; max: number; avg: number } {
  if (scores.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
    };
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const avg = scores.reduce((total, value) => total + value, 0) / scores.length;

  return {
    min: Number(min.toFixed(12)),
    max: Number(max.toFixed(12)),
    avg: Number(avg.toFixed(12)),
  };
}

function recordTradeoffSample(
  sample: Parameters<TradeoffMetricsStore["record"]>[0]
): void {
  tradeoffMetricsStore.record(sample);
}

function tokenize(text: string): string[] {
  return (text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map(stemToken)
    .filter((token) => token.length > 0);
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function hashToken(token: string): number {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
}

async function embedQueryVector(provider: EmbeddingProvider, query: string): Promise<EmbeddingVector> {
  const embeddings = await provider.embedTexts([query]);

  if (!Array.isArray(embeddings) || embeddings.length !== 1) {
    throw new ApiRequestError("Embedding provider must return exactly one query embedding.", 500);
  }

  const [embedding] = embeddings;

  if (!Array.isArray(embedding) || embedding.length !== provider.dimensions) {
    throw new ApiRequestError(
      `Query embedding must have ${provider.dimensions} dimensions for provider \"${provider.name}\".`,
      500
    );
  }

  return embedding;
}

function resolveDocumentIdFromIndex(index: RetrievalIndex): string {
  const firstChunk = index.embeddedChunks[0];

  if (!firstChunk || typeof firstChunk.documentId !== "string" || firstChunk.documentId.length === 0) {
    return "unknown-document";
  }

  return firstChunk.documentId;
}

function isCachedRagPayload(value: unknown): value is Pick<RagAskResponse, "answer" | "index" | "devMode"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<Pick<RagAskResponse, "answer" | "index" | "devMode">>;

  return Boolean(maybe.answer && maybe.index && maybe.devMode);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
