import type { DocumentModality, NormalizedDocument } from "@groundedos/core";
import {
  validateEmbeddedChunks,
  validateNormalizedDocument,
  validateRetrievalChunks,
  validateVectorSearchResults,
} from "@groundedos/core";
import {
  AdaptiveRetrievalPlanner,
  EvidenceSynthesizer,
  RetrievalEvaluator,
  type AdaptiveRetrievalMode,
  type AdaptiveRetrievalPlan,
  type AdaptiveQueryClassification,
  type EvidenceSynthesisResult,
  type QueryRiskAssessment,
  type RetrievalDependency,
  type RetrievalEvidenceRecord,
  type RetrievalExecutionPlan,
  type RetrievalPlan,
  type RetrievalPlanTrace,
  type RetrievalSelfEvaluation,
  type RetrievalSignalSummary,
  type RetrievalTask,
  type RetrievalWorkingMemory,
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
  buildStepBackQuery,
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
import { reciprocalRankFusion } from "./fusion";
import type { LlmTextProvider } from "./llm-text-provider";
import { scoreCandidatesWithBm25 } from "./sparse-retrieval";
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
  semanticCacheHit?: boolean;
  sessionMemoryHits?: number;
  previousRetrievalEffectiveness?: number;
  latencyBudget?: number;
  tokenBudget?: number;
  costBudget?: number;
  userMode?: "FAST" | "BALANCED" | "DEEP";
  confidenceThreshold?: number;
  /** Book cap. 16: minimum-similarity cutoff — see `VectorSearchQuery.minScore`. */
  minScore?: number;
  /**
   * Book cap. 18: how the dense and sparse (BM25) rankings are combined in
   * hybrid mode. `"weighted"` (default) sums normalized scores by
   * `hybridDenseWeight`. `"rrf"` ignores score values entirely and fuses by
   * rank position (Reciprocal Rank Fusion) — robust when the two scales
   * aren't meaningfully comparable, at the cost of losing the "how much
   * better" signal a raw score carries.
   */
  fusionMethod?: "weighted" | "rrf";
  /**
   * Book cap. 20: optional LLM used for HyDE's hypothetical document and
   * step-back query generalization. Unset falls back to the disclosed
   * heuristics in `advanced-retrieval.ts`.
   */
  llmProvider?: LlmTextProvider;
  /** Book cap. 20: generalize the query (step-back prompting) and merge its results in, alongside dense/HyDE/expansion candidates. */
  stepBack?: boolean;
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
  selectedStrategy: RetrievalExecutionPlan["strategy"];
  policyName: string;
  userMode: AdaptiveRetrievalPlan["policy"]["userMode"];
  reason: string[];
  fallbackReason?: string;
  estimatedCost: "low" | "medium" | "high";
  estimatedLatency: "fast" | "balanced" | "deep";
  confidence: number;
  shouldRetrieve: boolean;
  classification: AdaptiveQueryClassification;
  riskAssessment: QueryRiskAssessment;
  executionPlan: RetrievalExecutionPlan;
  retrievalPlan: RetrievalPlan;
  retrievalPlanTrace: RetrievalPlanTrace;
  retrievalEvaluation?: RetrievalSelfEvaluation;
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
      selectedStrategy: internal.adaptivePlan.executionPlan.strategy,
      policyName: internal.adaptivePlan.policy.name,
      userMode: internal.adaptivePlan.policy.userMode,
      reason: internal.adaptivePlan.reasoning,
      fallbackReason: internal.adaptivePlan.fallbackReason,
      estimatedCost: internal.adaptivePlan.estimatedCost,
      estimatedLatency: internal.adaptivePlan.estimatedLatency,
      confidence: internal.adaptivePlan.confidence,
      shouldRetrieve: internal.adaptivePlan.shouldRetrieve,
      classification: internal.adaptivePlan.classification,
      riskAssessment: internal.adaptivePlan.riskAssessment,
      executionPlan: internal.adaptivePlan.executionPlan,
      retrievalPlan: internal.adaptivePlan.retrievalPlan,
      retrievalPlanTrace: internal.retrievalPlanTrace ?? internal.adaptivePlan.planTrace,
      retrievalEvaluation: internal.retrievalEvaluation,
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
  retrievalPlanTrace?: RetrievalPlanTrace;
  retrievalEvaluation?: RetrievalSelfEvaluation;
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
      minScore: options.minScore,
    });

    return {
      results: validateVectorSearchResults(results) as RetrievalResult[],
    };
  }

  const adaptivePlan = new AdaptiveRetrievalPlanner().plan({
    query,
    queryConfidence: 0.78,
    semanticCacheHit: options.semanticCacheHit,
    sessionMemoryHits: options.sessionMemoryHits,
    previousRetrievalEffectiveness: options.previousRetrievalEffectiveness,
    latencyBudget: options.latencyBudget,
    tokenBudget: options.tokenBudget,
    costBudget: options.costBudget,
    graphAvailable: Boolean(index.graphStore),
    hydeAvailable: true,
    raptorAvailable: Boolean(index.raptorTree),
    requireGrounding: true,
    userMode: options.userMode,
    confidenceThreshold: options.confidenceThreshold,
  });
  const topK = options.topK ?? adaptivePlan.executionPlan.topK;
  const denseWeight = resolveDenseWeight(
    options.hybridDenseWeight ??
      (adaptivePlan.executionPlan.retrievalMode === "dense" ? 1 : undefined)
  );
  const sparseWeight = 1 - denseWeight;
  const candidateTopK = Math.max(
    resolveCandidateTopK(options.hybridCandidateTopK, topK),
    adaptivePlan.executionPlan.candidateTopK
  );
  const expansionQueries = adaptivePlan.executionPlan.queryExpansion.enabled
    ? adaptivePlan.executionPlan.queryExpansion.queries.slice(1)
    : [];
  const planExecution = await executeRetrievalPlan(
    index,
    adaptivePlan.retrievalPlan,
    candidateTopK,
    options.filter
  );

  const denseCandidates = await searchStore(index.store, {
    embedding: queryEmbedding,
    topK: candidateTopK,
    filter: options.filter,
  });
  const expansionCandidates = await searchExpandedQueries(
    index,
    expansionQueries,
    candidateTopK,
    options.filter
  );
  // Book cap. 20: step-back prompting — retrieve with a generalized version
  // of the query too, and fold those hits into the same candidate pool
  // (same mechanism as query expansion above: generate a variant, search
  // it, merge by max score).
  const stepBackCandidates = options.stepBack
    ? ((await searchStore(index.store, {
        embedding: await embedQuery(
          await buildStepBackQuery(query, { llmProvider: options.llmProvider }),
          index.embeddingProvider
        ),
        topK: candidateTopK,
        filter: options.filter,
      })) as RetrievalResult[])
    : [];
  const validatedDenseCandidates = mergeRetrievalResults(
    validateVectorSearchResults(denseCandidates) as RetrievalResult[],
    expansionCandidates,
    planExecution.results,
    stepBackCandidates
  );

  if (validatedDenseCandidates.length === 0) {
    const retrievalPlanTrace = finalizeRetrievalPlanTrace(
      adaptivePlan.planTrace,
      planExecution.stepTraces,
      planExecution.workingMemory,
      planExecution.synthesis
    );

    return {
      results: [],
      adaptivePlan,
      retrievalPlanTrace,
      retrievalEvaluation: new RetrievalEvaluator().evaluate(
        adaptivePlan,
        {
          denseHits: 0,
          expansionHits: expansionCandidates.length + planExecution.results.length,
          graphHits: 0,
          hydeHits: 0,
          raptorHits: 0,
          finalHits: 0,
        },
        0,
        0
      ),
      hybridMeta: {
        denseWeight,
        sparseWeight,
        candidateCount: 0,
        candidates: [],
      },
    };
  }

  // Book cap. 15: real BM25 over the candidate pool, not a character-overlap
  // heuristic — min-max normalized to [0, 1] so it fuses sanely with the
  // already-bounded cosine-based dense score below.
  const bm25Scores =
    adaptivePlan.executionPlan.retrievalMode === "dense"
      ? new Map<string, number>()
      : scoreCandidatesWithBm25(
          query,
          validatedDenseCandidates.map((candidate) => ({
            id: candidate.chunk.id,
            text: candidate.chunk.text,
          }))
        );

  const fusionMethod = options.fusionMethod ?? "weighted";

  // Book cap. 18: RRF fuses by rank position, not raw score value — build
  // the dense ranking (validatedDenseCandidates is already in that order)
  // and the sparse (BM25) ranking, then combine both with 1/(k+rank).
  const rrfScores =
    fusionMethod === "rrf"
      ? reciprocalRankFusion([
          validatedDenseCandidates.map((candidate) => ({ id: candidate.chunk.id })),
          [...validatedDenseCandidates]
            .sort((left, right) => (bm25Scores.get(right.chunk.id) ?? 0) - (bm25Scores.get(left.chunk.id) ?? 0))
            .map((candidate) => ({ id: candidate.chunk.id })),
        ])
      : undefined;

  const scoredCandidates = validatedDenseCandidates.map((candidate, index) => {
      const denseScore = normalizeDenseScore(candidate.score);
      const sparseScore = bm25Scores.get(candidate.chunk.id) ?? 0;
      const combined =
        fusionMethod === "rrf"
          ? rrfScores!.get(candidate.chunk.id) ?? 0
          : denseWeight * denseScore + sparseWeight * sparseScore;

      return {
        ...candidate,
        denseRank: index + 1,
        denseScore: Number(denseScore.toFixed(12)),
        sparseScore: Number(sparseScore.toFixed(12)),
        score: Number(combined.toFixed(12)),
      };
    });

  const sortedCandidates = scoredCandidates
    .filter((candidate) => options.minScore === undefined || candidate.score >= options.minScore)
    .sort((left, right) => {
      if (right.score === left.score) {
        return right.chunk.text.length - left.chunk.text.length;
      }

      return right.score - left.score;
    });
  const reranked = sortedCandidates.slice(0, topK);

  const hypotheticalDocument =
    adaptivePlan.executionPlan.queryExpansion.strategies.includes("hyde") ||
    adaptivePlan.executionMode === "HYDE_RAG" ||
    adaptivePlan.executionMode === "FULL_PIPELINE"
      ? await buildHypotheticalDocument(query, { llmProvider: options.llmProvider })
      : undefined;
  const hydeResults = hypotheticalDocument
    ? ((await searchStore(index.store, {
        embedding: await embedQuery(hypotheticalDocument, index.embeddingProvider),
        topK: candidateTopK,
        filter: options.filter,
      })) as RetrievalResult[])
    : [];
  const graphTrace =
    adaptivePlan.executionPlan.graphTraversal &&
    index.graphStore
      ? retrieveFromKnowledgeGraph(index.graphStore, query, { topK: candidateTopK, maxDepth: 2 })
      : undefined;
  const raptorResult =
    (adaptivePlan.executionMode === "FULL_PIPELINE" ||
      adaptivePlan.executionPlan.strategy === "HierarchicalStrategy") &&
    index.raptorTree
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
  const retrievalEvaluation = new RetrievalEvaluator().evaluate(
    adaptivePlan,
    {
      denseHits: reranked.length,
      expansionHits: expansionCandidates.length + planExecution.results.length,
      graphHits: graphTrace?.results.length ?? 0,
      hydeHits: hydeResults.length,
      raptorHits: raptorResult?.results.length ?? 0,
      finalHits: fused.results.length,
    },
    fused.results[0]?.score ?? 0,
    averageScore(fused.results)
  );
  const retrievalPlanTrace = finalizeRetrievalPlanTrace(
    adaptivePlan.planTrace,
    planExecution.stepTraces,
    {
      ...planExecution.workingMemory,
      retrievedChunkIds: [
        ...new Set([
          ...planExecution.workingMemory.retrievedChunkIds,
          ...fused.results.map((result) => result.chunk.id),
        ]),
      ],
    },
    planExecution.synthesis
  );

  return {
    results: fused.results,
    adaptivePlan,
    retrievalPlanTrace,
    retrievalEvaluation,
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

async function searchExpandedQueries(
  index: RetrievalIndex,
  queries: string[],
  topK: number,
  filter: VectorMetadataFilter | undefined
): Promise<RetrievalResult[]> {
  const results: RetrievalResult[] = [];

  for (const expandedQuery of queries) {
    const embedding = await embedQuery(expandedQuery, index.embeddingProvider);
    const searched = await searchStore(index.store, {
      embedding,
      topK,
      filter,
    });

    results.push(...(validateVectorSearchResults(searched) as RetrievalResult[]));
  }

  return results;
}

type PlannedRetrievalExecution = {
  results: RetrievalResult[];
  stepTraces: RetrievalPlanTrace["executedSteps"];
  workingMemory: RetrievalWorkingMemory;
  synthesis: EvidenceSynthesisResult;
};

async function executeRetrievalPlan(
  index: RetrievalIndex,
  plan: RetrievalPlan,
  topK: number,
  filter: VectorMetadataFilter | undefined
): Promise<PlannedRetrievalExecution> {
  const taskMap = new Map(plan.tasks.map((task) => [task.taskId, task]));
  const subQueryMap = new Map(plan.subQueries.map((subQuery) => [subQuery.subQueryId, subQuery]));
  const evidenceRecords: RetrievalEvidenceRecord[] = [];
  const collectedResults: RetrievalResult[] = [];
  const stepTraces: RetrievalPlanTrace["executedSteps"] = [];
  const workingMemory: RetrievalWorkingMemory = {
    executedQueries: [],
    retrievedChunkIds: [],
    missingEvidence: [...plan.workingMemory.missingEvidence],
    discoveredEntities: [...plan.contextState.entities],
    retrievalFailures: [],
  };

  for (const step of plan.steps) {
    const retrievalTasks = step.taskIds
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is RetrievalTask => {
        if (!task) {
          return false;
        }

        return task.type === "retrieval" || task.type === "graph-traversal";
      });

    if (retrievalTasks.length === 0) {
      stepTraces.push({
        stepId: step.stepId,
        title: step.title,
        executionMode: step.executionMode,
        taskIds: step.taskIds,
        executedQueries: [],
        resultCount: 0,
      });
      continue;
    }

    const taskExecutions =
      step.executionMode === "parallel"
        ? await Promise.all(
            retrievalTasks.map((task) =>
              executeRetrievalTask(index, task, subQueryMap.get(task.subQueryId ?? ""), topK, filter)
            )
          )
        : await executeSequentialRetrievalTasks(index, retrievalTasks, subQueryMap, topK, filter);

    for (const execution of taskExecutions) {
      if (!execution) {
        continue;
      }

      workingMemory.executedQueries.push(execution.query);
      workingMemory.retrievedChunkIds.push(...execution.results.map((result) => result.chunk.id));
      workingMemory.discoveredEntities.push(
        ...extractDiscoveredEntities(execution.results, plan.contextState.entities)
      );
      collectedResults.push(...execution.results);
      evidenceRecords.push(
        ...execution.results.map((result, index) => ({
          evidenceId: `${execution.task.taskId}:evidence:${index + 1}`,
          chunkId: result.chunk.id,
          subQueryId: execution.subQuery.subQueryId,
          taskId: execution.task.taskId,
          text: result.chunk.text,
          metadata: {
            sectionId: result.chunk.sectionId,
            documentId: result.chunk.documentId,
          },
        }))
      );
    }

    stepTraces.push({
      stepId: step.stepId,
      title: step.title,
      executionMode: step.executionMode,
      taskIds: step.taskIds,
      executedQueries: taskExecutions.filter(Boolean).map((execution) => execution!.query),
      resultCount: taskExecutions.reduce(
        (sum, execution) => sum + (execution?.results.length ?? 0),
        0
      ),
    });
  }

  const synthesis = new EvidenceSynthesizer().synthesize(plan, evidenceRecords);
  workingMemory.missingEvidence = synthesis.missingEvidence;
  workingMemory.executedQueries = [...new Set(workingMemory.executedQueries)];
  workingMemory.retrievedChunkIds = [...new Set(workingMemory.retrievedChunkIds)];
  workingMemory.discoveredEntities = [...new Set(workingMemory.discoveredEntities)];

  return {
    results: mergeRetrievalResults(collectedResults),
    stepTraces,
    workingMemory,
    synthesis,
  };
}

