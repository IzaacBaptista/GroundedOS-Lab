/**
 * Request/response contracts for the GroundedOS local RAG API.
 *
 * These interfaces mirror the types exposed by {@code apps/api/src/rag-service}
 * but are duplicated here to avoid cross-app runtime coupling. They describe
 * only the JSON surface the web client reads.
 */

export type EmbeddingProviderId = "api-lexical" | "local-hash" | "ollama";

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
