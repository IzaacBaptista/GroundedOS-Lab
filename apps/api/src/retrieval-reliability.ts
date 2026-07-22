import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";
import type {
  ExecutionSnapshot as ReplaySnapshot,
  ReplayComparisonReport,
} from "@groundedos/core";

export type RetrievalFailureCategory =
  | "NOT_FOUND"
  | "WRONG_CONTEXT"
  | "PARTIAL_CONTEXT"
  | "UNGROUNDED_ANSWER"
  | "LOW_CONFIDENCE";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
export type ConfidenceLabel = "very_low" | "low" | "moderate" | "high" | "very_high";
export type UncertaintyLevel = "low" | "medium" | "high";
export type ConfidenceAction =
  | "answer_normally"
  | "answer_with_uncertainty"
  | "request_clarification"
  | "run_additional_retrieval"
  | "run_self_check"
  | "run_contradiction_check"
  | "refuse_due_to_insufficient_evidence"
  | "cite_limitations"
  | "escalate_to_deep_retrieval";

export interface ConfidenceThresholds {
  veryLow: number;
  low: number;
  moderate: number;
  high: number;
}

export interface ConfidencePolicy {
  thresholds: ConfidenceThresholds;
  contradictionRiskThreshold: number;
  minimumEvidenceCoverage: number;
  minimumSourceDiversity: number;
}

export interface CalibrationProfile {
  retrievalWeight?: number;
  evidenceWeight?: number;
  answerWeight?: number;
  citationWeight?: number;
  contradictionPenaltyWeight?: number;
  policy?: Partial<ConfidencePolicy>;
}

export interface RetrievalEvidenceChunk {
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  text: string;
}

export interface RetrievalDiagnostics {
  resultCount: number;
  relevantEvidenceCount: number;
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
}

export interface RetrievalFailureClassification {
  category: RetrievalFailureCategory;
  confidence: number;
  probableCause: string;
  involvedChunks: string[];
  retrievalMetadata: RetrievalDiagnostics["retrievalMetadata"] & {
    topScore: number;
    avgScore: number;
    sourceDiversity: number;
    evidenceCoverage: number;
    groundedConsistency: number;
    conflictCount: number;
  };
}

export interface ConfidenceCalibration {
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
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
  overallConfidence?: number;
  label?: ConfidenceLabel;
  breakdown?: ConfidenceBreakdown;
  retrievalConfidence?: number;
  evidenceConfidence?: number;
  answerConfidence?: number;
  citationConfidence?: number;
  contradictionRisk?: number;
  uncertaintyLevel?: UncertaintyLevel;
  uncertaintyReasons?: string[];
  recommendedAction?: ConfidenceAction;
  confidenceTrace?: ConfidenceTrace;
}

export interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
  impact: "positive" | "negative";
  reason?: string;
}

export interface ConfidenceBreakdown {
  retrievalConfidence: number;
  evidenceCoverage: number;
  chunkAgreement: number;
  sourceDiversity: number;
  contradictionRisk: number;
  groundedness: number;
  rerankStability: number;
  citationConfidence: number;
  answerConfidence: number;
}

export interface ConfidenceTrace {
  overallConfidence: number;
  label: ConfidenceLabel;
  uncertaintyLevel: UncertaintyLevel;
  factors: ConfidenceFactor[];
  uncertaintyReasons: string[];
  policyAction: ConfidenceAction;
}

export interface ConfidenceScore {
  overallConfidence: number;
  label: ConfidenceLabel;
  breakdown: ConfidenceBreakdown;
  retrievalConfidence: number;
  evidenceConfidence: number;
  answerConfidence: number;
  citationConfidence: number;
  contradictionRisk: number;
  uncertaintyLevel: UncertaintyLevel;
  uncertaintyReasons: string[];
  recommendedAction: ConfidenceAction;
  trace: ConfidenceTrace;
}

export interface RetrievalScoreSignals {
  topChunkScore: number;
  averageTopKScore: number;
  scoreDistribution: number;
  scoreGap: number;
  thresholdMargin: number;
  retrievalSaturation: number;
}

export interface QueryRiskSignals {
  ambiguous: boolean;
  critical: boolean;
  multiHop: boolean;
  normative: boolean;
  precisionRequired: boolean;
}

export interface FacetCoverageResult {
  facets: string[];
  facetScores: Record<string, number>;
  coveredFacets: string[];
  missingFacets: string[];
  coverageBySource: Record<string, number>;
  coverageScore: number;
}

export interface ConsensusScore {
  score: number;
  supportedByMultiple: number;
  supportedBySingle: number;
  unsupported: number;
  conflictingClaims: number;
}

export interface EvidenceCluster {
  claim: string;
  supportingChunkIds: string[];
  confidence: number;
}

export type ConflictSeverity = "low" | "medium" | "high";
export type ConflictResolutionHint =
  | "prefer_newer_source"
  | "check_timeline"
  | "verify_authoritative_source"
  | "request_more_evidence";

export interface ConflictPair {
  leftChunkId: string;
  rightChunkId: string;
  type:
    | "value_conflict"
    | "date_conflict"
    | "version_conflict"
    | "status_conflict"
    | "decision_conflict"
    | "source_conflict"
    | "semantic_conflict";
  severity: ConflictSeverity;
  hint: ConflictResolutionHint;
}

export interface SourceIndependenceScore {
  score: number;
  distinctDocuments: number;
  distinctSections: number;
  documentConcentration: number;
}

export interface RankingDelta {
  chunkId: string;
  beforeRank: number;
  afterRank: number;
  delta: number;
}

export interface RankCorrelationScore {
  score: number;
}

export interface RetrievalStabilityReport {
  deltas: RankingDelta[];
  correlation: RankCorrelationScore;
  averageDelta: number;
  rerankDependency: number;
  stability: number;
}

export type { ReplaySnapshot, ReplayComparisonReport };

export interface CorpusDriftQuerySnapshot {
  id: string;
  question: string;
  expectedChunkIds: string[];
  retrievedChunkIds: string[];
  recallAtK: number;
  rankOfExpected: number | null;
  topScore: number;
}

export interface CorpusDriftSnapshot {
  version: "v1";
  createdAt: string;
  dataset: string;
  topK: number;
  queries: CorpusDriftQuerySnapshot[];
}

export type CorpusDriftSeverity = "critical" | "high" | "medium" | "low";

export interface CorpusDriftReport {
  version: "v1";
  driftReportId: string;
  baselineId: string;
  currentRunId: string;
  indexId: string;
  createdAt: string;
  dataset: string;
  baselineCreatedAt?: string;
  currentCreatedAt: string;
  summary: {
    degraded: boolean;
    queriesEvaluated: number;
    regressions: number;
    improvements: number;
    missingRelevantChunks: number;
  };
  affectedQueries: string[];
  degradedQueries: string[];
  improvedQueries: string[];
  recommendations: string[];
  queries: Array<{
    id: string;
    question: string;
    recallPrevious: number;
    recallCurrent: number;
    difference: number;
    rankPrevious: number | null;
    rankCurrent: number | null;
    missingRelevantChunks: string[];
    possibleResponsibleDocuments: string[];
    relatedIngestion?: string;
    severity: CorpusDriftSeverity;
    timestamp: string;
    status: "regressed" | "improved" | "stable";
  }>;
}

export interface PromptPolicyVariantRun {
  variant: string;
  description: string;
  metrics: {
    sampleSize: number;
    avgFaithfulness: number;
    avgRelevance: number;
    avgRecall: number;
    avgQuality: number;
    avgGroundedness?: number;
    avgConfidenceScore?: number;
    avgLatencyMs?: number;
    avgCostUsd?: number;
    refusalRate?: number;
    stability?: number;
  };
  perQuery: Array<{
    id: string;
    question: string;
    answer: string;
    retrievedChunkIds: string[];
    scores: {
      faithfulness: number;
      relevance: number;
      recall: number;
      quality: number;
      groundedness?: number;
      confidenceScore?: number;
    };
    latencyMs?: number;
    costUsd?: number;
    refused?: boolean;
  }>;
}

export interface PromptPolicyDiffReport {
  version: "v1";
  createdAt: string;
  dataset: string;
  comparedVariants: string[];
  baselineVariant: string;
  candidateVariant: string;
  winner: string;
  recommendation: "promote" | "block" | "manual_review";
  regressions: string[];
  improvements: string[];
  metricsComparison: Array<{
    variant: string;
    avgFaithfulness: number;
    avgRelevance: number;
    avgQuality: number;
    avgGroundedness: number;
    avgConfidenceScore: number;
    avgRecall: number;
    avgLatencyMs: number;
    avgCostUsd: number;
    refusalRate: number;
    stability: number;
  }>;
  relevantDifferences: Array<{
    queryId: string;
    question: string;
    changed: boolean;
    winningVariant: string;
    comparedAgainst: string;
  }>;
  affectedQueries: Array<{
    queryId: string;
    question: string;
    responseChanged: boolean;
    regressionReasons: string[];
    baselineVariant: string;
    candidateVariant: string;
  }>;
}

export interface ReliabilityReportSummaries {
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
}

export type RetrievalFailureReason =
  | "ambiguous_query"
  | "underspecified_query"
  | "semantic_drift"
  | "missing_entities"
  | "poor_query_rewrite"
  | "multi_hop_failure"
  | "chunk_too_small"
  | "chunk_too_large"
  | "insufficient_overlap"
  | "boundary_fragmentation"
  | "context_split"
  | "lost_context"
  | "embedding_mismatch"
  | "semantic_collapse"
  | "low_embedding_separation"
  | "provider_quality_issue"
  | "embedding_noise"
  | "low_recall"
  | "lexical_miss"
  | "dense_retrieval_failure"
  | "hybrid_disabled"
  | "graph_retrieval_missing"
  | "poor_candidate_pool"
  | "reranker_demoted_relevant_chunk"
  | "reranker_bias"
  | "reranker_overfit"
  | "insufficient_rerank_depth"
  | "missing_document"
  | "stale_document"
  | "duplicated_chunks"
  | "ingestion_failure"
  | "OCR_failure"
  | "metadata_missing"
  | "groundedness_loss"
  | "unsupported_claim"
  | "citation_mismatch"
  | "answer_overgeneralization";

export interface RetrievalDiagnosticFinding {
  component: "query" | "chunking" | "embedding" | "retrieval" | "reranking" | "corpus" | "generation";
  issue: RetrievalFailureReason;
  confidence: number;
  rationale: string;
}

export type RetrievalRecoveryStrategy =
  | "increase_overlap"
  | "decrease_chunk_size"
  | "increase_chunk_size"
  | "enable_hybrid"
  | "enable_reranking"
  | "increase_top_k"
  | "rewrite_query"
  | "enable_hyde"
  | "enable_graphrag"
  | "use_hierarchical_retrieval"
  | "improve_metadata"
  | "reindex_documents"
  | "switch_embedding_provider"
  | "enable_query_expansion"
  | "add_multi_retrieval"
  | "reduce_score_threshold";

export interface CandidateFix {
  strategy: RetrievalRecoveryStrategy;
  estimatedImpact: number;
  estimatedCost: "low" | "medium" | "high";
  estimatedLatencyImpact: "low" | "medium" | "high";
  confidence: number;
  affectedMetrics: Array<
    | "recall"
    | "relevance"
    | "diversity"
    | "groundedness"
    | "retrieval_confidence"
    | "evidence_coverage"
    | "redundancy"
    | "chunk_coherence"
    | "citation_support"
  >;
  rationale: string;
}