async function executeSequentialRetrievalTasks(
  index: RetrievalIndex,
  tasks: RetrievalTask[],
  subQueryMap: Map<string, RetrievalPlan["subQueries"][number]>,
  topK: number,
  filter: VectorMetadataFilter | undefined
) {
  const executions: Array<
    | {
        task: RetrievalTask;
        subQuery: RetrievalPlan["subQueries"][number];
        query: string;
        results: RetrievalResult[];
      }
    | undefined
  > = [];

  for (const task of tasks) {
    executions.push(
      await executeRetrievalTask(index, task, subQueryMap.get(task.subQueryId ?? ""), topK, filter)
    );
  }

  return executions;
}

async function executeRetrievalTask(
  index: RetrievalIndex,
  task: RetrievalTask,
  subQuery: RetrievalPlan["subQueries"][number] | undefined,
  topK: number,
  filter: VectorMetadataFilter | undefined
) {
  if (!subQuery) {
    return undefined;
  }

  const embedding = await embedQuery(subQuery.text, index.embeddingProvider);
  const searched = await searchStore(index.store, {
    embedding,
    topK,
    filter,
  });

  return {
    task,
    subQuery,
    query: subQuery.text,
    results: validateVectorSearchResults(searched) as RetrievalResult[],
  };
}

