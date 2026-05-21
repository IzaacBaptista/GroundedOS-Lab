import type { DocumentModality, NormalizedDocument } from "@groundedos/core";
import {
  validateEmbeddedChunks,
  validateNormalizedDocument,
  validateRetrievalChunks,
  validateVectorSearchResults,
} from "@groundedos/core";
import {
  AdaptiveRetrievalPlanner,
  type AdaptiveRetrievalMode,
  type AdaptiveRetrievalPlan,
  type AdaptiveQueryClassification,
} from "@groundedos/adaptive-rag";
import {
  InMemoryGraphStore,
  buildKnowledgeGraph,
  retrieveFromKnowledgeGraph,
  type EntityExtractor,
  type EntityHit,
  type GraphRetrieverResult,
  type GraphStore,
  type KnowledgeGraph,
  type TraversalStep,
} from "@groundedos/graphrag";

import {
  buildHypotheticalDocument,
  buildHyDETrace,
  buildRaptorTree,
  retrieveFromRaptorTree,
  type HyDETrace,
  type RetrievalFusionTrace,
  type RaptorTrace,
  type RaptorTree,
} from "./advanced-retrieval";
import {
  chunkDocument,
  type ChunkDocumentOptions,
  type ChunkOffsetBasis,
} from "./chunking";
import {
  DeterministicEmbeddingProvider,
  embedChunks,
  type EmbeddedChunk,
  type EmbeddingProvider,
  type EmbeddingVector,
} from "./embeddings";
import {
  InMemoryVectorStore,
  type VectorMetadataFilter,
  type VectorSearchQuery,
  type VectorSearchResult,
  type VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/retrieval]";

export interface BuildRetrievalIndexOptions {
  chunkOptions?: ChunkDocumentOptions;
  embeddingProvider?: EmbeddingProvider;
  graphExtractors?: EntityExtractor[];
  enableGraphRag?: boolean;
  enableRaptor?: boolean;
  store?: VectorStore;
}

export interface RetrievalIndex {
  embeddingProvider: EmbeddingProvider;
  store: VectorStore;
  embeddedChunks: EmbeddedChunk[];
  knowledgeGraph?: KnowledgeGraph;
  graphStore?: GraphStore;
  raptorTree?: RaptorTree;
}

export interface RetrieveFromIndexOptions {
  topK?: number;
  filter?: VectorMetadataFilter;
  mode?: RetrievalMode;
  hybridDenseWeight?: number;
  hybridCandidateTopK?: number;
}

export type RetrievalResult = VectorSearchResult;
export type RetrievalMode = "dense" | "hybrid";

export interface RetrievalDevModeOutput {
  query: string;
  resultCount: number;
  results: RetrievalDevModeResult[];
  hybrid?: {
    mode: "hybrid";
    denseWeight: number;
    sparseWeight: number;
    candidateCount: number;
    candidates: RetrievalHybridCandidate[];
  };
  adaptiveRoutingTrace?: AdaptiveRoutingTrace;
  graphRetrievalTrace?: GraphRetrievalTrace;
  hydeTrace?: HyDETrace;
  raptorTrace?: RaptorTrace;
  retrievalFusionTrace?: RetrievalFusionTrace;
}

export interface RetrievalHybridCandidate {
  chunkId: string;
  sectionId: string;
  denseRank: number;
  hybridRank: number;
  denseScore: number;
  sparseScore: number;
  combinedScore: number;
}

export interface AdaptiveRoutingTrace {
  selectedPipeline: AdaptiveRetrievalMode;
  executedPipeline: AdaptiveRetrievalMode;
  reason: string[];
  fallbackReason?: string;
  estimatedCost: "low" | "medium" | "high";
  confidence: number;
  shouldRetrieve: boolean;
  classification: AdaptiveQueryClassification;
}

export interface GraphRetrievalTrace {
  entityHits: EntityHit[];
  traversalSteps: TraversalStep[];
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
}