export interface RetrievalOptimizationSuggestion extends CandidateFix {}

export interface AutoTuningRecommendation {
  parameter: string;
  currentValue?: number | string | boolean;
  recommendedValue: number | string | boolean;
  rationale: string;
}

export interface RetrievalFailureCase {
  failureReason: RetrievalFailureReason;
  confidence: number;
  diagnosis: RetrievalDiagnosticFinding[];
  candidateFixes: CandidateFix[];
}

export interface RetrievalHealthScore {
  overall: number;
}

export interface RetrievalQualityBreakdown {
  recall: number;
  relevance: number;
  diversity: number;
  groundednessPotential: number;
  retrievalConfidence: number;
  evidenceCoverage: number;
  redundancy: number;
  chunkCoherence: number;
  citationSupport: number;
}

export interface RetrievalHealthReport {
  healthScore: RetrievalHealthScore;
  qualityBreakdown: RetrievalQualityBreakdown;
  alerts: string[];
}

export interface RetrievalDiagnosticTrace {
  retrievalFailureDetected: boolean;
  failureType: RetrievalFailureReason;
  confidence: number;
  probableCauses: RetrievalDiagnosticFinding[];
  evidenceGaps: string[];
  chunkFragmentationIndicators: string[];
  semanticDriftIndicators: string[];
  rerankImpact: {
    rerankingApplied: boolean;
    candidateCount: number;
    returnedCount: number;
  };
  retrievalConfidence: number;
  healthScore: number;
  suggestedFixes: RetrievalRecoveryStrategy[];
}

export interface RetrievalSimulationScenario {
  name: string;
  enableHybrid?: boolean;
  topK?: number;
  enableReranking?: boolean;
  enableQueryExpansion?: boolean;
  enableHyde?: boolean;
  enableGraphRag?: boolean;
}

export interface RetrievalSimulationResult {
  scenario: RetrievalSimulationScenario;
  estimatedRecallImprovement: number;
  estimatedRelevanceImprovement: number;
  estimatedLatencyImpact: number;
  rationale: string;
}

export interface RetrievalFailureAnalyzerInput {
  query: string;
  diagnostics: RetrievalDiagnostics;
  chunks: RetrievalEvidenceChunk[];
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
    retrievalAccuracy?: number;
  };
  overlapConfig?: {
    chunkSize?: number;
    overlapTokens?: number;
  };
  retrievalStrategy?: string;
  rerankingOutput?: Array<{ chunkId: string; beforeRank: number; afterRank: number; finalScore: number }>;
  retrievalConfidence?: number;
}

export interface RetrievalExplainabilityReport {
  whyChunksWereRetrieved: string[];
  whyRelevantChunksMayHaveBeenMissed: string[];
  rerankingImpact: string;
  overlapImpact: string;
  embeddingImpact: string;
  topKImpact: string;
  queryRewriteImpact: string;
}

export interface RetrievalAnalysisResult {
  failureCase: RetrievalFailureCase;
  diagnosticTrace: RetrievalDiagnosticTrace;
  healthReport: RetrievalHealthReport;
  simulations: RetrievalSimulationResult[];
  explainability: RetrievalExplainabilityReport;
  recommendations: RetrievalOptimizationSuggestion[];
  autoTuningRecommendations: AutoTuningRecommendation[];
}

export class QueryFacetExtractor {
  extractFacets(query: string): string[] {
    const normalized = normalizeWhitespace(query.toLowerCase());
    if (!normalized) {
      return [];
    }
    const coarseFacets = normalized
      .split(/\b(?:and|or|vs|versus|between|compare|difference|differences)\b/g)
      .map((facet) => normalizeWhitespace(facet))
      .filter((facet) => facet.length > 2);
    const tokens = normalized.match(/[a-z0-9]{4,}/g) ?? [];
    const keywordFacets = tokens.slice(0, 4);
    return [...new Set([...coarseFacets, ...keywordFacets])].slice(0, 8);
  }
}

export class MissingEvidenceDetector {
  detect(facetScores: Record<string, number>): string[] {
    return Object.entries(facetScores)
      .filter(([, score]) => score < 0.4)
      .map(([facet]) => facet);
  }
}

export class EvidenceCoverageEstimator {
  constructor(
    private readonly facetExtractor = new QueryFacetExtractor(),
    private readonly missingDetector = new MissingEvidenceDetector()
  ) {}

  estimate(input: { query: string; chunks: RetrievalEvidenceChunk[] }): FacetCoverageResult {
    const facets = this.facetExtractor.extractFacets(input.query);
    if (facets.length === 0) {
      return {
        facets: [],
        facetScores: {},
        coveredFacets: [],
        missingFacets: [],
        coverageBySource: {},
        coverageScore: 0,
      };
    }

    const facetScores = Object.fromEntries(
      facets.map((facet) => {
        const best = input.chunks.reduce((max, chunk) => {
          return Math.max(max, tokenOverlapRatio(facet, chunk.text.toLowerCase()));
        }, 0);
        return [facet, round(best, 3)];
      })
    );
    const missingFacets = this.missingDetector.detect(facetScores);
    const coveredFacets = facets.filter((facet) => !missingFacets.includes(facet));
    const coverageBySource: Record<string, number> = {};
    for (const chunk of input.chunks) {
      const key = chunk.documentId;
      const sourceMax = facets.reduce((max, facet) => {
        return Math.max(max, tokenOverlapRatio(facet, chunk.text.toLowerCase()));
      }, 0);
      coverageBySource[key] = round(Math.max(coverageBySource[key] ?? 0, sourceMax), 3);
    }
    const coverageScore =
      facets.length === 0
        ? 0
        : round(Object.values(facetScores).reduce((sum, score) => sum + score, 0) / facets.length, 3);

    return {
      facets,
      facetScores,
      coveredFacets,
      missingFacets,
      coverageBySource,
      coverageScore,
    };
  }
}

export class ClaimExtractor {
  extractClaims(chunks: RetrievalEvidenceChunk[]): string[] {
    return [
      ...new Set(
        chunks
          .flatMap((chunk) =>
            chunk.text
              .split(/[.!?]/g)
              .map((sentence) => normalizeWhitespace(sentence))
              .filter((sentence) => sentence.length >= 24)
              .slice(0, 2)
          )
          .slice(0, 12)
      ),
    ];
  }
}

export class ClaimSupportMapper {
  mapClaimsToChunks(claims: string[], chunks: RetrievalEvidenceChunk[]): Map<string, string[]> {
    const support = new Map<string, string[]>();
    for (const claim of claims) {
      const chunkIds = chunks
        .filter((chunk) => tokenOverlapRatio(claim.toLowerCase(), chunk.text.toLowerCase()) >= 0.35)
        .map((chunk) => chunk.chunkId);
      support.set(claim, chunkIds);
    }
    return support;
  }
}

export class EvidenceAgreementAnalyzer {
  constructor(
    private readonly claimExtractor = new ClaimExtractor(),
    private readonly claimSupportMapper = new ClaimSupportMapper()
  ) {}

  analyze(chunks: RetrievalEvidenceChunk[]): { consensus: ConsensusScore; clusters: EvidenceCluster[] } {
    const claims = this.claimExtractor.extractClaims(chunks);
    const support = this.claimSupportMapper.mapClaimsToChunks(claims, chunks);
    let supportedByMultiple = 0;
    let supportedBySingle = 0;
    let unsupported = 0;
    const clusters: EvidenceCluster[] = [];

    for (const claim of claims) {
      const supporters = support.get(claim) ?? [];
      if (supporters.length >= 2) {
        supportedByMultiple += 1;
      } else if (supporters.length === 1) {
        supportedBySingle += 1;
      } else {
        unsupported += 1;
      }
      clusters.push({
        claim,
        supportingChunkIds: supporters,
        confidence: round(Math.min(1, supporters.length / 3), 3),
      });
    }

    const total = Math.max(1, claims.length);
    const score = round((supportedByMultiple * 1 + supportedBySingle * 0.6) / total, 3);

    return {
      consensus: {
        score,
        supportedByMultiple,
        supportedBySingle,
        unsupported,
        conflictingClaims: 0,
      },
      clusters,
    };
  }
}

export class ContradictionDetector {
  detect(chunks: RetrievalEvidenceChunk[]): ConflictPair[] {
    const pairs: ConflictPair[] = [];
    for (let leftIndex = 0; leftIndex < chunks.length; leftIndex += 1) {
      const left = chunks[leftIndex];
      if (!left) continue;
      const leftText = normalizeWhitespace(left.text.toLowerCase());
      const leftHasNegation = hasNegation(leftText);
      const leftYears = new Set(leftText.match(/\b(19|20)\d{2}\b/g) ?? []);
      const leftKeywords = extractConflictKeywords(leftText);

      for (let rightIndex = leftIndex + 1; rightIndex < chunks.length; rightIndex += 1) {
        const right = chunks[rightIndex];
        if (!right) continue;
        const rightText = normalizeWhitespace(right.text.toLowerCase());
        const rightHasNegation = hasNegation(rightText);
        const rightYears = new Set(rightText.match(/\b(19|20)\d{2}\b/g) ?? []);
        const rightKeywords = extractConflictKeywords(rightText);
        const sharedKeywords = [...leftKeywords].filter((token) => rightKeywords.has(token));
        const yearConflict = leftYears.size > 0 && rightYears.size > 0 && !sameSet(leftYears, rightYears);
        const negationConflict = leftHasNegation !== rightHasNegation && sharedKeywords.length >= 2;
        if (!yearConflict && !negationConflict) {
          continue;
        }
        pairs.push({
          leftChunkId: left.chunkId,
          rightChunkId: right.chunkId,
          type: yearConflict ? "date_conflict" : "semantic_conflict",
          severity: yearConflict ? "high" : "medium",
          hint: yearConflict ? "check_timeline" : "verify_authoritative_source",
        });
      }
    }
    return pairs;
  }
}

export class EvidenceProvenanceAnalyzer {
  analyze(chunks: RetrievalEvidenceChunk[]): SourceIndependenceScore {
    const byDocument = new Map<string, number>();
    const sections = new Set<string>();
    for (const chunk of chunks) {
      byDocument.set(chunk.documentId, (byDocument.get(chunk.documentId) ?? 0) + 1);
      sections.add(`${chunk.documentId}:${chunk.sectionId}`);
    }
    const total = Math.max(1, chunks.length);
    const maxConcentration = Math.max(0, ...byDocument.values()) / total;
    const score = round(Math.max(0, 1 - maxConcentration * 0.75 + Math.min(0.25, sections.size / 20)), 3);
    return {
      score,
      distinctDocuments: byDocument.size,
      distinctSections: sections.size,
      documentConcentration: round(maxConcentration, 3),
    };
  }
}

export class SourceDiversityAnalyzer {
  constructor(private readonly provenanceAnalyzer = new EvidenceProvenanceAnalyzer()) {}
  analyze(chunks: RetrievalEvidenceChunk[]): SourceIndependenceScore {
    return this.provenanceAnalyzer.analyze(chunks);
  }
}