function finalizeRetrievalPlanTrace(
  trace: RetrievalPlanTrace,
  executedSteps: RetrievalPlanTrace["executedSteps"],
  workingMemory: RetrievalWorkingMemory,
  synthesis: EvidenceSynthesisResult
): RetrievalPlanTrace {
  return {
    ...trace,
    executedSteps,
    coverage: synthesis.coverage,
    missingEvidence: synthesis.missingEvidence,
    evidenceSynthesis: synthesis,
    refinementQueries: [
      ...new Set([
        ...trace.refinementQueries,
        ...synthesis.missingEvidence.map((missing) => `${missing} evidence`),
      ]),
    ],
    plannerDecisions: [
      ...trace.plannerDecisions,
      `coverage=${synthesis.coverage.toFixed(2)}`,
      `consensus=${synthesis.consensusScore.toFixed(2)}`,
      `executedQueries=${workingMemory.executedQueries.length}`,
    ],
  };
}

function extractDiscoveredEntities(
  results: RetrievalResult[],
  knownEntities: string[]
): string[] {
  const entities = new Set<string>();

  for (const entity of knownEntities) {
    if (results.some((result) => result.chunk.text.toLowerCase().includes(entity.toLowerCase()))) {
      entities.add(entity);
    }
  }

  return [...entities];
}

function mergeRetrievalResults(...resultSets: RetrievalResult[][]): RetrievalResult[] {
  const merged = new Map<string, RetrievalResult>();

  for (const resultSet of resultSets) {
    for (const result of resultSet) {
      const existing = merged.get(result.chunk.id);

      if (!existing || result.score > existing.score) {
        merged.set(result.chunk.id, result);
      }
    }
  }

  return [...merged.values()];
}

function averageScore(results: RetrievalResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  return results.reduce((sum, result) => sum + result.score, 0) / results.length;
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
  const embeddings = await provider.embedTexts([query], "query");

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