export interface RetrievalDevModeResult {
  rank: number;
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  text: string;
  source: {
    documentTitle: string;
    modality: DocumentModality;
    sourceType: NormalizedDocument["lineage"]["sourceType"];
    originalFilename?: string;
    sectionHeading?: string;
    page?: number;
  };
  offsets: {
    startOffset: number;
    endOffset: number;
    offsetBasis: ChunkOffsetBasis;
  };
  embedding: {
    provider: string;
    dimensions: number;
    model?: string;
    normalized?: boolean;
  };
}

export async function buildRetrievalIndex(
  document: NormalizedDocument,
  options: BuildRetrievalIndexOptions = {}
): Promise<RetrievalIndex> {
  if (!document) {
    throw new Error(`${ERROR_PREFIX} document is required.`);
  }

  validateNormalizedDocument(document);

  const embeddingProvider =
    options.embeddingProvider ?? new DeterministicEmbeddingProvider();
  const store = options.store ?? new InMemoryVectorStore();
  const chunks = chunkDocument(document, options.chunkOptions);
  validateRetrievalChunks(chunks);
  const embeddedChunks = await embedChunks(chunks, embeddingProvider);
  validateEmbeddedChunks(embeddedChunks);

  store.insert(embeddedChunks);
  const graphStore =
    options.enableGraphRag === false || embeddedChunks.length === 0 ? undefined : new InMemoryGraphStore();
  const knowledgeGraph = graphStore
    ? buildKnowledgeGraph(
        embeddedChunks.map((chunk) => ({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          sectionId: chunk.sectionId,
          text: chunk.text,
        })),
        {
          extractors: options.graphExtractors,
        }
      )
    : undefined;
  graphStore?.setGraph(knowledgeGraph!);
  const raptorTree =
    options.enableRaptor === false ? undefined : buildRaptorTree(embeddedChunks);

  return {
    embeddingProvider,
    store,
    embeddedChunks,
    knowledgeGraph,
    graphStore,
    raptorTree,
  };
}

export async function retrieveFromIndex(
  index: RetrievalIndex,
  query: string,
  options: RetrieveFromIndexOptions = {}
): Promise<RetrievalResult[]> {
  const internal = await retrieveInternal(index, query, options);

  return internal.results;
}

export async function retrieveForDevMode(
  index: RetrievalIndex,
  query: string,
  options: RetrieveFromIndexOptions = {}
): Promise<RetrievalDevModeOutput> {
  const internal = await retrieveInternal(index, query, options);
  const output = createRetrievalDevOutput(query, internal.results);

  if (internal.hybridMeta) {
    output.hybrid = {
      mode: "hybrid",
      denseWeight: internal.hybridMeta.denseWeight,
      sparseWeight: internal.hybridMeta.sparseWeight,
      candidateCount: internal.hybridMeta.candidateCount,
      candidates: internal.hybridMeta.candidates,
    };
  }

  if (internal.adaptivePlan) {
    output.adaptiveRoutingTrace = {
      selectedPipeline: internal.adaptivePlan.selectedMode,
      executedPipeline: internal.adaptivePlan.executionMode,
      reason: internal.adaptivePlan.reasoning,
      fallbackReason: internal.adaptivePlan.fallbackReason,
      estimatedCost: internal.adaptivePlan.estimatedCost,
      confidence: internal.adaptivePlan.confidence,
      shouldRetrieve: internal.adaptivePlan.shouldRetrieve,
      classification: internal.adaptivePlan.classification,
    };
  }

  if (internal.graphTrace) {
    output.graphRetrievalTrace = {
      entityHits: internal.graphTrace.entityHits,
      traversalSteps: internal.graphTrace.traversalSteps,
      results: internal.graphTrace.results.map((result) => ({
        chunkId: result.chunkId,
        documentId: result.documentId,
        sectionId: result.sectionId,
        score: result.score,
        matchedEntities: result.matchedEntities,
        depth: result.depth,
        edgeConfidence: result.edgeConfidence,
        graphProximity: result.graphProximity,
      })),
    };
  }

  if (internal.hydeTrace) {
    output.hydeTrace = internal.hydeTrace;
  }

  if (internal.raptorTrace) {
    output.raptorTrace = internal.raptorTrace;
  }

  if (internal.retrievalFusionTrace) {
    output.retrievalFusionTrace = internal.retrievalFusionTrace;
  }

  return output;
}