export class RerankStabilityAnalyzer {
  analyze(input: {
    rerankTrace?: Array<{ chunkId: string; beforeRank: number; afterRank: number; finalScore?: number }>;
  }): RetrievalStabilityReport {
    const deltas: RankingDelta[] = (input.rerankTrace ?? []).map((item) => ({
      chunkId: item.chunkId,
      beforeRank: item.beforeRank,
      afterRank: item.afterRank,
      delta: item.afterRank - item.beforeRank,
    }));
    if (deltas.length === 0) {
      return {
        deltas: [],
        correlation: { score: 1 },
        averageDelta: 0,
        rerankDependency: 0,
        stability: 1,
      };
    }
    const averageDelta = round(
      deltas.reduce((sum, delta) => sum + Math.abs(delta.delta), 0) / Math.max(1, deltas.length),
      3
    );
    const maxPossibleShift = Math.max(...deltas.map((delta) => Math.max(delta.beforeRank, delta.afterRank)), 1);
    const normalizedShift = Math.min(1, averageDelta / maxPossibleShift);
    const correlation = round(1 - normalizedShift, 3);
    return {
      deltas,
      correlation: { score: correlation },
      averageDelta,
      rerankDependency: round(normalizedShift, 3),
      stability: correlation,
    };
  }
}

export interface ConfidenceSignalCollection {
  retrieval: RetrievalScoreSignals;
  coverage: FacetCoverageResult;
  agreement: { consensus: ConsensusScore; clusters: EvidenceCluster[] };
  contradictions: ConflictPair[];
  source: SourceIndependenceScore;
  rerank: RetrievalStabilityReport;
  queryRisk: QueryRiskSignals;
  groundedness: number;
  answerConsistency: number;
  citationCoverage: number;
}

export class ConfidenceSignalCollector {
  constructor(
    private readonly coverageEstimator = new EvidenceCoverageEstimator(),
    private readonly agreementAnalyzer = new EvidenceAgreementAnalyzer(),
    private readonly contradictionDetector = new ContradictionDetector(),
    private readonly sourceDiversityAnalyzer = new SourceDiversityAnalyzer(),
    private readonly rerankStabilityAnalyzer = new RerankStabilityAnalyzer()
  ) {}

  collect(input: {
    query?: string;
    diagnostics: RetrievalDiagnostics;
    chunks?: RetrievalEvidenceChunk[];
    evals?: {
      groundedness?: number;
      answerOverlap?: number;
      retrievalAccuracy?: number;
      scorerResults?: {
        faithfulness?: { score: number };
        relevance?: { score: number };
        recall?: { score: number };
      };
    };
    rerankTrace?: Array<{ chunkId: string; beforeRank: number; afterRank: number; finalScore?: number }>;
  }): ConfidenceSignalCollection {
    const chunks = input.chunks ?? [];
    const topChunkScore = normalizeScore(input.diagnostics.topScore);
    const averageTopKScore = normalizeScore(input.diagnostics.avgScore);
    const scoreGap = normalizeScore(input.diagnostics.scoreSpread);
    const thresholdMargin = round(Math.max(0, topChunkScore - 0.2), 3);
    const retrievalSaturation = round(
      Math.min(1, input.diagnostics.relevantEvidenceCount / Math.max(1, input.diagnostics.returnedCount)),
      3
    );
    const coverage =
      input.query && chunks.length > 0
        ? this.coverageEstimator.estimate({ query: input.query, chunks })
        : {
            facets: [],
            facetScores: {},
            coveredFacets: [],
            missingFacets: [],
            coverageBySource: {},
            coverageScore: round(input.evals?.answerOverlap ?? input.diagnostics.evidenceCoverage, 3),
          };
    const agreement = this.agreementAnalyzer.analyze(chunks);
    const contradictions = this.contradictionDetector.detect(chunks);
    const source = this.sourceDiversityAnalyzer.analyze(chunks);
    const rerank = this.rerankStabilityAnalyzer.analyze({
      rerankTrace: input.rerankTrace,
    });
    const queryText = normalizeWhitespace((input.query ?? "").toLowerCase());
    const tokenCount = queryText.match(/[a-z0-9]{2,}/g)?.length ?? 0;
    const queryRisk: QueryRiskSignals = {
      ambiguous: /\b(it|this|that|they)\b/.test(queryText) || tokenCount <= 4,
      critical: /\b(security|compliance|financial|legal|medical)\b/.test(queryText),
      multiHop: /\b(compare|difference|between|versus|vs|timeline|before|after)\b/.test(queryText),
      normative: /\bshould|must|policy|required\b/.test(queryText),
      precisionRequired: /\bexact|precise|strict|version|date\b/.test(queryText),
    };

    return {
      retrieval: {
        topChunkScore: round(topChunkScore, 3),
        averageTopKScore: round(averageTopKScore, 3),
        scoreDistribution: round(Math.max(0, 1 - scoreGap), 3),
        scoreGap: round(scoreGap, 3),
        thresholdMargin,
        retrievalSaturation,
      },
      coverage,
      agreement,
      contradictions,
      source,
      rerank,
      queryRisk,
      groundedness: round(input.evals?.groundedness ?? input.diagnostics.groundedConsistency, 3),
      answerConsistency: round(
        input.evals?.scorerResults?.faithfulness?.score ??
          input.evals?.groundedness ??
          input.diagnostics.groundedConsistency,
        3
      ),
      citationCoverage: round(input.diagnostics.citationCoverage, 3),
    };
  }
}

export class ConfidencePolicyEngine {
  private readonly defaultPolicy: ConfidencePolicy = {
    thresholds: {
      veryLow: 0.3,
      low: 0.45,
      moderate: 0.65,
      high: 0.82,
    },
    contradictionRiskThreshold: 0.35,
    minimumEvidenceCoverage: 0.45,
    minimumSourceDiversity: 0.35,
  };

  getPolicy(overrides?: Partial<ConfidencePolicy>): ConfidencePolicy {
    return {
      ...this.defaultPolicy,
      ...overrides,
      thresholds: {
        ...this.defaultPolicy.thresholds,
        ...(overrides?.thresholds ?? {}),
      },
    };
  }

  selectAction(input: {
    score: number;
    contradictionRisk: number;
    evidenceCoverage: number;
    sourceDiversity: number;
    queryRisk: QueryRiskSignals;
    policy?: Partial<ConfidencePolicy>;
  }): ConfidenceAction {
    const policy = this.getPolicy(input.policy);
    if (input.evidenceCoverage < policy.minimumEvidenceCoverage * 0.6 || input.score < policy.thresholds.veryLow) {
      return "refuse_due_to_insufficient_evidence";
    }
    if (input.contradictionRisk >= policy.contradictionRiskThreshold) {
      return "run_contradiction_check";
    }
    if (input.queryRisk.ambiguous) {
      return "request_clarification";
    }
    if (input.score < policy.thresholds.low || input.sourceDiversity < policy.minimumSourceDiversity * 0.8) {
      return "run_additional_retrieval";
    }
    if (input.score < policy.thresholds.moderate) {
      return "answer_with_uncertainty";
    }
    return "answer_normally";
  }
}

export class ConfidenceCalibrationEngine {
  constructor(
    private readonly signalCollector = new ConfidenceSignalCollector(),
    private readonly policyEngine = new ConfidencePolicyEngine()
  ) {}

  calibrate(input: {
    query?: string;
    diagnostics: RetrievalDiagnostics;
    chunks?: RetrievalEvidenceChunk[];
    evals?: {
      groundedness?: number;
      answerOverlap?: number;
      retrievalAccuracy?: number;
      scorerResults?: {
        faithfulness?: { score: number };
        relevance?: { score: number };
        recall?: { score: number };
      };
    };
    rerankTrace?: Array<{ chunkId: string; beforeRank: number; afterRank: number; finalScore?: number }>;
    profile?: CalibrationProfile;
  }): ConfidenceScore {
    const signals = this.signalCollector.collect(input);
    const retrievalConfidence = round(
      signals.retrieval.topChunkScore * 0.45 +
        signals.retrieval.averageTopKScore * 0.3 +
        signals.retrieval.thresholdMargin * 0.1 +
        signals.retrieval.retrievalSaturation * 0.15,
      3
    );
    const evidenceConfidence = round(
      signals.coverage.coverageScore * 0.45 +
        signals.agreement.consensus.score * 0.3 +
        signals.source.score * 0.25 -
        Math.min(0.3, signals.contradictions.length * 0.08),
      3
    );
    const answerConfidence = round(signals.groundedness * 0.55 + signals.answerConsistency * 0.45, 3);
    const citationConfidence = round(signals.citationCoverage, 3);
    const contradictionRisk = round(Math.min(1, signals.contradictions.length / 3), 3);
    const rerankStability = round(signals.rerank.stability, 3);

    const retrievalWeight = input.profile?.retrievalWeight ?? 0.28;
    const evidenceWeight = input.profile?.evidenceWeight ?? 0.32;
    const answerWeight = input.profile?.answerWeight ?? 0.22;
    const citationWeight = input.profile?.citationWeight ?? 0.1;
    const contradictionPenaltyWeight = input.profile?.contradictionPenaltyWeight ?? 0.2;
    const overallConfidence = round(
      Math.max(
        0,
        Math.min(
          1,
          retrievalConfidence * retrievalWeight +
            evidenceConfidence * evidenceWeight +
            answerConfidence * answerWeight +
            citationConfidence * citationWeight +
            rerankStability * 0.08 -
            contradictionRisk * contradictionPenaltyWeight
        )
      ),
      3
    );

    const label: ConfidenceLabel =
      overallConfidence >= 0.85
        ? "very_high"
        : overallConfidence >= 0.68
          ? "high"
          : overallConfidence >= 0.5
            ? "moderate"
            : overallConfidence >= 0.32
              ? "low"
              : "very_low";
    const uncertaintyLevel: UncertaintyLevel =
      overallConfidence >= 0.75 ? "low" : overallConfidence >= 0.5 ? "medium" : "high";

    const uncertaintyReasons = [
      ...(signals.coverage.missingFacets.length > 0 ? ["Question coverage is partial."] : []),
      ...(signals.source.score < 0.35 ? ["Evidence is concentrated in few sources."] : []),
      ...(contradictionRisk > 0 ? ["Conflicting evidence was detected."] : []),
      ...(rerankStability < 0.6 ? ["Answer appears sensitive to reranking changes."] : []),
      ...(signals.queryRisk.ambiguous ? ["Query appears ambiguous or underspecified."] : []),
    ];
    const recommendedAction = this.policyEngine.selectAction({
      score: overallConfidence,
      contradictionRisk,
      evidenceCoverage: signals.coverage.coverageScore,
      sourceDiversity: signals.source.score,
      queryRisk: signals.queryRisk,
      policy: input.profile?.policy,
    });

    const breakdown: ConfidenceBreakdown = {
      retrievalConfidence,
      evidenceCoverage: round(signals.coverage.coverageScore, 3),
      chunkAgreement: round(signals.agreement.consensus.score, 3),
      sourceDiversity: round(signals.source.score, 3),
      contradictionRisk,
      groundedness: signals.groundedness,
      rerankStability,
      citationConfidence,
      answerConfidence,
    };
    const trace: ConfidenceTrace = {
      overallConfidence,
      label,
      uncertaintyLevel,
      factors: [
        { name: "retrievalConfidence", score: retrievalConfidence, weight: retrievalWeight, impact: "positive" },
        { name: "evidenceCoverage", score: breakdown.evidenceCoverage, weight: evidenceWeight, impact: "positive" },
        { name: "chunkAgreement", score: breakdown.chunkAgreement, weight: 0.2, impact: "positive" },
        { name: "sourceDiversity", score: breakdown.sourceDiversity, weight: 0.15, impact: "positive" },
        { name: "groundedness", score: breakdown.groundedness, weight: answerWeight, impact: "positive" },
        {
          name: "contradictionRisk",
          score: contradictionRisk,
          weight: contradictionPenaltyWeight,
          impact: "negative",
        },
      ],
      uncertaintyReasons,
      policyAction: recommendedAction,
    };

    return {
      overallConfidence,
      label,
      breakdown,
      retrievalConfidence,
      evidenceConfidence,
      answerConfidence,
      citationConfidence,
      contradictionRisk,
      uncertaintyLevel,
      uncertaintyReasons,
      recommendedAction,
      trace,
    };
  }
}

