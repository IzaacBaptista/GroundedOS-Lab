/**
 * Request/response contracts for the GroundedOS local RAG API.
 *
 * These interfaces mirror the types exposed by {@code apps/api/src/rag-service}
 * but are duplicated here to avoid cross-app runtime coupling. They describe
 * only the JSON surface the web client reads.
 */

export type EmbeddingProviderId = "api-lexical" | "local-hash" | "ollama" | "openai";

export interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

export interface AuthUser {
  userId: string;
  username: string;
  roles: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface LogoutResponse {
  loggedOut: true;
  tokenRevoked: boolean;
}

export interface EmbeddingModelInfo {
  provider: string;
  model: string;
  dimensions: number;
  normalized?: boolean;
}

export interface RagDocumentSummary {
  documentId: string;
  title: string;
  modality: string;
  checksum: string;
  originalFilename?: string;
}

export interface RagIndexSummary {
  chunkCount: number;
  embeddingProvider: string;
  embeddingDimensions: number;
  embeddingModel?: EmbeddingModelInfo;
}

export interface ChunkOffsets {
  offsetBasis: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkSource {
  sourceType?: string;
  originalFilename?: string;
  [key: string]: unknown;
}

export interface DevModeResult {
  rank: number;
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  text: string;
  source: ChunkSource;
  offsets: ChunkOffsets;
}

export interface DevModeOutput {
  results: DevModeResult[];
  cache?: {
    hit: boolean;
    similarity?: number;
    thresholdUsed?: number;
    adaptiveThresholdReason?: string;
    cacheKey?: string;
    contextHash?: string;
    reason?: string;
    savingsMs?: number;
    hitRate?: number;
    quality?: {
      score?: number;
      label?: "high" | "medium" | "low";
      shadowChecked?: boolean;
    };
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
    retrievalSignals?: {
      resultCount: number;
      topScore: number;
      avgScore: number;
      scoreSpread: number;
      groundedResultRatio: number;
      uniqueDocuments: number;
    };
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
    taxonomy?: {
      category: "NOT_FOUND" | "WRONG_CONTEXT" | "PARTIAL_CONTEXT" | "UNGROUNDED_ANSWER" | "LOW_CONFIDENCE";
      confidence: number;
      probableCause: string;
      involvedChunks: string[];
      retrievalMetadata: {
        retrievalMode: string;
        rerankingApplied: boolean;
        provider?: string;
        model?: string;
        queryIntent?: string;
        topScore: number;
        avgScore: number;
        sourceDiversity: number;
        evidenceCoverage: number;
        groundedConsistency: number;
        conflictCount: number;
      };
    };
    confidence?: {
      confidenceScore: number;
      confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
      confidenceReasoning: string[];
      evidenceSignals: {
        retrievalScore: number;
        sourceDiversity: number;
        questionCoverage: number;
        groundedness: number;
        answerConsistency: number;
        citationCoverage: number;
        relevantEvidenceCount: number;
        conflictCount: number;
        insufficientEvidence: boolean;
        contradictoryContext: boolean;
        missingCitations: boolean;
        lowGroundedness: boolean;
        partialCoverage: boolean;
        inconsistentAnswer: boolean;
      };
      factors: {
        retrievalScore: number;
        sourceDiversity: number;
        groundedness: number;
        questionCoverage: number;
        evidenceQuantity: number;
        answerConsistency: number;
        conflictPenalty: number;
      };
    };
  };
  cacheAwareRetrieval?: {
    influenced: boolean;
    boostedChunkIds: string[];
    hybridScoreMode: string;
  };
  costBreakdown?: {
    embeddingsUsd: number;
    retrievalUsd: number;
    generationUsd: number;
    totalUsd: number;
  };
  hybrid?: {
    mode: "hybrid";
    denseWeight: number;
    sparseWeight: number;
    candidateCount: number;
    candidates: Array<{
      chunkId: string;
      sectionId: string;
      denseRank: number;
      hybridRank: number;
      denseScore: number;
      sparseScore: number;
      combinedScore: number;
    }>;
  };
  adaptiveRoutingTrace?: {
    selectedPipeline:
      | "DIRECT_LLM"
      | "STANDARD_RAG"
      | "HYBRID_RAG"
      | "GRAPH_RAG"
      | "HYDE_RAG"
      | "FULL_PIPELINE";
    executedPipeline:
      | "DIRECT_LLM"
      | "STANDARD_RAG"
      | "HYBRID_RAG"
      | "GRAPH_RAG"
      | "HYDE_RAG"
      | "FULL_PIPELINE";
    reason: string[];
    fallbackReason?: string;
    estimatedCost: "low" | "medium" | "high";
    confidence: number;
    shouldRetrieve: boolean;
    classification: {
      categories: string[];
      complexity: "low" | "medium" | "high";
      ambiguity: number;
      factualityRisk: number;
      confidence: number;
    };
  };
  graphRetrievalTrace?: {
    entityHits: Array<{
      entityId: string;
      label: string;
      type: string;
      score: number;
      chunkIds: string[];
    }>;
    traversalSteps: Array<{
      fromEntityId: string;
      fromLabel: string;
      toEntityId: string;
      toLabel: string;
      relationType: string;
      depth: number;
      confidence: number;
      chunkIds: string[];
    }>;
    results: Array<{
      chunkId: string;
      documentId: string;
      sectionId: string;
      score: number;
      matchedEntities: string[];
      depth: number;
      edgeConfidence: number;
      graphProximity: number;
    }>;
  };
  hydeTrace?: {
    enabled: boolean;
    hypotheticalDocument: string;
    embedding: {
      provider: string;
      dimensions: number;
    };
    retrievalDelta: {
      beforeTopScore: number;
      afterTopScore: number;
      improvement: number;
    };
  };
  raptorTrace?: {
    enabled: boolean;
    hierarchyDepth: number;
    selectedNodes: Array<{
      nodeId: string;
      label: string;
      level: number;
      score: number;
      summary: string;
    }>;
    retrievalPath: Array<{
      parentNodeId: string;
      childNodeId: string;
      score: number;
    }>;
  };
  retrievalFusionTrace?: {
    weights: {
      semanticSimilarity: number;
      graphProximity: number;
      edgeConfidence: number;
      traversalDepth: number;
      hydeSimilarity: number;
      raptorSummary: number;
    };
    candidates: Array<{
      chunkId: string;
      semanticSimilarity: number;
      graphProximity: number;
      edgeConfidence: number;
      traversalDepth: number;
      hydeSimilarity: number;
      raptorSummary: number;
      finalScore: number;
    }>;
    selectedChunkIds: string[];
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
  retrievalDiagnostics?: {
    resultCount: number;
    candidateCount: number;
    returnedCount: number;
    topScore: number;
    avgScore: number;
    scoreSpread: number;
    sourceDiversity: number;
    citationCount: number;
    citationCoverage: number;
    evidenceCoverage: number;
    groundedConsistency: number;
    conflictCount: number;
    conflictingChunkIds: string[];
    involvedChunkIds: string[];
    retrievalMetadata: {
      retrievalMode: string;
      rerankingApplied: boolean;
      provider?: string;
      model?: string;
      queryIntent?: string;
    };
  };
  replay?: {
    snapshot: {
      version: "v1";
      capturedAt: string;
      mode: "inline" | "persisted";
      query: string;
      correlation: {
        requestId?: string;
        sessionId?: string;
        traceId?: string;
      };
      document: {
        documentId: string;
        title?: string;
        checksum?: string;
        persisted: boolean;
        indexPath?: string;
        originalFilename?: string;
      };
      indexRef: {
        indexId: string;
        indexVersion?: string;
        snapshotId?: string;
      };
      parameters: {
        topK: number;
        reasoningEnabled: boolean;
        useMultiModelOrchestration: boolean;
        enableShadowRetrieval: boolean;
      };
      retrievalConfig: {
        mode: string;
        candidateCount: number;
        returnedCount: number;
        rerankingApplied: boolean;
      };
      providers: {
        embeddingProvider: string;
        embeddingModel?: string;
        selectedModel?: string;
        selectedProvider?: string;
      };
      generation: {
        strategy: "extractive-grounded";
        deterministic: boolean;
        config: {
          temperature: 0;
          topP: 1;
          maxTokens?: number;
        };
      };
      prompts: {
        systemPrompt: string;
        answerPolicy: string;
      };
      policies: {
        groundingPolicy: string;
        refusalPolicy: string;
        citationPolicy: string;
      };
      chunks: Array<{
        chunkId: string;
        sectionId: string;
        rank: number;
        score: number;
        text: string;
        textHash: string;
        textPreview: string;
      }>;
      rerankingConfig: {
        applied: boolean;
        candidateCount: number;
        returnedCount: number;
      };
      reranking: Array<{
        chunkId: string;
        beforeRank: number;
        afterRank: number;
        finalScore: number;
      }>;
      original: {
        answer: {
          text: string;
          grounded: boolean;
          citations: Array<{
            chunkId: string;
            documentId: string;
            sectionId: string;
          }>;
        };
        costUsd?: number;
        latencyMs?: number;
        groundedness?: number;
      };
      environment: {
        runtime: "node";
        nodeVersion: string;
        platform: string;
        nodeEnv?: string;
      };
    };
    reproducible: boolean;
    command: string;
  };
  reportReferences?: {
    drift?: {
      degraded: boolean;
      regressions: number;
      affectedQueries: string[];
      generatedAt: string;
    };
    diff?: {
      winner: string;
      regressions: number;
      improvements: number;
      generatedAt: string;
    };
  };
  [key: string]: unknown;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  source: ChunkSource;
  offsets: ChunkOffsets;
}

export interface GroundedAnswer {
  grounded: boolean;
  text: string;
  citations: Citation[];
}

export interface RagAskResponse {
  document: RagDocumentSummary;
  query: string;
  answer: GroundedAnswer;
  index: RagIndexSummary;
  storage?: {
    persisted: boolean;
    indexPath?: string;
  };
  devMode: DevModeOutput;
}

export interface RagIndexResponse {
  document: RagDocumentSummary;
  index: RagIndexSummary;
  storage: {
    persisted: true;
    indexPath: string;
  };
}

export interface PersistedRagIndexListItem {
  createdAt: string;
  document: RagDocumentSummary;
  index: RagIndexSummary;
  storage: {
    persisted: true;
    indexPath: string;
  };
}

export interface RagIndexListResponse {
  count: number;
  indexes: PersistedRagIndexListItem[];
}

export interface RagIndexDeleteResponse {
  deleted: true;
  index: PersistedRagIndexListItem;
}

export interface EmbeddingMapPoint {
  chunkId: string;
  documentId: string;
  sectionId: string;
  x: number;
  y: number;
  clusterLabel: string;
  textPreview: string;
  offsets: ChunkOffsets;
}

export interface EmbeddingMapCluster {
  label: string;
  count: number;
  centroid: {
    x: number;
    y: number;
  };
}

export interface EmbeddingMapResponse {
  document: RagDocumentSummary;
  index: RagIndexSummary;
  projection: {
    method: "variance-dimensions";
    xDimension: number;
    yDimension: number;
  };
  points: EmbeddingMapPoint[];
  clusters: EmbeddingMapCluster[];
}

export interface TradeoffAggregateMetrics {
  requests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgCostUsd: number;
  groundedRate: number;
  cacheHitRate: number;
  avgResultCount: number;
}

export interface ProviderTradeoffMetrics extends TradeoffAggregateMetrics {
  provider: string;
}

export interface TradeoffRequestSample {
  requestId: string;
  timestamp: number;
  provider: string;
  latencyMs: number;
  costUsd: number;
  grounded: boolean;
  cacheHit: boolean;
  topK: number;
  resultCount: number;
}

export interface TradeoffMetricsResponse {
  generatedAt: number;
  windowSize: number;
  totals: TradeoffAggregateMetrics;
  providers: ProviderTradeoffMetrics[];
  recent: TradeoffRequestSample[];
}

export type ModelBenchmarkStatus = "completed" | "skipped" | "error";

export interface ModelBenchmarkQueryRun {
  id: string;
  question: string;
  status: ModelBenchmarkStatus;
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
}

export interface ModelBenchmarkProviderRun {
  provider: string;
  kind: "local" | "ollama" | "cloud";
  model: string;
  status: ModelBenchmarkStatus;
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
  perQuery: ModelBenchmarkQueryRun[];
}

export interface ModelBenchmarkResponse {
  timestamp: string;
  phase: string;
  dataset: string;
  goldenSize: number;
  topK: number;
  requestedProviders: string[];
  successCriteria: {
    phase4ModelBenchmarkPassed: boolean;
    includesOllamaProvider: boolean;
    includesCloudProvider: boolean;
    note: string;
  };
  providers: ModelBenchmarkProviderRun[];
  summary: {
    completedProviders: string[];
    skippedProviders: string[];
    errorProviders: string[];
    bestByQuality?: string;
    bestByLatency?: string;
    bestByCost?: string;
  };
}

export type ModelBenchmarkPrecheckProvider = "local-extractive" | "ollama" | "openai" | "groq";

export interface ModelBenchmarkPrecheckItem {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface ModelBenchmarkPrecheckProviderResult {
  provider: ModelBenchmarkPrecheckProvider;
  ready: boolean;
  checks: ModelBenchmarkPrecheckItem[];
  blocker?: string;
}

export interface ModelBenchmarkPrecheckResponse {
  timestamp: string;
  requestedProviders: ModelBenchmarkPrecheckProvider[];
  phase4Ready: boolean;
  strictMode: boolean;
  results: ModelBenchmarkPrecheckProviderResult[];
  nextAction: string;
}

export interface ModelBenchmarkRunResponse {
  startedAt: string;
  finishedAt: string;
  command: string;
  providers: string[];
  success: boolean;
  output: string;
}

export interface LabExperimentMetric {
  label: string;
  value: string;
  numericValue?: number;
  tone?: "good" | "neutral" | "warn";
}

export interface LabExperimentVariant {
  name: string;
  role: string;
  metrics: LabExperimentMetric[];
}

export interface LabExperiment {
  id: string;
  concept: string;
  domain: string;
  status: "scaffold" | "measured" | "missing";
  goal: string;
  artifactPath: string;
  generatedAt?: string;
  dataset?: {
    path: string;
    entryCount: number;
    documentRef?: string;
  };
  method?: {
    mode: string;
    chunkCount?: number;
    searchPaths?: string[];
  };
  variants: LabExperimentVariant[];
  keyMetrics: LabExperimentMetric[];
  passed?: boolean;
  notes?: string;
  reproduceCommand: string;
}

export interface LabExperimentsResponse {
  generatedAt: string;
  domains: Array<{
    id: string;
    name: string;
    summary: string;
    experiments: LabExperiment[];
  }>;
}

export interface GuardrailCheckItem {
  id: string;
  label: string;
  concept: string;
  status: "passed" | "sanitized" | "blocked" | "warned";
  riskLevel: "low" | "medium" | "high" | "none";
  reason?: string;
  detectedPatterns: string[];
  sanitizedChanged: boolean;
}

export interface GuardrailCheckResponse {
  generatedAt: string;
  decision: "allow" | "sanitize" | "block" | "review";
  blockedBy?: string;
  summary: {
    checked: number;
    blocked: number;
    sanitized: number;
    warnings: number;
  };
  input: {
    role: "user" | "assistant";
    source: "user-input" | "document" | "assistant-output";
    length: number;
  };
  sanitizedText: string;
  checks: GuardrailCheckItem[];
}

export interface ApiErrorBody {
  error?: { message?: string };
}

export type SourceMode = "file" | "text";
export type FileType = "text" | "pdf";

export interface ActiveIndex {
  documentId: string;
  title: string;
  chunkCount: number;
  embeddingProvider: string;
  embeddingModel?: EmbeddingModelInfo;
  indexPath?: string;
}