type InternalRetrievalResult = {
  results: RetrievalResult[];
  hybridMeta?: {
    denseWeight: number;
    sparseWeight: number;
    candidateCount: number;
    candidates: RetrievalHybridCandidate[];
  };
  adaptivePlan?: AdaptiveRetrievalPlan;
  graphTrace?: GraphRetrieverResult;
  hydeTrace?: HyDETrace;
  raptorTrace?: RaptorTrace;
  retrievalFusionTrace?: RetrievalFusionTrace;
};

async function retrieveInternal(
  index: RetrievalIndex,
  query: string,
  options: RetrieveFromIndexOptions = {}
): Promise<InternalRetrievalResult> {
  validateRetrievalIndex(index);

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} query must not be empty.`);
  }

  const queryEmbedding = await embedQuery(query, index.embeddingProvider);

  const mode = options.mode ?? "dense";

  if (mode !== "dense" && mode !== "hybrid") {
    throw new Error(`${ERROR_PREFIX} mode must be "dense" or "hybrid".`);
  }

  if (mode === "dense") {
    const results = await searchStore(index.store, {
      embedding: queryEmbedding,
      topK: options.topK,
      filter: options.filter,
    });

    return {
      results: validateVectorSearchResults(results) as RetrievalResult[],
    };
  }

  const adaptivePlan = new AdaptiveRetrievalPlanner().plan({
    query,
    queryConfidence: 0.78,
    graphAvailable: Boolean(index.graphStore),
    hydeAvailable: true,
    raptorAvailable: Boolean(index.raptorTree),
    requireGrounding: true,
  });
  const topK = options.topK ?? 3;
  const denseWeight = resolveDenseWeight(options.hybridDenseWeight);
  const sparseWeight = 1 - denseWeight;
  const candidateTopK = resolveCandidateTopK(options.hybridCandidateTopK, topK);

  const denseCandidates = await searchStore(index.store, {
    embedding: queryEmbedding,
    topK: candidateTopK,
    filter: options.filter,
  });

  const validatedDenseCandidates = validateVectorSearchResults(
    denseCandidates
  ) as RetrievalResult[];

  if (validatedDenseCandidates.length === 0) {
    return {
      results: [],
      adaptivePlan,
      hybridMeta: {
        denseWeight,
        sparseWeight,
        candidateCount: 0,
        candidates: [],
      },
    };
  }

  const scoredCandidates = validatedDenseCandidates.map((candidate, index) => {
      const denseScore = normalizeDenseScore(candidate.score);
      const sparseScore = sparseNgramCosine(query, candidate.chunk.text);
      const combined = denseWeight * denseScore + sparseWeight * sparseScore;

      return {
        ...candidate,
        denseRank: index + 1,
        denseScore: Number(denseScore.toFixed(12)),
        sparseScore: Number(sparseScore.toFixed(12)),
        score: Number(combined.toFixed(12)),
      };
    });

  const sortedCandidates = scoredCandidates
    .sort((left, right) => {
      if (right.score === left.score) {
        return right.chunk.text.length - left.chunk.text.length;
      }

      return right.score - left.score;
    });
  const reranked = sortedCandidates.slice(0, topK);

  const hypotheticalDocument =
    adaptivePlan.executionMode === "HYDE_RAG" || adaptivePlan.executionMode === "FULL_PIPELINE"
      ? buildHypotheticalDocument(query)
      : undefined;
  const hydeResults = hypotheticalDocument
    ? ((await searchStore(index.store, {
        embedding: await embedQuery(hypotheticalDocument, index.embeddingProvider),
        topK: candidateTopK,
        filter: options.filter,
      })) as RetrievalResult[])
    : [];
  const graphTrace =
    (adaptivePlan.executionMode === "GRAPH_RAG" ||
      adaptivePlan.executionMode === "FULL_PIPELINE") &&
    index.graphStore
      ? retrieveFromKnowledgeGraph(index.graphStore, query, { topK: candidateTopK, maxDepth: 2 })
      : undefined;
  const raptorResult =
    adaptivePlan.executionMode === "FULL_PIPELINE"
      ? retrieveFromRaptorTree(index.raptorTree, query, topK)
      : undefined;
  const fused = fuseRetrievalSignals(
    index,
    reranked,
    hydeResults,
    graphTrace,
    raptorResult?.results ?? [],
    topK
  );

  return {
    results: fused.results,
    adaptivePlan,
    graphTrace,
    hydeTrace: hypotheticalDocument
      ? buildHyDETrace(index.embeddingProvider, hypotheticalDocument, reranked, hydeResults)
      : undefined,
    raptorTrace: raptorResult?.trace,
    retrievalFusionTrace: fused.trace,
    hybridMeta: {
      denseWeight,
      sparseWeight,
      candidateCount: validatedDenseCandidates.length,
      candidates: sortedCandidates.map((candidate, index) => ({
        chunkId: candidate.chunk.id,
        sectionId: candidate.chunk.sectionId,
        denseRank: candidate.denseRank,
        hybridRank: index + 1,
        denseScore: candidate.denseScore,
        sparseScore: candidate.sparseScore,
        combinedScore: candidate.score,
      })),
    },
  };
}

type AsyncSearchCapableStore = VectorStore & {
  searchAsync?: (query: VectorSearchQuery) => Promise<VectorSearchResult[]>;
};

async function searchStore(
  store: VectorStore,
  query: VectorSearchQuery
): Promise<VectorSearchResult[]> {
  const asyncStore = store as AsyncSearchCapableStore;
  if (typeof asyncStore.searchAsync === "function") {
    return asyncStore.searchAsync(query);
  }

  return store.search(query);
}

export function createRetrievalDevOutput(
  query: string,
  results: RetrievalResult[]
): RetrievalDevModeOutput {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} query must not be empty.`);
  }

  if (!Array.isArray(results)) {
    throw new Error(`${ERROR_PREFIX} retrieval results must be an array.`);
  }

  validateVectorSearchResults(results);

  return {
    query: query.trim(),
    resultCount: results.length,
    results: results.map((result, index) => ({
      rank: index + 1,
      chunkId: result.chunk.id,
      documentId: result.chunk.documentId,
      sectionId: result.chunk.sectionId,
      score: result.score,
      text: result.chunk.text,
      source: {
        documentTitle: result.chunk.metadata.documentTitle,
        modality: result.chunk.metadata.modality,
        sourceType: result.chunk.metadata.sourceType,
        originalFilename: result.chunk.metadata.originalFilename,
        sectionHeading: result.chunk.metadata.sectionHeading,
        page: result.chunk.metadata.page,
      },
      offsets: {
        startOffset: result.chunk.startOffset,
        endOffset: result.chunk.endOffset,
        offsetBasis: result.chunk.metadata.offsetBasis,
      },
      embedding: {
        provider: result.chunk.embeddingMetadata.provider,
        dimensions: result.chunk.embeddingMetadata.dimensions,
        model: result.chunk.embeddingMetadata.model,
        normalized: result.chunk.embeddingMetadata.normalized,
      },
    })),
  };
}