export class RetrievalFailureClassifier {
  classify(input: RetrievalFailureAnalyzerInput): {
    failureReason: RetrievalFailureReason;
    confidence: number;
    semanticDriftIndicators: string[];
    chunkFragmentationIndicators: string[];
  } {
    const query = normalizeWhitespace(input.query.toLowerCase());
    const avgLexicalOverlap = averageLexicalOverlap(query, input.chunks);
    const topScore = normalizeScore(input.diagnostics.topScore);
    const answerOverlap = input.evals?.answerOverlap ?? input.diagnostics.evidenceCoverage;
    const groundedness = input.evals?.groundedness ?? input.diagnostics.groundedConsistency;
    const semanticDriftIndicators: string[] = [];
    const chunkFragmentationIndicators: string[] = [];
    const rerankDemotion = (input.rerankingOutput ?? []).some(
      (item) => item.beforeRank <= 3 && item.afterRank - item.beforeRank >= 5
    );
    const overlapTokens = input.overlapConfig?.overlapTokens ?? 0;
    const chunkSize = input.overlapConfig?.chunkSize ?? 0;
    const retrievalMode = input.diagnostics.retrievalMetadata.retrievalMode.toLowerCase();

    if (topScore > 0.55 && answerOverlap < 0.4 && avgLexicalOverlap < 0.25) {
      semanticDriftIndicators.push("high_similarity_low_task_relevance", "low_entity_overlap");
      return {
        failureReason: "semantic_drift",
        confidence: round(Math.max(0.65, Math.min(0.95, topScore * 0.8 + (1 - answerOverlap) * 0.2)), 3),
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (query.split(" ").length <= 3) {
      return {
        failureReason: "underspecified_query",
        confidence: 0.74,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (avgLexicalOverlap > 0.35 && topScore < 0.2) {
      semanticDriftIndicators.push("high_lexical_overlap_low_embedding_similarity");
      return {
        failureReason: "embedding_mismatch",
        confidence: 0.78,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (overlapTokens > 0 && overlapTokens < 30 && input.diagnostics.citationCoverage < 0.5) {
      chunkFragmentationIndicators.push("low_overlap", "fragmented_citations");
      return {
        failureReason: "insufficient_overlap",
        confidence: 0.7,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (chunkSize > 0 && chunkSize < 180) {
      chunkFragmentationIndicators.push("small_chunk_size", "context_split");
      return {
        failureReason: "chunk_too_small",
        confidence: 0.66,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (rerankDemotion) {
      return {
        failureReason: "reranker_demoted_relevant_chunk",
        confidence: 0.73,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (retrievalMode.includes("dense") && topScore < 0.2) {
      return {
        failureReason: "dense_retrieval_failure",
        confidence: 0.71,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (!retrievalMode.includes("hybrid") && topScore < 0.3) {
      return {
        failureReason: "hybrid_disabled",
        confidence: 0.68,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    if (groundedness < 0.45) {
      return {
        failureReason: "groundedness_loss",
        confidence: 0.72,
        semanticDriftIndicators,
        chunkFragmentationIndicators,
      };
    }

    return {
      failureReason: "low_recall",
      confidence: 0.62,
      semanticDriftIndicators,
      chunkFragmentationIndicators,
    };
  }
}

export class RetrievalRootCauseAnalyzer {
  analyze(input: {
    failureReason: RetrievalFailureReason;
    diagnostics: RetrievalDiagnostics;
    classifierConfidence: number;
  }): RetrievalDiagnosticFinding[] {
    const finding = (component: RetrievalDiagnosticFinding["component"], issue: RetrievalFailureReason, rationale: string) =>
      ({
        component,
        issue,
        confidence: round(input.classifierConfidence, 3),
        rationale,
      }) satisfies RetrievalDiagnosticFinding;

    switch (input.failureReason) {
      case "semantic_drift":
        return [
          finding("embedding", "embedding_mismatch", "Retrieved chunks scored well but diverged from query intent."),
          finding("retrieval", "hybrid_disabled", "Hybrid retrieval could improve lexical anchoring."),
        ];
      case "insufficient_overlap":
      case "chunk_too_small":
        return [finding("chunking", input.failureReason, "Chunk boundaries likely split required context.")];
      case "reranker_demoted_relevant_chunk":
        return [finding("reranking", "reranker_demoted_relevant_chunk", "Reranker reordered relevant chunks downward.")];
      case "dense_retrieval_failure":
      case "hybrid_disabled":
      case "low_recall":
        return [finding("retrieval", input.failureReason, "Primary retrieval strategy did not surface enough evidence.")];
      case "groundedness_loss":
        return [finding("generation", "groundedness_loss", "Answer grounding weakened relative to retrieved evidence.")];
      case "embedding_mismatch":
        return [finding("embedding", "embedding_mismatch", "Embedding space appears misaligned with query intent.")];
      default:
        return [finding("retrieval", "poor_candidate_pool", "Candidate pool quality appears insufficient.")];
    }
  }
}

export class RetrievalRecoveryAdvisor {
  advise(input: {
    failureReason: RetrievalFailureReason;
    diagnostics: RetrievalDiagnostics;
    findings: RetrievalDiagnosticFinding[];
  }): CandidateFix[] {
    const makeFix = (
      strategy: RetrievalRecoveryStrategy,
      estimatedImpact: number,
      estimatedCost: CandidateFix["estimatedCost"],
      estimatedLatencyImpact: CandidateFix["estimatedLatencyImpact"],
      confidence: number,
      affectedMetrics: CandidateFix["affectedMetrics"],
      rationale: string
    ): CandidateFix => ({
      strategy,
      estimatedImpact: round(estimatedImpact, 3),
      estimatedCost,
      estimatedLatencyImpact,
      confidence: round(confidence, 3),
      affectedMetrics,
      rationale,
    });

    switch (input.failureReason) {
      case "semantic_drift":
        return [
          makeFix("enable_hybrid", 0.22, "low", "low", 0.82, ["recall", "relevance"], "Hybrid can recover lexical anchors."),
          makeFix("rewrite_query", 0.14, "low", "low", 0.74, ["relevance"], "Query rewrite can reduce topic drift."),
          makeFix("enable_hyde", 0.16, "medium", "medium", 0.68, ["recall", "evidence_coverage"], "HyDE can bridge semantic gap."),
        ];
      case "embedding_mismatch":
        return [
          makeFix("switch_embedding_provider", 0.21, "medium", "low", 0.75, ["relevance", "retrieval_confidence"], "Embedding provider may be underperforming for this corpus."),
          makeFix("enable_hybrid", 0.15, "low", "low", 0.73, ["recall"], "Sparse signal can mitigate embedding mismatch."),
        ];
      case "insufficient_overlap":
      case "chunk_too_small":
        return [
          makeFix("increase_overlap", 0.2, "low", "low", 0.8, ["chunk_coherence", "evidence_coverage"], "Higher overlap restores cross-chunk continuity."),
          makeFix("increase_chunk_size", 0.16, "medium", "low", 0.7, ["chunk_coherence", "recall"], "Larger chunks can preserve definitions and long context."),
        ];
      case "reranker_demoted_relevant_chunk":
        return [
          makeFix("increase_top_k", 0.13, "low", "medium", 0.72, ["recall"], "Deeper candidate pool reduces harmful demotions."),
          makeFix("enable_query_expansion", 0.1, "low", "low", 0.64, ["relevance"], "Expanded terms can stabilize reranking."),
        ];
      case "dense_retrieval_failure":
      case "hybrid_disabled":
      case "low_recall":
        return [
          makeFix("enable_hybrid", 0.18, "low", "low", 0.77, ["recall", "retrieval_confidence"], "Hybrid retrieval usually improves candidate recall."),
          makeFix("increase_top_k", 0.12, "low", "medium", 0.69, ["recall", "evidence_coverage"], "More candidates improve evidence coverage."),
          makeFix("reduce_score_threshold", 0.08, "low", "low", 0.63, ["recall"], "Lower threshold allows borderline evidence through."),
        ];
      case "groundedness_loss":
        return [
          makeFix("enable_reranking", 0.11, "low", "medium", 0.66, ["groundedness", "citation_support"], "Reranking can prioritize directly supportive chunks."),
          makeFix("improve_metadata", 0.09, "medium", "low", 0.61, ["relevance", "citation_support"], "Metadata improves evidence selection quality."),
        ];
      default:
        return [
          makeFix("add_multi_retrieval", 0.12, "medium", "high", 0.6, ["recall", "diversity"], "Fallback multi-retrieval improves robustness."),
        ];
    }
  }
}

export class RetrievalFailureAnalyzer {
  constructor(
    private readonly classifier = new RetrievalFailureClassifier(),
    private readonly rootCauseAnalyzer = new RetrievalRootCauseAnalyzer(),
    private readonly recoveryAdvisor = new RetrievalRecoveryAdvisor()
  ) {}

  analyze(input: RetrievalFailureAnalyzerInput): {
    failureCase: RetrievalFailureCase;
    semanticDriftIndicators: string[];
    chunkFragmentationIndicators: string[];
  } {
    const classification = this.classifier.classify(input);
    const diagnosis = this.rootCauseAnalyzer.analyze({
      failureReason: classification.failureReason,
      diagnostics: input.diagnostics,
      classifierConfidence: classification.confidence,
    });
    const candidateFixes = this.recoveryAdvisor.advise({
      failureReason: classification.failureReason,
      diagnostics: input.diagnostics,
      findings: diagnosis,
    });

    return {
      failureCase: {
        failureReason: classification.failureReason,
        confidence: classification.confidence,
        diagnosis,
        candidateFixes,
      },
      semanticDriftIndicators: classification.semanticDriftIndicators,
      chunkFragmentationIndicators: classification.chunkFragmentationIndicators,
    };
  }
}

export class RetrievalWhatIfEngine {
  simulate(input: {
    failureCase: RetrievalFailureCase;
    diagnostics: RetrievalDiagnostics;
    scenarios?: RetrievalSimulationScenario[];
  }): RetrievalSimulationResult[] {
    const defaultScenarios: RetrievalSimulationScenario[] = [
      { name: "hybrid_enabled", enableHybrid: true },
      { name: "topk_20_rerank", topK: 20, enableReranking: true },
      { name: "query_expansion_hyde", enableQueryExpansion: true, enableHyde: true },
    ];
    const scenarios = input.scenarios?.length ? input.scenarios : defaultScenarios;

    return scenarios.map((scenario) => {
      let estimatedRecallImprovement = 0;
      let estimatedRelevanceImprovement = 0;
      let estimatedLatencyImpact = 0;
      const reasons: string[] = [];

      if (scenario.enableHybrid) {
        estimatedRecallImprovement += 0.12;
        estimatedRelevanceImprovement += 0.08;
        estimatedLatencyImpact += 6;
        reasons.push("hybrid retrieval adds lexical fallback");
      }
      if (scenario.topK && scenario.topK > Math.max(5, input.diagnostics.returnedCount)) {
        estimatedRecallImprovement += 0.08;
        estimatedLatencyImpact += 5;
        reasons.push("larger topK increases candidate coverage");
      }
      if (scenario.enableReranking) {
        estimatedRelevanceImprovement += 0.1;
        estimatedLatencyImpact += 9;
        reasons.push("reranking improves ordering quality");
      }
      if (scenario.enableQueryExpansion) {
        estimatedRecallImprovement += 0.07;
        reasons.push("query expansion improves lexical matching");
      }
      if (scenario.enableHyde) {
        estimatedRecallImprovement += 0.06;
        estimatedLatencyImpact += 8;
        reasons.push("HyDE strengthens semantic retrieval bridge");
      }
      if (scenario.enableGraphRag) {
        estimatedRecallImprovement += 0.05;
        estimatedRelevanceImprovement += 0.04;
        estimatedLatencyImpact += 10;
        reasons.push("graph traversal can recover connected evidence");
      }

      return {
        scenario,
        estimatedRecallImprovement: round(estimatedRecallImprovement, 3),
        estimatedRelevanceImprovement: round(estimatedRelevanceImprovement, 3),
        estimatedLatencyImpact: round(estimatedLatencyImpact, 3),
        rationale: reasons.join("; ") || "No meaningful change configured.",
      };
    });
  }
}

export class RetrievalSimulationRunner {
  constructor(private readonly whatIfEngine = new RetrievalWhatIfEngine()) {}

  run(input: {
    failureCase: RetrievalFailureCase;
    diagnostics: RetrievalDiagnostics;
    scenarios?: RetrievalSimulationScenario[];
  }): RetrievalSimulationResult[] {
    return this.whatIfEngine.simulate(input);
  }
}

export class StrategyComparator {
  compare(results: RetrievalSimulationResult[]): RetrievalSimulationResult[] {
    return [...results].sort((left, right) => {
      const leftScore = left.estimatedRecallImprovement + left.estimatedRelevanceImprovement - left.estimatedLatencyImpact / 100;
      const rightScore =
        right.estimatedRecallImprovement + right.estimatedRelevanceImprovement - right.estimatedLatencyImpact / 100;
      return rightScore - leftScore;
    });
  }
}

export class ChunkSelectionExplainer {
  explain(query: string, chunks: RetrievalEvidenceChunk[]): string[] {
    const normalizedQuery = normalizeWhitespace(query.toLowerCase());
    return chunks.slice(0, 3).map((chunk) => {
      const overlap = round(tokenOverlapRatio(normalizedQuery, chunk.text.toLowerCase()), 3);
      return `Chunk ${chunk.chunkId} selected with score=${round(chunk.score, 3)} and lexical overlap=${overlap}.`;
    });
  }
}

export class ScoreBreakdownExplainer {
  explain(diagnostics: RetrievalDiagnostics): string[] {
    return [
      `topScore=${diagnostics.topScore} avgScore=${diagnostics.avgScore} spread=${diagnostics.scoreSpread}`,
      `evidenceCoverage=${diagnostics.evidenceCoverage} groundedConsistency=${diagnostics.groundedConsistency}`,
      `citationCoverage=${diagnostics.citationCoverage} sourceDiversity=${diagnostics.sourceDiversity}`,
    ];
  }
}

export class RetrievalExplainer {
  constructor(
    private readonly chunkExplainer = new ChunkSelectionExplainer(),
    private readonly scoreExplainer = new ScoreBreakdownExplainer()
  ) {}

  explain(input: {
    query: string;
    diagnostics: RetrievalDiagnostics;
    chunks: RetrievalEvidenceChunk[];
    failureCase: RetrievalFailureCase;
  }): RetrievalExplainabilityReport {
    return {
      whyChunksWereRetrieved: this.chunkExplainer.explain(input.query, input.chunks),
      whyRelevantChunksMayHaveBeenMissed: [
        `Detected failure reason: ${input.failureCase.failureReason}.`,
        ...input.failureCase.diagnosis.map(
          (item) => `${item.component}: ${item.issue} (confidence ${item.confidence}) - ${item.rationale}`
        ),
      ],
      rerankingImpact: input.diagnostics.retrievalMetadata.rerankingApplied
        ? "Reranking was enabled and likely changed final chunk order."
        : "Reranking was disabled; initial retrieval ranking was kept.",
      overlapImpact:
        input.failureCase.failureReason === "insufficient_overlap" || input.failureCase.failureReason === "chunk_too_small"
          ? "Chunk overlap appears insufficient for context continuity."
          : "No strong overlap issue detected from current diagnostics.",
      embeddingImpact:
        input.failureCase.failureReason === "embedding_mismatch"
          ? "Embedding mismatch detected between query intent and retrieved vectors."
          : "Embedding signals look broadly consistent with retrieval outcome.",
      topKImpact:
        input.diagnostics.candidateCount <= input.diagnostics.returnedCount + 2
          ? "Candidate depth is shallow; increasing topK may improve recall."
          : "Current topK appears sufficient for this retrieval depth.",
      queryRewriteImpact: this.scoreExplainer.explain(input.diagnostics).join(" | "),
    };
  }
}

export class RetrievalHealthScorer {
  score(input: {
    diagnostics: RetrievalDiagnostics;
    retrievalConfidence?: number;
  }): RetrievalHealthReport {
    const recall = normalizeScore(input.diagnostics.evidenceCoverage);
    const relevance = normalizeScore(input.diagnostics.avgScore);
    const diversity = Math.min(1, input.diagnostics.sourceDiversity / 3);
    const groundednessPotential = normalizeScore(input.diagnostics.groundedConsistency);
    const retrievalConfidence = normalizeScore(input.retrievalConfidence ?? input.diagnostics.topScore);
    const evidenceCoverage = normalizeScore(input.diagnostics.evidenceCoverage);
    const redundancy = normalizeScore(
      1 - Math.max(0, input.diagnostics.resultCount - input.diagnostics.sourceDiversity) / Math.max(1, input.diagnostics.resultCount)
    );
    const chunkCoherence = normalizeScore((input.diagnostics.citationCoverage + input.diagnostics.groundedConsistency) / 2);
    const citationSupport = normalizeScore(input.diagnostics.citationCoverage);

    const qualityBreakdown: RetrievalQualityBreakdown = {
      recall: round(recall, 3),
      relevance: round(relevance, 3),
      diversity: round(diversity, 3),
      groundednessPotential: round(groundednessPotential, 3),
      retrievalConfidence: round(retrievalConfidence, 3),
      evidenceCoverage: round(evidenceCoverage, 3),
      redundancy: round(redundancy, 3),
      chunkCoherence: round(chunkCoherence, 3),
      citationSupport: round(citationSupport, 3),
    };

    const overall = round(
      recall * 0.2 +
        relevance * 0.14 +
        diversity * 0.08 +
        groundednessPotential * 0.14 +
        retrievalConfidence * 0.14 +
        evidenceCoverage * 0.12 +
        redundancy * 0.06 +
        chunkCoherence * 0.06 +
        citationSupport * 0.06,
      3
    );

    const alerts = [
      ...(recall < 0.45 ? ["low_recall"] : []),
      ...(relevance < 0.45 ? ["low_relevance"] : []),
      ...(citationSupport < 0.45 ? ["low_citation_support"] : []),
      ...(chunkCoherence < 0.45 ? ["low_chunk_coherence"] : []),
    ];

    return {
      healthScore: {
        overall,
      },
      qualityBreakdown,
      alerts,
    };
  }
}

export class RetrievalDiagnosticsEngine {
  constructor(
    private readonly failureAnalyzer = new RetrievalFailureAnalyzer(),
    private readonly healthScorer = new RetrievalHealthScorer(),
    private readonly simulationRunner = new RetrievalSimulationRunner(),
    private readonly comparator = new StrategyComparator(),
    private readonly explainer = new RetrievalExplainer()
  ) {}

  analyze(input: RetrievalFailureAnalyzerInput & { scenarios?: RetrievalSimulationScenario[] }): RetrievalAnalysisResult {
    const failure = this.failureAnalyzer.analyze(input);
    const healthReport = this.healthScorer.score({
      diagnostics: input.diagnostics,
      retrievalConfidence: input.retrievalConfidence,
    });
    const simulations = this.comparator.compare(
      this.simulationRunner.run({
        failureCase: failure.failureCase,
        diagnostics: input.diagnostics,
        scenarios: input.scenarios,
      })
    );
    const explainability = this.explainer.explain({
      query: input.query,
      diagnostics: input.diagnostics,
      chunks: input.chunks,
      failureCase: failure.failureCase,
    });

    const diagnosticTrace: RetrievalDiagnosticTrace = {
      retrievalFailureDetected: true,
      failureType: failure.failureCase.failureReason,
      confidence: failure.failureCase.confidence,
      probableCauses: failure.failureCase.diagnosis,
      evidenceGaps: buildEvidenceGaps(input),
      chunkFragmentationIndicators: failure.chunkFragmentationIndicators,
      semanticDriftIndicators: failure.semanticDriftIndicators,
      rerankImpact: {
        rerankingApplied: input.diagnostics.retrievalMetadata.rerankingApplied,
        candidateCount: input.diagnostics.candidateCount,
        returnedCount: input.diagnostics.returnedCount,
      },
      retrievalConfidence: round(input.retrievalConfidence ?? input.diagnostics.topScore, 3),
      healthScore: healthReport.healthScore.overall,
      suggestedFixes: failure.failureCase.candidateFixes.map((fix) => fix.strategy),
    };

    return {
      failureCase: failure.failureCase,
      diagnosticTrace,
      healthReport,
      simulations,
      explainability,
      recommendations: failure.failureCase.candidateFixes,
      autoTuningRecommendations: buildAutoTuningRecommendations(input, failure.failureCase),
    };
  }
}

export function buildRetrievalDiagnostics(input: {
  results: RetrievalEvidenceChunk[];
  candidateCount?: number;
  citations?: Array<{ chunkId: string }>;
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
  };
  retrievalMode?: string;
  rerankingApplied?: boolean;
  provider?: string;
  model?: string;
  queryIntent?: string;
}): RetrievalDiagnostics {
  const scores = input.results.map((item) => item.score);
  const topScore = scores[0] ?? 0;
  const avgScore =
    scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const minScore = scores.length === 0 ? 0 : Math.min(...scores);
  const citationIds = new Set((input.citations ?? []).map((item) => item.chunkId));
  const sourcePairs = new Set(input.results.map((item) => `${item.documentId}:${item.sectionId}`));
  const involvedChunkIds = input.results.map((item) => item.chunkId);
  const conflictingChunkIds = detectConflictingChunks(input.results);
  const citationCoverage =
    citationIds.size === 0
      ? 0
      : involvedChunkIds.filter((chunkId) => citationIds.has(chunkId)).length / Math.max(1, citationIds.size);
  const evidenceCoverage = Number(
    (
      ((input.evals?.answerOverlap ?? 0) * 0.55 + normalizeScore(avgScore) * 0.45)
    ).toFixed(3)
  );
  const groundedConsistency = Number(
    (
      ((input.evals?.groundedness ?? 0) * 0.65 + citationCoverage * 0.35)
    ).toFixed(3)
  );

  return {
    resultCount: input.results.length,
    relevantEvidenceCount: input.results.filter((item) => item.score >= 0.2).length,
    candidateCount: input.candidateCount ?? input.results.length,
    returnedCount: input.results.length,
    topScore: round(topScore, 3),
    avgScore: round(avgScore, 3),
    scoreSpread: round(Math.max(0, topScore - minScore), 3),
    sourceDiversity: sourcePairs.size,
    citationCount: citationIds.size,
    citationCoverage: round(citationCoverage, 3),
    evidenceCoverage,
    groundedConsistency,
    conflictCount: conflictingChunkIds.length,
    conflictingChunkIds,
    involvedChunkIds,
    retrievalMetadata: {
      retrievalMode: input.retrievalMode ?? "unknown",
      rerankingApplied: Boolean(input.rerankingApplied),
      provider: input.provider,
      model: input.model,
      queryIntent: input.queryIntent,
    },
  };
}

export function classifyRetrievalFailure(input: {
  diagnostics: RetrievalDiagnostics;
  answerGrounded: boolean;
  answerText: string;
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
    retrievalAccuracy?: number;
    scorerResults?: {
      faithfulness?: { score: number };
      relevance?: { score: number };
      recall?: { score: number };
    };
  };
}): RetrievalFailureClassification {
  const groundedness = input.evals?.groundedness ?? 0;
  const answerOverlap = input.evals?.answerOverlap ?? 0;
  const retrievalAccuracy = input.evals?.retrievalAccuracy ?? 0;
  const faithfulness = input.evals?.scorerResults?.faithfulness?.score ?? groundedness;
  const recall = input.evals?.scorerResults?.recall?.score ?? retrievalAccuracy;
  const resultCount = input.diagnostics.resultCount;

  let category: RetrievalFailureCategory;
  let probableCause: string;

  if (resultCount === 0 || input.diagnostics.topScore < 0.12) {
    category = "NOT_FOUND";
    probableCause = "Retrieval returned no sufficiently relevant chunk for the question.";
  } else if (!input.answerGrounded || groundedness < 0.45 || faithfulness < 0.45) {
    category = "UNGROUNDED_ANSWER";
    probableCause = "The final answer extrapolated beyond the evidence recovered by retrieval.";
  } else if (recall < 0.45 || input.diagnostics.evidenceCoverage < 0.45) {
    category = "PARTIAL_CONTEXT";
    probableCause = "Only part of the necessary supporting evidence was retrieved.";
  } else if (input.diagnostics.conflictCount > 0 || input.diagnostics.groundedConsistency < 0.55) {
    category = "LOW_CONFIDENCE";
    probableCause = "The retrieved evidence is conflicting or too weak to support a stable answer.";
  } else if (answerOverlap < 0.35 || retrievalAccuracy < 0.35) {
    category = "WRONG_CONTEXT";
    probableCause = "Retrieval produced context, but it appears mismatched with the question or answer.";
  } else {
    category = "LOW_CONFIDENCE";
    probableCause = "The answer is grounded but remains fragile due to limited evidence breadth.";
  }

  return {
    category,
    confidence: round(
      Math.max(
        0.2,
        Math.min(
          0.98,
          input.diagnostics.topScore * 0.35 +
            groundedness * 0.25 +
            input.diagnostics.evidenceCoverage * 0.2 +
            (1 - Math.min(1, input.diagnostics.conflictCount / 3)) * 0.2
        )
      ),
      3
    ),
    probableCause,
    involvedChunks:
      input.diagnostics.conflictingChunkIds.length > 0
        ? input.diagnostics.conflictingChunkIds
        : input.diagnostics.involvedChunkIds.slice(0, 3),
    retrievalMetadata: {
      ...input.diagnostics.retrievalMetadata,
      topScore: input.diagnostics.topScore,
      avgScore: input.diagnostics.avgScore,
      sourceDiversity: input.diagnostics.sourceDiversity,
      evidenceCoverage: input.diagnostics.evidenceCoverage,
      groundedConsistency: input.diagnostics.groundedConsistency,
      conflictCount: input.diagnostics.conflictCount,
    },
  };
}

export function calibrateConfidence(input: {
  query?: string;
  diagnostics: RetrievalDiagnostics;
  chunks?: RetrievalEvidenceChunk[];
  rerankTrace?: Array<{ chunkId: string; beforeRank: number; afterRank: number; finalScore?: number }>;
  profile?: CalibrationProfile;
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
    retrievalAccuracy?: number;
    scorerResults?: {
      faithfulness?: { score: number };
      relevance?: { score: number };
      recall?: { score: number };
    };
  };
}): ConfidenceCalibration {
  return defaultConfidenceCalibrationService.calibrate(input);
}

export class ConfidenceCalibrationService {
  calibrate(input: {
    query?: string;
    diagnostics: RetrievalDiagnostics;
    chunks?: RetrievalEvidenceChunk[];
    rerankTrace?: Array<{ chunkId: string; beforeRank: number; afterRank: number; finalScore?: number }>;
    profile?: CalibrationProfile;
    evals?: {
      groundedness?: number;
      answerOverlap?: number;
      retrievalAccuracy?: number;
      scorerResults?: {
        faithfulness?: { score: number };
        relevance?: { score: number };
        recall?: { score: number };
      };
    };
  }): ConfidenceCalibration {
    const calibrated = defaultConfidenceCalibrationEngine.calibrate({
      query: input.query,
      diagnostics: input.diagnostics,
      chunks: input.chunks,
      evals: input.evals,
      rerankTrace: input.rerankTrace,
      profile: input.profile,
    });
    const groundedness = input.evals?.groundedness ?? 0;
    const answerConsistency = input.evals?.scorerResults?.faithfulness?.score ?? groundedness;
    const questionCoverage =
      input.evals?.answerOverlap ??
      input.evals?.scorerResults?.relevance?.score ??
      input.diagnostics.evidenceCoverage;
    const retrievalScore =
      normalizeScore(input.diagnostics.topScore) * 0.6 + normalizeScore(input.diagnostics.avgScore) * 0.4;
    const sourceDiversity = Math.min(1, input.diagnostics.sourceDiversity / 3);
    const evidenceQuantity = Math.min(1, input.diagnostics.relevantEvidenceCount / 3);
    const conflictPenalty = Math.min(1, input.diagnostics.conflictCount / 3);

    const evidenceSignals = {
      retrievalScore: round(retrievalScore, 3),
      sourceDiversity: round(sourceDiversity, 3),
      questionCoverage: round(questionCoverage, 3),
      groundedness: round(groundedness, 3),
      answerConsistency: round(answerConsistency, 3),
      citationCoverage: round(input.diagnostics.citationCoverage, 3),
      relevantEvidenceCount: input.diagnostics.relevantEvidenceCount,
      conflictCount: input.diagnostics.conflictCount,
      insufficientEvidence: input.diagnostics.relevantEvidenceCount === 0 || retrievalScore < 0.25,
      contradictoryContext: input.diagnostics.conflictCount > 0,
      missingCitations: input.diagnostics.citationCount === 0,
      lowGroundedness: groundedness < 0.55,
      partialCoverage: questionCoverage < 0.5,
      inconsistentAnswer: answerConsistency < 0.5,
    };

    const fragilityPenalty =
      (evidenceSignals.insufficientEvidence ? 0.18 : 0) +
      (evidenceSignals.contradictoryContext ? 0.16 : 0) +
      (evidenceSignals.missingCitations ? 0.08 : 0) +
      (evidenceSignals.lowGroundedness ? 0.12 : 0) +
      (evidenceSignals.partialCoverage ? 0.08 : 0) +
      (evidenceSignals.inconsistentAnswer ? 0.12 : 0);

    const confidenceScore = round(
      Math.max(
        0,
        Math.min(
          1,
          retrievalScore * 0.22 +
            sourceDiversity * 0.1 +
            groundedness * 0.2 +
            questionCoverage * 0.16 +
            evidenceQuantity * 0.1 +
            answerConsistency * 0.16 +
            input.diagnostics.citationCoverage * 0.1 -
            conflictPenalty * 0.12 -
            fragilityPenalty
        )
      ),
      3
    );

    const confidenceLevel: ConfidenceLevel =
      confidenceScore >= 0.8
        ? "HIGH"
        : confidenceScore >= 0.6
          ? "MEDIUM"
          : confidenceScore >= 0.4
            ? "LOW"
            : "UNRELIABLE";

    const confidenceReasoning = [
      `RETRIEVAL score=${evidenceSignals.retrievalScore} evidence=${evidenceSignals.relevantEvidenceCount}`,
      `COVERAGE question=${evidenceSignals.questionCoverage} groundedness=${evidenceSignals.groundedness}`,
      `CITATIONS coverage=${evidenceSignals.citationCoverage} count=${input.diagnostics.citationCount}`,
      `CONFLICTS count=${evidenceSignals.conflictCount}`,
      ...(evidenceSignals.insufficientEvidence ? ["FLAG low-evidence"] : []),
      ...(evidenceSignals.contradictoryContext ? ["FLAG contradictory-context"] : []),
      ...(evidenceSignals.missingCitations ? ["FLAG missing-citations"] : []),
      ...(evidenceSignals.lowGroundedness ? ["FLAG low-groundedness"] : []),
      ...(evidenceSignals.partialCoverage ? ["FLAG partial-coverage"] : []),
      ...(evidenceSignals.inconsistentAnswer ? ["FLAG answer-context-inconsistency"] : []),
    ];

    return {
      confidenceScore,
      confidenceLevel,
      confidenceReasoning,
      evidenceSignals,
      factors: {
        retrievalScore: evidenceSignals.retrievalScore,
        sourceDiversity: evidenceSignals.sourceDiversity,
        groundedness: evidenceSignals.groundedness,
        questionCoverage: evidenceSignals.questionCoverage,
        evidenceQuantity: round(evidenceQuantity, 3),
        answerConsistency: evidenceSignals.answerConsistency,
        conflictPenalty: round(conflictPenalty, 3),
      },
      overallConfidence: calibrated.overallConfidence,
      label: calibrated.label,
      breakdown: calibrated.breakdown,
      retrievalConfidence: calibrated.retrievalConfidence,
      evidenceConfidence: calibrated.evidenceConfidence,
      answerConfidence: calibrated.answerConfidence,
      citationConfidence: calibrated.citationConfidence,
      contradictionRisk: calibrated.contradictionRisk,
      uncertaintyLevel: calibrated.uncertaintyLevel,
      uncertaintyReasons: calibrated.uncertaintyReasons,
      recommendedAction: calibrated.recommendedAction,
      confidenceTrace: calibrated.trace,
    };
  }
}

export function buildReplaySnapshot(input: {
  query: string;
  correlation?: ReplaySnapshot["correlation"];
  document: {
    documentId: string;
    title?: string;
    checksum?: string;
    persisted: boolean;
    indexPath?: string;
    originalFilename?: string;
  };
  indexRef?: ReplaySnapshot["indexRef"];
  parameters: ReplaySnapshot["parameters"];
  retrievalConfig: ReplaySnapshot["retrievalConfig"];
  providers: ReplaySnapshot["providers"];
  results: Array<{
    chunkId: string;
    sectionId: string;
    rank: number;
    score: number;
    text: string;
  }>;
  generation?: ReplaySnapshot["generation"];
  rerankingConfig?: ReplaySnapshot["rerankingConfig"];
  reranking?: ReplaySnapshot["reranking"];
  original?: ReplaySnapshot["original"];
  environment?: ReplaySnapshot["environment"];
}): ReplaySnapshot {
  return {
    version: "v1",
    capturedAt: new Date().toISOString(),
    mode: input.document.persisted ? "persisted" : "inline",
    query: input.query,
    correlation: input.correlation ?? {},
    document: input.document,
    indexRef: input.indexRef ?? {
      indexId: input.document.documentId,
    },
    parameters: input.parameters,
    retrievalConfig: input.retrievalConfig,
    providers: input.providers,
    generation: input.generation ?? {
      strategy: "extractive-grounded",
      deterministic: true,
      config: {
        temperature: 0,
        topP: 1,
      },
    },
    prompts: {
      systemPrompt:
        "Answer only from retrieved evidence. Preserve grounding. Do not invent missing facts.",
      answerPolicy:
        "Prefer extractive grounded answers, cite retrieved chunks, and degrade confidence when evidence is weak.",
    },
    policies: {
      groundingPolicy: "support answer claims with retrieved chunks only",
      refusalPolicy: "when evidence is insufficient, keep confidence low and avoid fabricated certainty",
      citationPolicy: "carry chunk identifiers and section metadata into the answer trace",
    },
    chunks: input.results.map((result) => ({
      chunkId: result.chunkId,
      sectionId: result.sectionId,
      rank: result.rank,
      score: round(result.score, 3),
      text: result.text,
      textHash: createHash("sha256").update(result.text).digest("hex"),
      textPreview: result.text.slice(0, 140),
    })),
    rerankingConfig: input.rerankingConfig ?? {
      applied: (input.reranking ?? []).length > 0,
      candidateCount: input.retrievalConfig.candidateCount,
      returnedCount: input.retrievalConfig.returnedCount,
    },
    reranking: input.reranking ?? [],
    original: input.original ?? {
      answer: {
        text: "",
        grounded: false,
        citations: [],
      },
    },
    environment: input.environment ?? {
      runtime: "node",
      nodeVersion: process.version,
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV,
    },
  };
}

export function compareReplaySnapshots(input: {
  original: ReplaySnapshot;
  replay: ReplaySnapshot;
  originalAnswer: { text: string; grounded: boolean };
  replayAnswer: { text: string; grounded: boolean };
  originalCostUsd?: number;
  replayCostUsd?: number;
  originalLatencyMs?: number;
  replayLatencyMs?: number;
}): ReplayComparisonReport {
  const originalChunkIds = new Set(input.original.chunks.map((item) => item.chunkId));
  const replayChunkIds = new Set(input.replay.chunks.map((item) => item.chunkId));
  const addedChunkIds = [...replayChunkIds].filter((item) => !originalChunkIds.has(item));
  const removedChunkIds = [...originalChunkIds].filter((item) => !replayChunkIds.has(item));
  const reorderedChunkIds = input.original.chunks
    .filter((item) => input.replay.chunks.some((replayItem) => replayItem.chunkId === item.chunkId))
    .filter((item) => {
      const replayItem = input.replay.chunks.find((candidate) => candidate.chunkId === item.chunkId);
      return replayItem?.rank !== item.rank;
    })
    .map((item) => item.chunkId);
  const scoreDeltas = input.original.chunks
    .filter((item) => input.replay.chunks.some((replayItem) => replayItem.chunkId === item.chunkId))
    .map((item) => {
      const replayItem = input.replay.chunks.find((candidate) => candidate.chunkId === item.chunkId);
      const originalScore = item.score;
      const replayScore = replayItem?.score;
      return {
        chunkId: item.chunkId,
        originalScore,
        replayScore,
        delta:
          typeof replayScore === "number"
            ? round(replayScore - originalScore, 3)
            : undefined,
      };
    })
    .filter((item) => item.delta !== 0);
  const retrievalChanged =
    addedChunkIds.length > 0 ||
    removedChunkIds.length > 0 ||
    reorderedChunkIds.length > 0 ||
    scoreDeltas.length > 0 ||
    JSON.stringify(input.original.reranking) !== JSON.stringify(input.replay.reranking);
  const responseChanged = normalizeWhitespace(input.originalAnswer.text) !== normalizeWhitespace(input.replayAnswer.text);
  const groundednessChanged = input.originalAnswer.grounded !== input.replayAnswer.grounded;
  const modelChanged = input.original.providers.selectedModel !== input.replay.providers.selectedModel;
  const providerChanged = input.original.providers.selectedProvider !== input.replay.providers.selectedProvider;
  const embeddingProviderChanged =
    input.original.providers.embeddingProvider !== input.replay.providers.embeddingProvider;
  const scoresChanged = scoreDeltas.length > 0;
  const chunkOrderChanged = reorderedChunkIds.length > 0;
  const errors: string[] = [];
  const status: ReplayComparisonReport["status"] =
    responseChanged ||
    retrievalChanged ||
    groundednessChanged ||
    modelChanged ||
    providerChanged ||
    embeddingProviderChanged
      ? "diverged"
      : "matched";

  const summary = [
    responseChanged ? "Answer text changed between original and replay." : "Answer text remained stable.",
    retrievalChanged ? "Retrieved evidence changed." : "Retrieved evidence remained stable.",
    groundednessChanged ? "Groundedness changed." : "Groundedness remained stable.",
    chunkOrderChanged ? "Chunk order changed." : "Chunk order remained stable.",
    scoresChanged ? "Chunk scores changed." : "Chunk scores remained stable.",
  ];
  if (modelChanged) {
    summary.push("Selected model changed.");
  }
  if (providerChanged || embeddingProviderChanged) {
    summary.push("Provider selection changed.");
  }

  return {
    version: "v1",
    replayId: randomUUID(),
    originalTraceId: input.original.correlation.traceId,
    createdAt: new Date().toISOString(),
    status,
    original: input.original,
    replay: input.replay,
    differences: {
      responseChanged,
      retrievalChanged,
      chunkOrderChanged,
      scoresChanged,
      groundednessChanged,
      modelChanged,
      providerChanged,
      embeddingProviderChanged,
      costDeltaUsd: round((input.replayCostUsd ?? 0) - (input.originalCostUsd ?? 0), 6),
      latencyDeltaMs: round((input.replayLatencyMs ?? 0) - (input.originalLatencyMs ?? 0), 3),
      addedChunkIds,
      removedChunkIds,
      reorderedChunkIds,
      scoreDeltas,
    },
    errors,
    summary,
  };
}

export function assertReplaySnapshotComplete(snapshot: ReplaySnapshot): void {
  if (!snapshot.query.trim()) {
    throw new Error("Replay snapshot is incomplete: missing original query.");
  }

  if (!snapshot.document.documentId.trim()) {
    throw new Error("Replay snapshot is incomplete: missing document identifier.");
  }

  if (snapshot.parameters.topK <= 0) {
    throw new Error("Replay snapshot is incomplete: topK must be a positive integer.");
  }

  if (snapshot.mode === "inline" && !snapshot.document.indexPath) {
    throw new Error(
      "Replay snapshot is incomplete: inline replay requires the original content file path or a persisted index."
    );
  }
}

export function createCorpusDriftReport(input: {
  dataset: string;
  indexId?: string;
  ingestAt?: string;
  previous?: CorpusDriftSnapshot;
  current: CorpusDriftSnapshot;
}): CorpusDriftReport {
  const previousMap = new Map((input.previous?.queries ?? []).map((query) => [query.id, query]));
  const queries = input.current.queries.map((query) => {
    const previous = previousMap.get(query.id);
    const recallPrevious = previous?.recallAtK ?? query.recallAtK;
    const rankPrevious = previous?.rankOfExpected ?? null;
    const difference = round(query.recallAtK - recallPrevious, 3);
    const missingRelevantChunks = query.expectedChunkIds.filter(
      (chunkId) => !query.retrievedChunkIds.includes(chunkId)
    );
    const status: "regressed" | "improved" | "stable" =
      difference < 0 || (rankPrevious !== null && query.rankOfExpected !== null && query.rankOfExpected > rankPrevious)
        ? "regressed"
        : difference > 0 ||
            (rankPrevious !== null && query.rankOfExpected !== null && query.rankOfExpected < rankPrevious)
          ? "improved"
          : "stable";

    const severity: CorpusDriftSeverity = (() => {
      if (status !== "regressed") return "low";
      if (difference <= -0.5) return "critical";
      if (difference <= -0.25) return "high";
      return "medium";
    })();

    return {
      id: query.id,
      question: query.question,
      recallPrevious,
      recallCurrent: query.recallAtK,
      difference,
      rankPrevious,
      rankCurrent: query.rankOfExpected,
      missingRelevantChunks,
      possibleResponsibleDocuments: missingRelevantChunks.map((chunkId) => chunkId.split(":")[0] ?? chunkId),
      relatedIngestion: input.ingestAt,
      severity,
      timestamp: input.current.createdAt,
      status,
    };
  });

  const regressions = queries.filter((query) => query.status === "regressed").length;
  const improvements = queries.filter((query) => query.status === "improved").length;

  const degradedQueries = queries.filter((q) => q.status === "regressed").map((q) => q.id);
  const improvedQueries = queries.filter((q) => q.status === "improved").map((q) => q.id);
  const affectedQueries = [...degradedQueries, ...improvedQueries];

  const recommendations: string[] = [];
  if (regressions > 0) {
    recommendations.push(
      `Review ${regressions} regressed ${regressions === 1 ? "query" : "queries"} and identify recently ingested documents that may interfere with retrieval.`
    );
    const criticalCount = queries.filter((q) => q.severity === "critical").length;
    if (criticalCount > 0) {
      recommendations.push(
        `${criticalCount} critical regression${criticalCount > 1 ? "s" : ""} detected — consider blocking the ingestion or rolling back the index.`
      );
    }
    const missingTotal = queries.reduce((sum, q) => sum + q.missingRelevantChunks.length, 0);
    if (missingTotal > 0) {
      recommendations.push(
        `${missingTotal} expected chunk${missingTotal > 1 ? "s are" : " is"} no longer surfaced — verify chunking and embedding pipeline integrity.`
      );
    }
  }
  if (improvements > 0) {
    recommendations.push(
      `${improvements} ${improvements === 1 ? "query" : "queries"} improved — consider promoting the current index as the new baseline.`
    );
  }
  if (regressions === 0 && improvements === 0) {
    recommendations.push("No recall changes detected. Index is stable relative to the baseline.");
  }

  const baselineId = input.previous
    ? createHash("sha256").update(input.previous.createdAt + input.previous.dataset).digest("hex").slice(0, 16)
    : "no-baseline";

  return {
    version: "v1",
    driftReportId: randomUUID(),
    baselineId,
    currentRunId: randomUUID(),
    indexId: input.indexId ?? input.dataset,
    createdAt: new Date().toISOString(),
    dataset: input.dataset,
    baselineCreatedAt: input.previous?.createdAt,
    currentCreatedAt: input.current.createdAt,
    summary: {
      degraded: regressions > 0,
      queriesEvaluated: queries.length,
      regressions,
      improvements,
      missingRelevantChunks: queries.reduce((sum, query) => sum + query.missingRelevantChunks.length, 0),
    },
    affectedQueries,
    degradedQueries,
    improvedQueries,
    recommendations,
    queries,
  };
}

export function createPromptPolicyDiffReport(input: {
  dataset: string;
  runs: PromptPolicyVariantRun[];
}): PromptPolicyDiffReport {
  if (input.runs.length === 0) {
    return {
      version: "v1",
      createdAt: new Date().toISOString(),
      dataset: input.dataset,
      comparedVariants: [],
      baselineVariant: "n/a",
      candidateVariant: "n/a",
      winner: "n/a",
      recommendation: "manual_review",
      regressions: [],
      improvements: [],
      metricsComparison: [],
      relevantDifferences: [],
      affectedQueries: [],
    };
  }

  const ranked = [...input.runs].sort((left, right) => right.metrics.avgQuality - left.metrics.avgQuality);
  const winner = ranked[0];
  const baseline = input.runs[0] ?? ranked[0];
  const candidate = ranked.find((run) => run.variant !== baseline?.variant) ?? baseline;
  const regressions: string[] = [];
  const improvements: string[] = [];

  const groundednessDelta = (candidate.metrics.avgGroundedness ?? 0) - (baseline.metrics.avgGroundedness ?? 0);
  const recallDelta = candidate.metrics.avgRecall - baseline.metrics.avgRecall;
  const latencyDelta = (candidate.metrics.avgLatencyMs ?? 0) - (baseline.metrics.avgLatencyMs ?? 0);
  const costDelta = (candidate.metrics.avgCostUsd ?? 0) - (baseline.metrics.avgCostUsd ?? 0);
  const refusalDelta = (candidate.metrics.refusalRate ?? 0) - (baseline.metrics.refusalRate ?? 0);
  const qualityDelta = candidate.metrics.avgQuality - baseline.metrics.avgQuality;

  if (groundednessDelta < -0.02) {
    regressions.push("groundedness decreased in candidate variant.");
  } else if (groundednessDelta > 0.02) {
    improvements.push("groundedness improved in candidate variant.");
  }

  if (recallDelta < -0.01) {
    regressions.push("recall decreased in candidate variant.");
  } else if (recallDelta > 0.01) {
    improvements.push("recall improved in candidate variant.");
  }

  if (latencyDelta > Math.max(1, (baseline.metrics.avgLatencyMs ?? 0) * 0.05)) {
    regressions.push("latency increased in candidate variant.");
  } else if (latencyDelta < -Math.max(1, (baseline.metrics.avgLatencyMs ?? 0) * 0.05)) {
    improvements.push("latency improved in candidate variant.");
  }

  if (costDelta > Math.max(0.000001, (baseline.metrics.avgCostUsd ?? 0) * 0.1)) {
    regressions.push("cost increased in candidate variant.");
  } else if (costDelta < -Math.max(0.000001, (baseline.metrics.avgCostUsd ?? 0) * 0.1)) {
    improvements.push("cost improved in candidate variant.");
  }

  if (refusalDelta > 0.01) {
    regressions.push("refusal rate increased in candidate variant.");
  } else if (refusalDelta < -0.01) {
    improvements.push("refusal rate improved in candidate variant.");
  }

  if (qualityDelta > 0.02) {
    improvements.push("answer quality improved in candidate variant.");
  }

  const affectedQueries = (candidate.perQuery ?? [])
    .map((query) => {
      const baselineQuery = baseline.perQuery.find((item) => item.id === query.id);
      const responseChanged =
        normalizeWhitespace(query.answer) !== normalizeWhitespace(baselineQuery?.answer ?? "");
      const regressionReasons: string[] = [];
      if ((query.scores.groundedness ?? 0) < (baselineQuery?.scores.groundedness ?? 0) - 0.02) {
        regressionReasons.push("groundedness_drop");
      }
      if (query.scores.recall < (baselineQuery?.scores.recall ?? 0) - 0.01) {
        regressionReasons.push("recall_drop");
      }
      if ((query.costUsd ?? 0) > (baselineQuery?.costUsd ?? 0)) {
        regressionReasons.push("cost_increase");
      }
      if ((query.latencyMs ?? 0) > (baselineQuery?.latencyMs ?? 0) + 1) {
        regressionReasons.push("latency_increase");
      }
      if ((query.refused ?? false) && !(baselineQuery?.refused ?? false)) {
        regressionReasons.push("new_refusal");
      }
      return {
        queryId: query.id,
        question: query.question,
        responseChanged,
        regressionReasons,
        baselineVariant: baseline.variant,
        candidateVariant: candidate.variant,
      };
    })
    .filter((query) => query.responseChanged || query.regressionReasons.length > 0);

  const responseChangeRate = round(
    affectedQueries.filter((query) => query.responseChanged).length / Math.max(1, candidate.perQuery.length),
    4
  );
  const clearGain = qualityDelta > 0.02 || groundednessDelta > 0.02 || recallDelta > 0.02;
  if (responseChangeRate > 0.4 && !clearGain) {
    regressions.push("responses changed substantially without clear quality gains.");
  }

  const recommendation: PromptPolicyDiffReport["recommendation"] =
    regressions.length > 0
      ? "block"
      : winner?.variant === candidate.variant && improvements.length > 0
        ? "promote"
        : "manual_review";

  const comparedRun = winner?.variant === baseline?.variant ? candidate : baseline;
  const relevantDifferences = (winner?.perQuery ?? []).map((query) => {
    const comparedQuery = comparedRun?.perQuery.find((item) => item.id === query.id);
    return {
      queryId: query.id,
      question: query.question,
      changed: normalizeWhitespace(query.answer) !== normalizeWhitespace(comparedQuery?.answer ?? ""),
      winningVariant: winner?.variant ?? "n/a",
      comparedAgainst: comparedRun?.variant ?? "n/a",
    };
  });

  return {
    version: "v1",
    createdAt: new Date().toISOString(),
    dataset: input.dataset,
    comparedVariants: input.runs.map((run) => run.variant),
    baselineVariant: baseline.variant,
    candidateVariant: candidate.variant,
    winner: winner?.variant ?? "n/a",
    recommendation,
    regressions,
    improvements,
    metricsComparison: input.runs.map((run) => ({
      variant: run.variant,
      avgFaithfulness: round(run.metrics.avgFaithfulness, 4),
      avgRelevance: round(run.metrics.avgRelevance, 4),
      avgQuality: round(run.metrics.avgQuality, 4),
      avgGroundedness: round(run.metrics.avgGroundedness ?? 0, 4),
      avgConfidenceScore: round(run.metrics.avgConfidenceScore ?? 0, 4),
      avgRecall: round(run.metrics.avgRecall, 4),
      avgLatencyMs: round(run.metrics.avgLatencyMs ?? 0, 4),
      avgCostUsd: round(run.metrics.avgCostUsd ?? 0, 6),
      refusalRate: round(run.metrics.refusalRate ?? 0, 4),
      stability: round(run.metrics.stability ?? 0, 4),
    })),
    relevantDifferences,
    affectedQueries,
  };
}

export async function loadReliabilityReportSummaries(
  repoRoot = process.cwd()
): Promise<ReliabilityReportSummaries> {
  const drift = await tryReadJson<CorpusDriftReport>(
    resolve(repoRoot, "datasets/golden/baselines/retrieval-drift-report.json")
  );
  const diff = await tryReadJson<PromptPolicyDiffReport>(
    resolve(repoRoot, "datasets/golden/baselines/prompt-policy-diff-report.json")
  );

  return {
    drift: drift
      ? {
          degraded: drift.summary.degraded,
          regressions: drift.summary.regressions,
          affectedQueries: drift.queries.filter((query) => query.status === "regressed").map((query) => query.id),
          generatedAt: drift.createdAt,
        }
      : undefined,
    diff: diff
      ? {
          winner: diff.winner,
          regressions: diff.regressions.length,
          improvements: diff.improvements.length,
          generatedAt: diff.createdAt,
        }
      : undefined,
  };
}

function detectConflictingChunks(results: RetrievalEvidenceChunk[]): string[] {
  const conflictingChunkIds = new Set<string>();

  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    const left = results[leftIndex];
    if (!left) {
      continue;
    }
    const leftText = normalizeWhitespace(left.text.toLowerCase());
    const leftHasNegation = hasNegation(leftText);
    const leftKeywords = extractConflictKeywords(leftText);

    for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
      const right = results[rightIndex];
      if (!right) {
        continue;
      }
      const rightText = normalizeWhitespace(right.text.toLowerCase());
      const rightHasNegation = hasNegation(rightText);
      if (leftHasNegation === rightHasNegation) {
        continue;
      }

      const rightKeywords = extractConflictKeywords(rightText);
      const sharedKeywords = [...leftKeywords].filter((token) => rightKeywords.has(token));
      if (sharedKeywords.length >= 3) {
        conflictingChunkIds.add(left.chunkId);
        conflictingChunkIds.add(right.chunkId);
      }
    }
  }

  return [...conflictingChunkIds];
}

function averageLexicalOverlap(query: string, chunks: RetrievalEvidenceChunk[]): number {
  if (chunks.length === 0) {
    return 0;
  }
  const total = chunks.reduce((sum, chunk) => sum + tokenOverlapRatio(query, chunk.text.toLowerCase()), 0);
  return total / chunks.length;
}

function tokenOverlapRatio(query: string, text: string): number {
  const queryTokens = new Set((query.match(/[a-z0-9]{3,}/g) ?? []).filter(Boolean));
  if (queryTokens.size === 0) {
    return 0;
  }
  const textTokens = new Set((text.match(/[a-z0-9]{3,}/g) ?? []).filter(Boolean));
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / queryTokens.size;
}

function buildEvidenceGaps(input: RetrievalFailureAnalyzerInput): string[] {
  const gaps: string[] = [];
  if (input.diagnostics.resultCount === 0) {
    gaps.push("no_retrieved_chunks");
  }
  if (input.diagnostics.citationCoverage < 0.5) {
    gaps.push("low_citation_coverage");
  }
  if (input.diagnostics.evidenceCoverage < 0.5) {
    gaps.push("low_evidence_coverage");
  }
  if (input.diagnostics.sourceDiversity <= 1 && input.diagnostics.resultCount > 1) {
    gaps.push("low_source_diversity");
  }
  if (input.diagnostics.conflictCount > 0) {
    gaps.push("conflicting_evidence");
  }
  return gaps;
}

function buildAutoTuningRecommendations(
  input: RetrievalFailureAnalyzerInput,
  failureCase: RetrievalFailureCase
): AutoTuningRecommendation[] {
  const recommendations: AutoTuningRecommendation[] = [];
  if (failureCase.failureReason === "insufficient_overlap") {
    recommendations.push({
      parameter: "overlapTokens",
      currentValue: input.overlapConfig?.overlapTokens,
      recommendedValue: Math.max(30, (input.overlapConfig?.overlapTokens ?? 20) + 10),
      rationale: "Increase overlap to reduce boundary fragmentation and context loss.",
    });
  }
  if (failureCase.failureReason === "chunk_too_small") {
    recommendations.push({
      parameter: "chunkSize",
      currentValue: input.overlapConfig?.chunkSize,
      recommendedValue: Math.max(300, (input.overlapConfig?.chunkSize ?? 180) + 120),
      rationale: "Increase chunk size to keep cohesive evidence in a single retrieval unit.",
    });
  }
  if (failureCase.failureReason === "low_recall" || failureCase.failureReason === "dense_retrieval_failure") {
    recommendations.push({
      parameter: "topK",
      currentValue: input.diagnostics.returnedCount,
      recommendedValue: Math.max(10, input.diagnostics.returnedCount + 5),
      rationale: "Increase topK to widen the candidate pool and improve recall.",
    });
  }
  return recommendations;
}

function normalizeScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasNegation(value: string): boolean {
  return /\b(no|not|never|without|none|cannot|can't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't)\b/.test(
    value
  );
}

function extractConflictKeywords(value: string): Set<string> {
  const stopwords = new Set([
    "that",
    "this",
    "with",
    "from",
    "into",
    "your",
    "have",
    "will",
    "were",
    "they",
    "them",
    "their",
    "about",
    "what",
    "when",
    "where",
    "which",
    "only",
    "does",
    "doing",
    "done",
    "using",
    "used",
  ]);
  const tokens = value.match(/[a-z0-9]{4,}/g) ?? [];
  return new Set(tokens.filter((token) => !stopwords.has(token)));
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

const defaultConfidenceCalibrationService = new ConfidenceCalibrationService();
const defaultConfidenceCalibrationEngine = new ConfidenceCalibrationEngine();

async function tryReadJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return undefined;
  }
}
