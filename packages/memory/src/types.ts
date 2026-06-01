export interface MemoryEntry {
  id: string;
  sessionId: string;
  query: string;
  answer: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface SessionMemoryStore {
  append(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry>;
  search(sessionId: string, query: string, limit?: number): Promise<MemorySearchResult[]>;
  list(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  clearSession(sessionId: string): Promise<void>;
  clearAll(): Promise<void>;
}

export type MemoryPriority = "transient" | "useful" | "important" | "critical" | "persistent";

export type MemoryRetentionClass = MemoryPriority;

export interface MemoryImportanceScore {
  score: number;
  classification: MemoryPriority;
  signals: {
    frequency: number;
    recency: number;
    taskImpact: number;
    explicitPreference: number;
    factuality: number;
    emotionalSalience: number;
    planningRelevance: number;
    retrievalUsefulness: number;
    userCorrection: number;
    futureUtility: number;
  };
}

export interface HierarchicalSummary {
  short: string;
  medium: string;
  long: string;
}

export interface CompressionTrace {
  traceId: string;
  stage:
    | "working-memory"
    | "compression"
    | "episodic"
    | "fact-extraction"
    | "semantic-consolidation"
    | "decay"
    | "retrieval";
  summary: string;
  timestamp: number;
  metrics?: Record<string, number | string | boolean>;
}

export interface WorkingMemoryItem {
  entryId: string;
  query: string;
  answer: string;
  createdAt: number;
  estimatedTokens: number;
  attentionScore: number;
}

export interface WorkingMemoryState {
  maxTokens: number;
  memoryWindow: number;
  estimatedTokens: number;
  compressionTriggered: boolean;
  items: WorkingMemoryItem[];
  overflow: WorkingMemoryItem[];
  activeGoals: string[];
  activeEntities: string[];
  recentRetrievals: string[];
  recentToolOutputs: string[];
  temporaryEvidence: string[];
}

export interface EpisodeSummary extends HierarchicalSummary {}

export interface EpisodicMemoryEntry {
  episodeId: string;
  objective: string;
  actions: string[];
  toolsUsed: string[];
  entities: string[];
  outcomes: string[];
  failures: string[];
  decisions: string[];
  summaries: EpisodeSummary;
  timestamps: {
    startedAt: number;
    endedAt: number;
  };
  embeddings: number[];
  linkedMemories: string[];
  importance: MemoryImportanceScore;
}

export interface EpisodeGraphEdge {
  fromEpisodeId: string;
  toEpisodeId: string;
  relation: "temporal" | "entity-overlap" | "objective-overlap";
}

export interface FactConfidence {
  score: number;
  label: "low" | "medium" | "high";
}

export interface SemanticFact {
  factId: string;
  text: string;
  confidence: FactConfidence;
  provenance: string[];
  sourceEpisodes: string[];
  timestamps: {
    createdAt: number;
    updatedAt: number;
  };
  updateHistory: string[];
  conflictMetadata: {
    conflictsWith: string[];
    status: "clear" | "merged" | "conflicted";
  };
  importance: MemoryImportanceScore;
}

export interface SemanticMemoryState {
  facts: SemanticFact[];
  conceptIndex: Array<{
    concept: string;
    relatedFacts: string[];
    relatedEpisodes: string[];
  }>;
}

export interface LongTermMemoryState {
  facts: SemanticFact[];
  retainedFacts: number;
  archivedFacts: number;
}

export interface MemoryDecayState {
  archivedEntryIds: string[];
  compactedEntryIds: string[];
  removedEntryIds: string[];
}

export interface MemoryHierarchySnapshot {
  sessionId: string;
  workingMemory: WorkingMemoryState;
  episodicMemory: {
    episodes: EpisodicMemoryEntry[];
    graph: EpisodeGraphEdge[];
    timeline: Array<{ episodeId: string; startedAt: number; endedAt: number }>;
  };
  semanticMemory: SemanticMemoryState;
  longTermMemory: LongTermMemoryState;
  decay: MemoryDecayState;
  traces: CompressionTrace[];
}

export interface MemoryHierarchyRequest {
  query?: string;
  currentPlan?: string;
  currentObjectives?: string[];
  activeEntities?: string[];
  memoryWindow?: number;
  maxWorkingMemoryTokens?: number;
  importanceThreshold?: number;
  compressionMode?: "rolling" | "semantic" | "hierarchical" | "event";
  episodicSummarization?: boolean;
  factExtraction?: boolean;
  decayPolicy?: "archive" | "compact" | "remove";
  retrievalStrategy?: "recency" | "semantic" | "episodic" | "fact" | "hybrid";
}

export interface MemoryCompressionResult {
  sessionId: string;
  compressionMode: NonNullable<MemoryHierarchyRequest["compressionMode"]>;
  compressionRatio: number;
  compressedEntries: number;
  summariesCreated: number;
  hierarchy: MemoryHierarchySnapshot;
}

export interface MemoryConsolidationResult {
  sessionId: string;
  consolidatedEpisodes: number;
  extractedFacts: number;
  hierarchy: MemoryHierarchySnapshot;
}

export interface FactExtractionResult {
  sessionId: string;
  facts: SemanticFact[];
  traces: CompressionTrace[];
}

export interface MemorySelectionTrace {
  memoryId: string;
  memoryType: "working" | "episodic" | "fact";
  score: number;
  reasons: string[];
}

export interface MemoryRetrievalResultItem {
  memoryId: string;
  memoryType: "working" | "episodic" | "fact";
  score: number;
  text: string;
  sourceEpisodeId?: string;
  provenance?: string[];
}

export interface MemoryRetrievalResult {
  sessionId: string;
  query: string;
  strategy: NonNullable<MemoryHierarchyRequest["retrievalStrategy"]>;
  results: MemoryRetrievalResultItem[];
  selectionTrace: MemorySelectionTrace[];
}

export interface MemoryManager {
  getHierarchy(
    sessionId: string,
    request?: MemoryHierarchyRequest
  ): Promise<MemoryHierarchySnapshot>;
  compress(
    sessionId: string,
    request?: MemoryHierarchyRequest
  ): Promise<MemoryCompressionResult>;
  consolidate(
    sessionId: string,
    request?: MemoryHierarchyRequest
  ): Promise<MemoryConsolidationResult>;
  extractFacts(
    sessionId: string,
    request?: MemoryHierarchyRequest
  ): Promise<FactExtractionResult>;
  retrieve(
    sessionId: string,
    query: string,
    request?: MemoryHierarchyRequest & { limit?: number }
  ): Promise<MemoryRetrievalResult>;
}