function validateRetrievalIndex(index: RetrievalIndex): void {
  if (!index) {
    throw new Error(`${ERROR_PREFIX} retrieval index is required.`);
  }

  if (!index.embeddingProvider || typeof index.embeddingProvider.embedTexts !== "function") {
    throw new Error(`${ERROR_PREFIX} retrieval index must include an embedding provider.`);
  }

  if (!index.store || typeof index.store.search !== "function") {
    throw new Error(`${ERROR_PREFIX} retrieval index must include a searchable store.`);
  }
}

async function embedQuery(
  query: string,
  provider: EmbeddingProvider
): Promise<EmbeddingVector> {
  const embeddings = await provider.embedTexts([query]);

  if (!Array.isArray(embeddings) || embeddings.length !== 1) {
    throw new Error(`${ERROR_PREFIX} provider must return exactly one query embedding.`);
  }

  const [embedding] = embeddings;

  if (!Array.isArray(embedding) || embedding.length !== provider.dimensions) {
    throw new Error(
      `${ERROR_PREFIX} query embedding must have ${provider.dimensions} dimensions.`
    );
  }

  if (embedding.some((value) => !Number.isFinite(value))) {
    throw new Error(`${ERROR_PREFIX} query embedding contains a non-finite value.`);
  }

  return embedding;
}

function resolveDenseWeight(value: number | undefined): number {
  if (value === undefined) {
    return 0.65;
  }

  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${ERROR_PREFIX} hybridDenseWeight must be a number between 0 and 1.`);
  }

  return value;
}

function resolveCandidateTopK(value: number | undefined, topK: number): number {
  if (value === undefined) {
    return Math.max(topK * 4, 10);
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${ERROR_PREFIX} hybridCandidateTopK must be a positive integer.`);
  }

  return Math.max(value, topK);
}

function normalizeDenseScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  if (score >= 0 && score <= 1) {
    return score;
  }

  return Math.max(0, Math.min(1, (score + 1) / 2));
}

function tokenize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function sparseNgramCosine(query: string, chunkText: string): number {
  const queryTerms = tokenize(query);

  if (queryTerms.length === 0) {
    return 0;
  }

  const queryNgrams = buildCharacterNgrams(queryTerms.join(" "));
  const chunkNgrams = buildCharacterNgrams(tokenize(chunkText).join(" "));

  if (queryNgrams.size === 0 || chunkNgrams.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const ngram of queryNgrams) {
    if (chunkNgrams.has(ngram)) {
      overlap += 1;
    }
  }

  if (overlap === 0) {
    return 0;
  }

  return overlap / Math.sqrt(queryNgrams.size * chunkNgrams.size);
}

function buildCharacterNgrams(text: string, n = 3): Set<string> {
  const normalized = text.replace(/\s+/g, "").trim();

  if (normalized.length === 0) {
    return new Set<string>();
  }

  if (normalized.length <= n) {
    return new Set<string>([normalized]);
  }

  const ngrams = new Set<string>();

  for (let index = 0; index <= normalized.length - n; index += 1) {
    ngrams.add(normalized.slice(index, index + n));
  }

  return ngrams;
}

function fuseRetrievalSignals(
  index: RetrievalIndex,
  baselineResults: RetrievalResult[],
  hydeResults: RetrievalResult[],
  graphTrace: GraphRetrieverResult | undefined,
  raptorResults: Array<{ chunkId: string; score: number }>,
  topK: number
): {
  results: RetrievalResult[];
  trace: RetrievalFusionTrace;
} {
  const weights = {
    semanticSimilarity: 0.45,
    graphProximity: 0.15,
    edgeConfidence: 0.1,
    traversalDepth: 0.05,
    hydeSimilarity: 0.15,
    raptorSummary: 0.1,
  } satisfies RetrievalFusionTrace["weights"];
  const chunksById = new Map(index.embeddedChunks.map((chunk) => [chunk.id, chunk]));
  const candidates = new Map<
    string,
    {
      chunk: EmbeddedChunk;
      semanticSimilarity: number;
      graphProximity: number;
      edgeConfidence: number;
      traversalDepth: number;
      hydeSimilarity: number;
      raptorSummary: number;
    }
  >();

  for (const result of baselineResults) {
    const existing = candidates.get(result.chunk.id) ?? createFusionEntry(result.chunk);
    existing.semanticSimilarity = normalizeDenseScore(result.score);
    candidates.set(result.chunk.id, existing);
  }

  for (const result of hydeResults) {
    const existing = candidates.get(result.chunk.id) ?? createFusionEntry(result.chunk);
    existing.hydeSimilarity = Math.max(existing.hydeSimilarity, normalizeDenseScore(result.score));
    candidates.set(result.chunk.id, existing);
  }

  for (const result of graphTrace?.results ?? []) {
    const chunk = chunksById.get(result.chunkId);
    if (!chunk) {
      continue;
    }
    const existing = candidates.get(result.chunkId) ?? createFusionEntry(chunk);
    existing.graphProximity = Math.max(existing.graphProximity, result.graphProximity);
    existing.edgeConfidence = Math.max(existing.edgeConfidence, result.edgeConfidence);
    existing.traversalDepth = Math.max(existing.traversalDepth, 1 / (result.depth + 1));
    candidates.set(result.chunkId, existing);
  }

  for (const result of raptorResults) {
    const chunk = chunksById.get(result.chunkId);
    if (!chunk) {
      continue;
    }
    const existing = candidates.get(result.chunkId) ?? createFusionEntry(chunk);
    existing.raptorSummary = Math.max(existing.raptorSummary, result.score);
    candidates.set(result.chunkId, existing);
  }

  const ranked = [...candidates.entries()]
    .map(([chunkId, candidate]) => ({
      chunkId,
      chunk: candidate.chunk,
      semanticSimilarity: roundScore(candidate.semanticSimilarity),
      graphProximity: roundScore(candidate.graphProximity),
      edgeConfidence: roundScore(candidate.edgeConfidence),
      traversalDepth: roundScore(candidate.traversalDepth),
      hydeSimilarity: roundScore(candidate.hydeSimilarity),
      raptorSummary: roundScore(candidate.raptorSummary),
      finalScore: roundScore(
        candidate.semanticSimilarity * weights.semanticSimilarity +
          candidate.graphProximity * weights.graphProximity +
          candidate.edgeConfidence * weights.edgeConfidence +
          candidate.traversalDepth * weights.traversalDepth +
          candidate.hydeSimilarity * weights.hydeSimilarity +
          candidate.raptorSummary * weights.raptorSummary
      ),
    }))
    .sort((left, right) => {
      if (right.finalScore === left.finalScore) {
        return left.chunkId.localeCompare(right.chunkId);
      }

      return right.finalScore - left.finalScore;
    });

  return {
    results: ranked.slice(0, topK).map((candidate) => ({
      chunk: candidate.chunk,
      score: candidate.finalScore,
    })),
    trace: {
      weights,
      candidates: ranked.map((candidate) => ({
        chunkId: candidate.chunkId,
        semanticSimilarity: candidate.semanticSimilarity,
        graphProximity: candidate.graphProximity,
        edgeConfidence: candidate.edgeConfidence,
        traversalDepth: candidate.traversalDepth,
        hydeSimilarity: candidate.hydeSimilarity,
        raptorSummary: candidate.raptorSummary,
        finalScore: candidate.finalScore,
      })),
      selectedChunkIds: ranked.slice(0, topK).map((candidate) => candidate.chunkId),
    },
  };
}

function createFusionEntry(chunk: EmbeddedChunk) {
  return {
    chunk,
    semanticSimilarity: 0,
    graphProximity: 0,
    edgeConfidence: 0,
    traversalDepth: 0,
    hydeSimilarity: 0,
    raptorSummary: 0,
  };
}

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}
