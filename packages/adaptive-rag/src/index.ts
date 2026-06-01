export type AdaptiveRetrievalMode =
  | "DIRECT_LLM"
  | "STANDARD_RAG"
  | "HYBRID_RAG"
  | "GRAPH_RAG"
  | "HYDE_RAG"
  | "FULL_PIPELINE";

export type AdaptiveUserMode = "FAST" | "BALANCED" | "DEEP";

export type AdaptiveQueryCategory =
  | "factual"
  | "simple-factual"
  | "conversational"
  | "memory-based"
  | "memory-dependent"
  | "analytical"
  | "comparative"
  | "multi-hop"
  | "summarization"
  | "exploratory"
  | "ambiguous"
  | "high-risk"
  | "low-confidence"
  | "citation-heavy"
  | "relational"
  | "retrieval-heavy"
  | "low-risk";

export type RetrievalStrategyName =
  | "DenseOnlyStrategy"
  | "HybridStrategy"
  | "HybridRerankStrategy"
  | "MultiRetrievalStrategy"
  | "HyDEStrategy"
  | "GraphEnhancedStrategy"
  | "HierarchicalStrategy"
  | "HighValidationStrategy";

export interface AdaptiveQueryClassification {
  categories: AdaptiveQueryCategory[];
  primaryIntent:
    | "simple-factual"
    | "conversational"
    | "analytical"
    | "comparative"
    | "multi-hop"
    | "summarization"
    | "exploratory"
    | "ambiguous"
    | "high-risk"
    | "memory-dependent";
  expectedAnswerType:
    | "fact"
    | "conversation"
    | "analysis"
    | "comparison"
    | "summary"
    | "exploration"
    | "grounded-answer"
    | "memory-recall";
  complexity: "low" | "medium" | "high";
  complexityScore: number;
  ambiguity: number;
  factualityRisk: number;
  hallucinationRisk: number;
  confidence: number;
}

export interface AdaptiveRetrievalPlannerInput {
  query: string;
  queryConfidence?: number;
  previousCacheHits?: number;
  semanticCacheHit?: boolean;
  sessionMemoryHits?: number;
  previousRetrievalEffectiveness?: number;
  contextLength?: number;
  contextSizeEstimate?: number;
  retrievalCostEstimate?: number;
  latencyBudget?: number;
  tokenBudget?: number;
  costBudget?: number;
  graphAvailable?: boolean;
  hydeAvailable?: boolean;
  raptorAvailable?: boolean;
  requireGrounding?: boolean;
  userMode?: AdaptiveUserMode;
  confidenceThreshold?: number;
}

export interface AdaptiveThresholds {
  ambiguityForExpansion: number;
  highComplexity: number;
  highRisk: number;
  lowConfidence: number;
  sufficientRetrievalConfidence: number;
  sufficientConsensus: number;
}

export interface RiskProfile {
  name: string;
  forceMultiRetrieval: boolean;
  forceCitationEnforcement: boolean;
  forceSelfCheck: boolean;
  confidenceThreshold: number;
}

export interface UserModeConfig {
  topKMultiplier: number;
  rerankByDefault: boolean;
  latencyProfile: "fast" | "balanced" | "deep";
  costProfile: "low" | "medium" | "high";
}

export interface RetrievalPolicyConfig {
  thresholds: AdaptiveThresholds;
  riskProfiles: {
    balanced: RiskProfile;
    highRisk: RiskProfile;
  };
  userModes: Record<AdaptiveUserMode, UserModeConfig>;
  defaultUserMode: AdaptiveUserMode;
}

export interface QueryRiskAssessment {
  ambiguityScore: number;
  complexityScore: number;
  factualityRisk: number;
  hallucinationRisk: number;
  overallRisk: number;
  highRisk: boolean;
  citationRequired: boolean;
  reasons: string[];
}

export interface QueryExpansionPlan {
  enabled: boolean;
  strategies: Array<"keyword" | "semantic" | "multi-query" | "hyde" | "decomposition">;
  queries: string[];
  reason?: string;
}

export interface RetrievalValidationPlan {
  citationEnforced: boolean;
  selfCheckEnabled: boolean;
  critiqueEnabled: boolean;
  consensusRequired: boolean;
  validationSteps: string[];
}

export interface RetrievalExecutionPlan {
  strategy: RetrievalStrategyName;
  retrievalMode: "dense" | "hybrid";
  topK: number;
  candidateTopK: number;
  rerankEnabled: boolean;
  rerankDepth: number;
  queryExpansion: QueryExpansionPlan;
  graphTraversal: boolean;
  multiRetrieval: boolean;
  validation: RetrievalValidationPlan;
  latencyProfile: "fast" | "balanced" | "deep";
  costProfile: "low" | "medium" | "high";
}

export interface RetrievalPolicy {
  name: string;
  userMode: AdaptiveUserMode;
  riskProfile: RiskProfile["name"];
  confidenceThreshold: number;
  explanation: string[];
}

export interface RetrievalDecision {
  policy: RetrievalPolicy;
  classification: AdaptiveQueryClassification;
  riskAssessment: QueryRiskAssessment;
  executionPlan: RetrievalExecutionPlan;
  reasoning: string[];
  estimatedCost: "low" | "medium" | "high";
  estimatedLatency: "fast" | "balanced" | "deep";
  confidence: number;
}

export interface RetrievalSelfEvaluation {
  retrievalConfidence: number;
  contextCoverage: number;
  evidenceQuality: number;
  sourceDiversity: number;
  consensusScore: number;
  sufficient: boolean;
  recommendedAction:
    | "accept"
    | "expand-retrieval"
    | "ask-clarification"
    | "tighten-validation"
    | "retry-with-multi-retrieval";
  missingEvidenceLikelihood: number;
}

export interface RetrievalSignalSummary {
  denseHits: number;
  expansionHits: number;
  graphHits: number;
  hydeHits: number;
  raptorHits: number;
  finalHits: number;
}

export type RetrievalDecompositionType =
  | "temporal"
  | "comparative"
  | "multi-hop"
  | "dependency-based"
  | "causal"
  | "analytical";

export type RetrievalTaskType =
  | "retrieval"
  | "synthesis"
  | "validation"
  | "rerank"
  | "graph-traversal"
  | "critique"
  | "merge";

export type RetrievalDependencyRelation =
  | "requires"
  | "supports"
  | "refines"
  | "validates"
  | "synthesizes";

export interface EvidenceGoal {
  goalId: string;
  description: string;
  priority: "primary" | "supporting";
  target?: string;
}

export interface SubQuery {
  subQueryId: string;
  text: string;
  type: RetrievalDecompositionType | "supporting";
  purpose: string;
  evidenceGoalIds: string[];
  dependsOn: string[];
  stage: "broad" | "focused" | "validation";
  useGraphRag: boolean;
  useHyDE: boolean;
  useRAPTOR: boolean;
  useMemory: boolean;
}

export interface RetrievalTask {
  taskId: string;
  title: string;
  type: RetrievalTaskType;
  subQueryId?: string;
  evidenceGoalIds: string[];
  dependencyIds: string[];
  executionMode: "parallel" | "sequential";
}

export interface RetrievalDependency {
  dependencyId: string;
  fromTaskId: string;
  toTaskId: string;
  relation: RetrievalDependencyRelation;
}

export interface RetrievalStep {
  stepId: string;
  title: string;
  stage: "decomposition" | "retrieval" | "synthesis" | "validation";
  taskIds: string[];
  executionMode: "parallel" | "sequential";
  stopCondition: string;
}

export interface RetrievalNode {
  nodeId: string;
  taskId: string;
  nodeType: RetrievalTaskType;
}

export interface RetrievalEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  relation: RetrievalDependencyRelation;
}

export type EvidenceDependency = RetrievalDependency;

export interface RetrievalExecutionGraph {
  nodes: RetrievalNode[];
  edges: RetrievalEdge[];
  parallelTaskGroups: string[][];
}

export interface RetrievalContextState {
  entities: string[];
  temporalAnchors: string[];
  comparisonTargets: string[];
  missingEvidence: string[];
}

export interface RetrievalWorkingMemory {
  executedQueries: string[];
  retrievedChunkIds: string[];
  missingEvidence: string[];
  discoveredEntities: string[];
  retrievalFailures: string[];
}

export interface EvidenceMemory {
  chunkIds: string[];
  coverageByGoal: Record<string, number>;
}

export interface QueryContextAccumulator {
  normalizedTokens: string[];
  entities: string[];
  temporalAnchors: string[];
}

export interface RetrievalSessionState {
  planId: string;
  workingMemory: RetrievalWorkingMemory;
  context: QueryContextAccumulator;
  evidenceMemory: EvidenceMemory;
}

export interface PlanExecutionState {
  status: "planned" | "executed";
  completedTaskIds: string[];
  pendingTaskIds: string[];
  expandedQueries: string[];
  executedQueries: string[];
  evidenceCoverage: number;
  missingEvidence: string[];
}

export interface RetrievalPlan {
  planId: string;
  planningEnabled: boolean;
  requiresClarification: boolean;
  decompositionTypes: RetrievalDecompositionType[];
  evidenceGoals: EvidenceGoal[];
  subQueries: SubQuery[];
  tasks: RetrievalTask[];
  steps: RetrievalStep[];
  dependencies: RetrievalDependency[];
  executionGraph: RetrievalExecutionGraph;
  contextState: RetrievalContextState;
  executionState: PlanExecutionState;
  workingMemory: RetrievalWorkingMemory;
  sessionState: RetrievalSessionState;
}

export interface RetrievalEvidenceRecord {
  evidenceId: string;
  chunkId: string;
  subQueryId: string;
  taskId: string;
  text: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface EvidenceCluster {
  clusterId: string;
  label: string;
  theme: "temporal" | "architectural" | "entity" | "query-stage";
  chunkIds: string[];
  subQueryIds: string[];
  evidenceCount: number;
}

export interface EvidenceConflict {
  conflictType: "missing-evidence" | "coverage-gap" | "weak-consensus";
  description: string;
  affectedGoalIds: string[];
  severity: "low" | "medium" | "high";
}

export interface EvidenceSynthesisResult {
  clusters: EvidenceCluster[];
  coverage: number;
  consensusScore: number;
  missingEvidence: string[];
  conflicts: EvidenceConflict[];
}

export interface RetrievalStepTrace {
  stepId: string;
  title: string;
  executionMode: "parallel" | "sequential";
  taskIds: string[];
  executedQueries: string[];
  resultCount: number;
}

export interface RetrievalPlanTrace {
  plannerDecisions: string[];
  retrievalStrategy: "direct" | "staged-hybrid" | "hierarchical" | "agentic";
  createdSubqueries: number;
  decompositionTypes: RetrievalDecompositionType[];
  executionOrder: string[];
  executedSteps: RetrievalStepTrace[];
  coverage: number;
  missingEvidence: string[];
  evidenceSynthesis: EvidenceSynthesisResult;
  refinementQueries: string[];
}

export interface AdaptiveRetrievalPlan {
  selectedMode: AdaptiveRetrievalMode;
  executionMode: AdaptiveRetrievalMode;
  shouldRetrieve: boolean;
  estimatedCost: "low" | "medium" | "high";
  estimatedLatency: "fast" | "balanced" | "deep";
  confidence: number;
  reasoning: string[];
  fallbackReason?: string;
  classification: AdaptiveQueryClassification;
  policy: RetrievalPolicy;
  riskAssessment: QueryRiskAssessment;
  executionPlan: RetrievalExecutionPlan;
  retrievalPlan: RetrievalPlan;
  planTrace: RetrievalPlanTrace;
  decision: RetrievalDecision;
}

const CONVERSATIONAL_PATTERN = /\b(hello|hi|hey|thanks|thank you|good morning|good afternoon)\b/i;
const MEMORY_PATTERN = /\b(previous|earlier|last time|before|remember|we discussed|above)\b/i;
const ANALYTICAL_PATTERN = /\b(compare|trade.?off|analy[sz]e|pros and cons|impact|difference|evaluate)\b/i;
const COMPARATIVE_PATTERN = /\b(compare|versus|vs\.?|difference between|better than)\b/i;
const SUMMARIZATION_PATTERN = /\b(summarize|summary|overview|tldr|recap)\b/i;
const RELATIONAL_PATTERN = /\b(relat|depend|connected|link|graph|path|why does|how does)\b/i;
const FACTUAL_PATTERN = /\b(what|who|where|when|which|define|explain)\b/i;
const MULTI_HOP_PATTERN = /\b(and then|how.*affect|because|chain|steps|workflow|across|between)\b/i;
const EXPLORATORY_PATTERN = /\b(ideas|brainstorm|explore|options|possibilities|investigate)\b/i;
const CITATION_PATTERN = /\b(cite|citation|source|evidence|proof|grounded)\b/i;
const HIGH_RISK_PATTERN =
  /\b(medical|clinical|legal|legally|law|financial|security|safety|compliance|compliant|regulation|production|delete|drop|destroy|critical|risk|risks)\b/i;
const AMBIGUOUS_REFERENCE_PATTERN = /\b(it|this|that|they|them|these|those|isso)\b/i;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "which",
  "why",
]);

const DEFAULT_POLICY_CONFIG: RetrievalPolicyConfig = {
  thresholds: {
    ambiguityForExpansion: 0.45,
    highComplexity: 0.66,
    highRisk: 0.68,
    lowConfidence: 0.62,
    sufficientRetrievalConfidence: 0.7,
    sufficientConsensus: 0.55,
  },
  riskProfiles: {
    balanced: {
      name: "balanced",
      forceMultiRetrieval: false,
      forceCitationEnforcement: false,
      forceSelfCheck: false,
      confidenceThreshold: 0.62,
    },
    highRisk: {
      name: "high-risk",
      forceMultiRetrieval: true,
      forceCitationEnforcement: true,
      forceSelfCheck: true,
      confidenceThreshold: 0.82,
    },
  },
  userModes: {
    FAST: {
      topKMultiplier: 0.8,
      rerankByDefault: false,
      latencyProfile: "fast",
      costProfile: "low",
    },
    BALANCED: {
      topKMultiplier: 1,
      rerankByDefault: true,
      latencyProfile: "balanced",
      costProfile: "medium",
    },
    DEEP: {
      topKMultiplier: 1.3,
      rerankByDefault: true,
      latencyProfile: "deep",
      costProfile: "high",
    },
  },
  defaultUserMode: "BALANCED",
};

export class RetrievalComplexityAnalyzer {
  analyze(query: string, categories: Iterable<AdaptiveQueryCategory>): {
    complexity: AdaptiveQueryClassification["complexity"];
    complexityScore: number;
  } {
    const tokenCount = tokenize(query).length;
    const categorySet = new Set(categories);
    const score = clamp01(
      tokenCount / 16 +
        (categorySet.has("analytical") ? 0.22 : 0) +
        (categorySet.has("comparative") ? 0.15 : 0) +
        (categorySet.has("multi-hop") ? 0.24 : 0) +
        (categorySet.has("summarization") ? 0.18 : 0) +
        (categorySet.has("high-risk") ? 0.15 : 0)
    );

    return {
      complexity:
        score >= 0.66 ? "high" : score >= 0.35 || categorySet.has("relational") ? "medium" : "low",
      complexityScore: roundScore(score),
    };
  }
}

export class QueryRiskAssessor {
  constructor(private readonly config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG) {}

  assess(classification: AdaptiveQueryClassification): QueryRiskAssessment {
    const reasons: string[] = [];
    const overallRisk = clamp01(
      classification.factualityRisk * 0.45 +
        classification.hallucinationRisk * 0.35 +
        classification.complexityScore * 0.2
    );

    if (classification.categories.includes("high-risk")) {
      reasons.push("high-risk-domain");
    }
    if (classification.categories.includes("citation-heavy")) {
      reasons.push("citation-required");
    }
    if (classification.categories.includes("ambiguous")) {
      reasons.push("ambiguous-query");
    }
    if (classification.categories.includes("multi-hop")) {
      reasons.push("multi-hop-reasoning");
    }

    return {
      ambiguityScore: classification.ambiguity,
      complexityScore: classification.complexityScore,
      factualityRisk: classification.factualityRisk,
      hallucinationRisk: classification.hallucinationRisk,
      overallRisk: roundScore(overallRisk),
      highRisk:
        classification.categories.includes("high-risk") ||
        overallRisk >= this.config.thresholds.highRisk,
      citationRequired: classification.categories.includes("citation-heavy"),
      reasons,
    };
  }
}

export class RetrievalStrategySelector {
  constructor(private readonly config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG) {}

  select(
    classification: AdaptiveQueryClassification,
    risk: QueryRiskAssessment,
    input: AdaptiveRetrievalPlannerInput
  ): RetrievalStrategyName {
    const userMode = input.userMode ?? this.config.defaultUserMode;

    if (risk.highRisk) {
      return "HighValidationStrategy";
    }

    if (userMode === "FAST" && classification.primaryIntent === "simple-factual") {
      return "DenseOnlyStrategy";
    }

    if (classification.primaryIntent === "simple-factual") {
      return "HybridStrategy";
    }

    if (
      (classification.categories.includes("multi-hop") ||
        classification.categories.includes("citation-heavy")) &&
      (input.graphAvailable || input.hydeAvailable || input.raptorAvailable)
    ) {
      return "MultiRetrievalStrategy";
    }

    if (classification.categories.includes("summarization") && input.raptorAvailable) {
      return "HierarchicalStrategy";
    }

    if (classification.categories.includes("relational") && input.graphAvailable) {
      return "GraphEnhancedStrategy";
    }

    if (
      (classification.categories.includes("ambiguous") ||
        classification.categories.includes("low-confidence")) &&
      input.hydeAvailable
    ) {
      return "HyDEStrategy";
    }

    if (
      classification.categories.includes("analytical") ||
      classification.categories.includes("comparative")
    ) {
      return "HybridRerankStrategy";
    }

    if (classification.categories.includes("retrieval-heavy")) {
      return "HybridStrategy";
    }

    return "DenseOnlyStrategy";
  }
}

export class RetrievalPlanner {
  constructor(private readonly config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG) {}

  createExecutionPlan(
    strategy: RetrievalStrategyName,
    classification: AdaptiveQueryClassification,
    risk: QueryRiskAssessment,
    input: AdaptiveRetrievalPlannerInput
  ): RetrievalExecutionPlan {
    const userMode = input.userMode ?? this.config.defaultUserMode;
    const userModeConfig = this.config.userModes[userMode];
    const topK = resolveAdaptiveTopK(strategy, classification, risk, input, userModeConfig);
    const rerankEnabled = resolveRerankEnabled(strategy, classification, risk, userModeConfig);
    const queryExpansion = buildQueryExpansionPlan(
      input.query,
      classification,
      risk,
      input,
      this.config.thresholds.ambiguityForExpansion
    );
    const validation = buildValidationPlan(strategy, classification, risk, input, this.config);

    return {
      strategy,
      retrievalMode:
        strategy === "DenseOnlyStrategy" && userMode === "FAST" ? "dense" : "hybrid",
      topK,
      candidateTopK: Math.max(
        topK + 2,
        rerankEnabled ? topK * 3 : topK * 2,
        queryExpansion.enabled ? topK * 2 : 0
      ),
      rerankEnabled,
      rerankDepth: rerankEnabled ? Math.max(topK, Math.ceil(topK * 1.5)) : topK,
      queryExpansion,
      graphTraversal:
        input.graphAvailable === true &&
        (strategy === "GraphEnhancedStrategy" ||
          strategy === "MultiRetrievalStrategy" ||
          strategy === "HighValidationStrategy"),
      multiRetrieval:
        strategy === "MultiRetrievalStrategy" || strategy === "HighValidationStrategy",
      validation,
      latencyProfile: userModeConfig.latencyProfile,
      costProfile:
        strategy === "HighValidationStrategy"
          ? "high"
          : strategy === "MultiRetrievalStrategy" ||
              strategy === "HybridRerankStrategy" ||
              strategy === "HierarchicalStrategy"
            ? "medium"
            : userModeConfig.costProfile,
    };
  }

  createRetrievalPlan(
    classification: AdaptiveQueryClassification,
    executionPlan: RetrievalExecutionPlan,
    input: AdaptiveRetrievalPlannerInput
  ): RetrievalPlan {
    const planId = buildPlanId(input.query);
    const decompositionTypes = detectDecompositionTypes(input.query, classification);
    const planningEnabled = shouldEnablePlanning(classification, decompositionTypes);
    const contextState = buildContextState(input.query);
    const evidenceGoals = buildEvidenceGoals(input.query, contextState, decompositionTypes);
    const subQueries = buildSubQueries(
      input.query,
      classification,
      executionPlan,
      contextState,
      evidenceGoals,
      decompositionTypes,
      input
    );
    const taskBundle = buildRetrievalTasks(subQueries, evidenceGoals, executionPlan);
    const workingMemory: RetrievalWorkingMemory = {
      executedQueries: [],
      retrievedChunkIds: [],
      missingEvidence: evidenceGoals.map((goal) => goal.description),
      discoveredEntities: [],
      retrievalFailures: [],
    };

    return {
      planId,
      planningEnabled,
      requiresClarification:
        classification.categories.includes("ambiguous") && contextState.temporalAnchors.length === 0,
      decompositionTypes,
      evidenceGoals,
      subQueries,
      tasks: taskBundle.tasks,
      steps: taskBundle.steps,
      dependencies: taskBundle.dependencies,
      executionGraph: taskBundle.executionGraph,
      contextState,
      executionState: {
        status: "planned",
        completedTaskIds: [],
        pendingTaskIds: taskBundle.tasks.map((task) => task.taskId),
        expandedQueries: subQueries
          .map((subQuery) => subQuery.text)
          .filter((text) => text !== input.query),
        executedQueries: [],
        evidenceCoverage: 0,
        missingEvidence: workingMemory.missingEvidence,
      },
      workingMemory,
      sessionState: {
        planId,
        workingMemory,
        context: {
          normalizedTokens: tokenize(input.query),
          entities: contextState.entities,
          temporalAnchors: contextState.temporalAnchors,
        },
        evidenceMemory: {
          chunkIds: [],
          coverageByGoal: Object.fromEntries(evidenceGoals.map((goal) => [goal.goalId, 0])),
        },
      },
    };
  }
}

export class EvidenceAggregator {
  aggregate(
    plan: RetrievalPlan,
    evidence: RetrievalEvidenceRecord[]
  ): Pick<EvidenceSynthesisResult, "clusters" | "coverage" | "missingEvidence"> {
    const subQueriesById = new Map(plan.subQueries.map((subQuery) => [subQuery.subQueryId, subQuery]));
    const coverageByGoal = new Map(plan.evidenceGoals.map((goal) => [goal.goalId, 0]));

    for (const record of evidence) {
      const subQuery = subQueriesById.get(record.subQueryId);
      for (const goalId of subQuery?.evidenceGoalIds ?? []) {
        coverageByGoal.set(goalId, (coverageByGoal.get(goalId) ?? 0) + 1);
      }
    }

    const clusters = plan.subQueries
      .map((subQuery) => {
        const relatedEvidence = evidence.filter((record) => record.subQueryId === subQuery.subQueryId);
        if (relatedEvidence.length === 0) {
          return undefined;
        }

        return {
          clusterId: `cluster:${subQuery.subQueryId}`,
          label: subQuery.purpose,
          theme: resolveClusterTheme(subQuery.type),
          chunkIds: [...new Set(relatedEvidence.map((record) => record.chunkId))],
          subQueryIds: [subQuery.subQueryId],
          evidenceCount: relatedEvidence.length,
        } satisfies EvidenceCluster;
      })
      .filter((cluster): cluster is EvidenceCluster => Boolean(cluster));

    const coveredGoals = [...coverageByGoal.values()].filter((count) => count > 0).length;
    const coverage =
      coverageByGoal.size === 0 ? 1 : roundScore(coveredGoals / coverageByGoal.size);
    const missingEvidence = plan.evidenceGoals
      .filter((goal) => (coverageByGoal.get(goal.goalId) ?? 0) === 0)
      .map((goal) => goal.description);

    return {
      clusters,
      coverage,
      missingEvidence,
    };
  }
}

export class RetrievalConsensusEngine {
  score(clusters: EvidenceCluster[], coverage: number): number {
    if (clusters.length === 0) {
      return 0;
    }

    return roundScore(clamp01(coverage * 0.65 + Math.min(clusters.length, 4) / 4 * 0.35));
  }
}

export class EvidenceConflictAnalyzer {
  analyze(
    plan: RetrievalPlan,
    aggregation: Pick<EvidenceSynthesisResult, "coverage" | "missingEvidence" | "clusters">,
    consensusScore: number
  ): EvidenceConflict[] {
    const conflicts: EvidenceConflict[] = [];

    if (aggregation.missingEvidence.length > 0) {
      conflicts.push({
        conflictType: "missing-evidence",
        description: `Missing evidence for ${aggregation.missingEvidence.join(", ")}`,
        affectedGoalIds: plan.evidenceGoals
          .filter((goal) => aggregation.missingEvidence.includes(goal.description))
          .map((goal) => goal.goalId),
        severity: aggregation.coverage < 0.5 ? "high" : "medium",
      });
    }

    if (aggregation.coverage < 0.75) {
      conflicts.push({
        conflictType: "coverage-gap",
        description: "Planner coverage is below the expected threshold for a grounded answer.",
        affectedGoalIds: plan.evidenceGoals.map((goal) => goal.goalId),
        severity: aggregation.coverage < 0.4 ? "high" : "medium",
      });
    }

    if (consensusScore < 0.55 && aggregation.clusters.length > 1) {
      conflicts.push({
        conflictType: "weak-consensus",
        description: "Evidence clusters are too weakly aligned to trust a synthesized answer.",
        affectedGoalIds: plan.evidenceGoals.map((goal) => goal.goalId),
        severity: consensusScore < 0.35 ? "high" : "low",
      });
    }

    return conflicts;
  }
}

export class EvidenceSynthesizer {
  private readonly aggregator = new EvidenceAggregator();
  private readonly consensus = new RetrievalConsensusEngine();
  private readonly conflicts = new EvidenceConflictAnalyzer();

  synthesize(plan: RetrievalPlan, evidence: RetrievalEvidenceRecord[]): EvidenceSynthesisResult {
    const aggregation = this.aggregator.aggregate(plan, evidence);
    const consensusScore = this.consensus.score(aggregation.clusters, aggregation.coverage);

    return {
      clusters: aggregation.clusters,
      coverage: aggregation.coverage,
      consensusScore,
      missingEvidence: aggregation.missingEvidence,
      conflicts: this.conflicts.analyze(plan, aggregation, consensusScore),
    };
  }
}

export class RetrievalCoordinator {
  coordinate(plan: RetrievalPlan): RetrievalStep[] {
    return plan.steps;
  }
}

export class EvidenceResearcher {
  suggest(plan: RetrievalPlan, missingEvidence: string[]): string[] {
    return plan.subQueries
      .filter((subQuery) =>
        subQuery.evidenceGoalIds.some((goalId) =>
          plan.evidenceGoals.some(
            (goal) => goal.goalId === goalId && missingEvidence.includes(goal.description)
          )
        )
      )
      .map((subQuery) => `${subQuery.text} evidence`)
      .slice(0, 3);
  }
}

export class RetrievalCritic {
  critique(trace: RetrievalPlanTrace) {
    return {
      needsMoreEvidence: trace.coverage < 0.75 || trace.evidenceSynthesis.conflicts.length > 0,
      reasons: trace.evidenceSynthesis.conflicts.map((conflict) => conflict.description),
      suggestedQueries: trace.refinementQueries,
    };
  }
}

export class RetrievalSynthesizer {
  private readonly synthesizer = new EvidenceSynthesizer();

  synthesize(plan: RetrievalPlan, evidence: RetrievalEvidenceRecord[]): EvidenceSynthesisResult {
    return this.synthesizer.synthesize(plan, evidence);
  }
}

export class RetrievalAgent {
  private readonly planner: AdaptiveRetrievalPlanner;
  private readonly synthesizer = new RetrievalSynthesizer();

  constructor(config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG) {
    this.planner = new AdaptiveRetrievalPlanner(config);
  }

  plan(input: AdaptiveRetrievalPlannerInput): AdaptiveRetrievalPlan {
    return this.planner.plan(input);
  }

  synthesize(plan: RetrievalPlan, evidence: RetrievalEvidenceRecord[]): EvidenceSynthesisResult {
    return this.synthesizer.synthesize(plan, evidence);
  }
}

export class RetrievalConsensusScorer {
  score(signals: RetrievalSignalSummary): number {
    const activeRetrievers = [
      signals.denseHits > 0,
      signals.expansionHits > 0,
      signals.graphHits > 0,
      signals.hydeHits > 0,
      signals.raptorHits > 0,
    ].filter(Boolean).length;

    if (activeRetrievers <= 1) {
      return signals.finalHits > 0 ? 0.5 : 0;
    }

    const supportingHits =
      signals.expansionHits + signals.graphHits + signals.hydeHits + signals.raptorHits;

    return roundScore(
      clamp01((supportingHits / Math.max(1, signals.finalHits * activeRetrievers)) * 2.2)
    );
  }
}

export class RetrievalAggregator {
  summarize(signals: RetrievalSignalSummary) {
    return {
      rawRetrieverCount: [
        signals.denseHits,
        signals.expansionHits,
        signals.graphHits,
        signals.hydeHits,
        signals.raptorHits,
      ].filter((count) => count > 0).length,
      supportingEvidence:
        signals.expansionHits + signals.graphHits + signals.hydeHits + signals.raptorHits,
      finalHits: signals.finalHits,
    };
  }
}

export class RetrievalConflictAnalyzer {
  analyze(signals: RetrievalSignalSummary) {
    const supportingEvidence =
      signals.expansionHits + signals.graphHits + signals.hydeHits + signals.raptorHits;
    const disagreement = Math.max(0, signals.denseHits - supportingEvidence);

    return {
      disagreementScore: roundScore(clamp01(disagreement / Math.max(1, signals.denseHits))),
      missingEvidenceLikelihood: roundScore(
        clamp01(1 - supportingEvidence / Math.max(1, signals.finalHits * 2))
      ),
    };
  }
}

export class EvidenceMerger {
  merge(signalCounts: number[]): number {
    return signalCounts.reduce((max, count) => Math.max(max, count), 0);
  }
}

export class RetrievalFusionEngine {
  private readonly aggregator = new RetrievalAggregator();
  private readonly consensus = new RetrievalConsensusScorer();
  private readonly conflicts = new RetrievalConflictAnalyzer();
  private readonly evidenceMerger = new EvidenceMerger();

  evaluate(signals: RetrievalSignalSummary) {
    const aggregate = this.aggregator.summarize(signals);
    const consensusScore = this.consensus.score(signals);
    const conflicts = this.conflicts.analyze(signals);
    const mergedEvidence = this.evidenceMerger.merge([
      signals.denseHits,
      signals.expansionHits,
      signals.graphHits,
      signals.hydeHits,
      signals.raptorHits,
    ]);

    return {
      aggregate,
      consensusScore,
      conflicts,
      mergedEvidence,
    };
  }
}

export class RetrievalEvaluator {
  constructor(private readonly config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG) {}

  evaluate(
    plan: AdaptiveRetrievalPlan,
    signals: RetrievalSignalSummary,
    topScore: number,
    averageScore: number
  ): RetrievalSelfEvaluation {
    const fusion = new RetrievalFusionEngine().evaluate(signals);
    const contextCoverage = roundScore(
      clamp01((signals.finalHits + fusion.aggregate.supportingEvidence) / Math.max(1, plan.executionPlan.topK))
    );
    const evidenceQuality = roundScore(clamp01(topScore * 0.6 + averageScore * 0.4));
    const sourceDiversity = roundScore(clamp01(fusion.aggregate.rawRetrieverCount / 4));
    const retrievalConfidence = roundScore(
      clamp01(evidenceQuality * 0.5 + contextCoverage * 0.25 + fusion.consensusScore * 0.25)
    );
    const sufficient =
      retrievalConfidence >= this.config.thresholds.sufficientRetrievalConfidence &&
      fusion.consensusScore >= this.config.thresholds.sufficientConsensus;

    let recommendedAction: RetrievalSelfEvaluation["recommendedAction"] = "accept";
    if (!sufficient && plan.riskAssessment.highRisk) {
      recommendedAction = "tighten-validation";
    } else if (!sufficient && plan.executionPlan.queryExpansion.enabled) {
      recommendedAction = "expand-retrieval";
    } else if (!sufficient && plan.classification.categories.includes("ambiguous")) {
      recommendedAction = "ask-clarification";
    } else if (!sufficient && !plan.executionPlan.multiRetrieval) {
      recommendedAction = "retry-with-multi-retrieval";
    }

    return {
      retrievalConfidence,
      contextCoverage,
      evidenceQuality,
      sourceDiversity,
      consensusScore: fusion.consensusScore,
      sufficient,
      recommendedAction,
      missingEvidenceLikelihood: fusion.conflicts.missingEvidenceLikelihood,
    };
  }
}

export class AdaptiveRetrievalEngine {
  private readonly complexityAnalyzer: RetrievalComplexityAnalyzer;
  private readonly riskAssessor: QueryRiskAssessor;
  private readonly strategySelector: RetrievalStrategySelector;
  private readonly planner: RetrievalPlanner;

  constructor(private readonly config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG) {
    this.complexityAnalyzer = new RetrievalComplexityAnalyzer();
    this.riskAssessor = new QueryRiskAssessor(config);
    this.strategySelector = new RetrievalStrategySelector(config);
    this.planner = new RetrievalPlanner(config);
  }

  plan(input: AdaptiveRetrievalPlannerInput): AdaptiveRetrievalPlan {
    const classification = classifyAdaptiveQuery(input, this.complexityAnalyzer, this.config);
    const riskAssessment = this.riskAssessor.assess(classification);
    const strategy = this.strategySelector.select(classification, riskAssessment, input);
    const executionPlan = this.planner.createExecutionPlan(
      strategy,
      classification,
      riskAssessment,
      input
    );
    const retrievalPlan = this.planner.createRetrievalPlan(classification, executionPlan, input);
    const userMode = input.userMode ?? this.config.defaultUserMode;
    const riskProfile = riskAssessment.highRisk
      ? this.config.riskProfiles.highRisk
      : this.config.riskProfiles.balanced;

    const policy: RetrievalPolicy = {
      name: `${userMode.toLowerCase()}-${riskProfile.name}-retrieval`,
      userMode,
      riskProfile: riskProfile.name,
      confidenceThreshold: input.confidenceThreshold ?? riskProfile.confidenceThreshold,
      explanation: [
        `intent=${classification.primaryIntent}`,
        `strategy=${executionPlan.strategy}`,
        `topK=${executionPlan.topK}`,
      ],
    };

    const reasoning: string[] = [
      `complexity=${classification.complexity}`,
      `complexityScore=${classification.complexityScore.toFixed(2)}`,
      `ambiguity=${classification.ambiguity.toFixed(2)}`,
      `risk=${riskAssessment.overallRisk.toFixed(2)}`,
      `strategy=${executionPlan.strategy}`,
      `topK=${executionPlan.topK}`,
    ];

    if (executionPlan.queryExpansion.enabled) {
      reasoning.push(`query-expansion=${executionPlan.queryExpansion.strategies.join("+")}`);
    }
    if (executionPlan.rerankEnabled) {
      reasoning.push(`rerank-depth=${executionPlan.rerankDepth}`);
    }
    if (executionPlan.multiRetrieval) {
      reasoning.push("multi-retrieval-enabled");
    }
    if (executionPlan.validation.selfCheckEnabled) {
      reasoning.push("self-check-enabled");
    }
    if (retrievalPlan.planningEnabled) {
      reasoning.push(`retrieval-plan=${retrievalPlan.subQueries.length}-subqueries`);
    }

    const selectedMode = resolveSelectedMode(classification, executionPlan, input);
    const { executionMode, fallbackReason } = resolveExecutionMode(selectedMode, input, reasoning);
    const planTrace: RetrievalPlanTrace = {
      plannerDecisions: [
        `intent=${classification.primaryIntent}`,
        `planning=${retrievalPlan.planningEnabled ? "enabled" : "disabled"}`,
        `subqueries=${retrievalPlan.subQueries.length}`,
        `steps=${retrievalPlan.steps.length}`,
      ],
      retrievalStrategy:
        executionPlan.strategy === "HierarchicalStrategy"
          ? "hierarchical"
          : executionPlan.multiRetrieval || executionPlan.validation.critiqueEnabled
            ? "agentic"
            : retrievalPlan.planningEnabled
              ? "staged-hybrid"
              : "direct",
      createdSubqueries: retrievalPlan.subQueries.length,
      decompositionTypes: retrievalPlan.decompositionTypes,
      executionOrder: retrievalPlan.steps.map((step) => step.title),
      executedSteps: [],
      coverage: 0,
      missingEvidence: retrievalPlan.evidenceGoals.map((goal) => goal.description),
      evidenceSynthesis: {
        clusters: [],
        coverage: 0,
        consensusScore: 0,
        missingEvidence: retrievalPlan.evidenceGoals.map((goal) => goal.description),
        conflicts: [],
      },
      refinementQueries: retrievalPlan.executionState.expandedQueries,
    };

    const decision: RetrievalDecision = {
      policy,
      classification,
      riskAssessment,
      executionPlan,
      reasoning,
      estimatedCost: executionPlan.costProfile,
      estimatedLatency: executionPlan.latencyProfile,
      confidence: classification.confidence,
    };

    return {
      selectedMode,
      executionMode,
      shouldRetrieve: executionMode !== "DIRECT_LLM",
      estimatedCost: executionPlan.costProfile,
      estimatedLatency: executionPlan.latencyProfile,
      confidence: classification.confidence,
      reasoning,
      fallbackReason,
      classification,
      policy,
      riskAssessment,
      executionPlan,
      retrievalPlan,
      planTrace,
      decision,
    };
  }
}

export class AdaptiveRetrievalPlanner {
  private readonly engine: AdaptiveRetrievalEngine;

  constructor(config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG) {
    this.engine = new AdaptiveRetrievalEngine(config);
  }

  plan(input: AdaptiveRetrievalPlannerInput): AdaptiveRetrievalPlan {
    return this.engine.plan(input);
  }
}

export function classifyAdaptiveQuery(
  input: Pick<
    AdaptiveRetrievalPlannerInput,
    "query" | "queryConfidence" | "sessionMemoryHits" | "previousCacheHits"
  >,
  analyzer = new RetrievalComplexityAnalyzer(),
  config: RetrievalPolicyConfig = DEFAULT_POLICY_CONFIG
): AdaptiveQueryClassification {
  const query = input.query.trim();
  const tokenCount = tokenize(query).length;
  const categories = new Set<AdaptiveQueryCategory>();

  if (FACTUAL_PATTERN.test(query)) {
    categories.add("factual");
  }
  if (CONVERSATIONAL_PATTERN.test(query)) {
    categories.add("conversational");
    categories.add("low-risk");
  }
  if (MEMORY_PATTERN.test(query) || (input.sessionMemoryHits ?? 0) > 0) {
    categories.add("memory-based");
    categories.add("memory-dependent");
  }
  if (ANALYTICAL_PATTERN.test(query)) {
    categories.add("analytical");
  }
  if (COMPARATIVE_PATTERN.test(query)) {
    categories.add("comparative");
    categories.add("analytical");
  }
  if (SUMMARIZATION_PATTERN.test(query)) {
    categories.add("summarization");
  }
  if (RELATIONAL_PATTERN.test(query)) {
    categories.add("relational");
  }
  if (MULTI_HOP_PATTERN.test(query) || (RELATIONAL_PATTERN.test(query) && tokenCount >= 6)) {
    categories.add("multi-hop");
  }
  if (EXPLORATORY_PATTERN.test(query)) {
    categories.add("exploratory");
  }
  if (CITATION_PATTERN.test(query)) {
    categories.add("citation-heavy");
  }
  if (HIGH_RISK_PATTERN.test(query)) {
    categories.add("high-risk");
    categories.add("citation-heavy");
  }
  if (
    tokenCount <= 3 ||
    AMBIGUOUS_REFERENCE_PATTERN.test(query) ||
    (query.endsWith("?") && tokenCount <= 5)
  ) {
    categories.add("ambiguous");
  }
  if ((input.queryConfidence ?? 0.72) < config.thresholds.lowConfidence) {
    categories.add("low-confidence");
  }
  if (
    tokenCount >= 8 ||
    categories.has("analytical") ||
    categories.has("summarization") ||
    categories.has("multi-hop")
  ) {
    categories.add("retrieval-heavy");
  }
  if (categories.size === 0) {
    categories.add("low-risk");
  }

  const { complexity, complexityScore } = analyzer.analyze(query, categories);

  if (
    categories.has("factual") &&
    !categories.has("analytical") &&
    !categories.has("comparative") &&
    !categories.has("relational") &&
    !categories.has("multi-hop") &&
    !categories.has("citation-heavy") &&
    !categories.has("high-risk") &&
    complexity === "low"
  ) {
    categories.add("simple-factual");
    categories.delete("ambiguous");
  }

  const ambiguity = roundScore(
    clamp01(
    (tokenCount <= 3 ? 0.3 : 0.08) +
      (AMBIGUOUS_REFERENCE_PATTERN.test(query) ? 0.32 : 0) +
      (categories.has("memory-dependent") ? 0.12 : 0) +
      (categories.has("exploratory") ? 0.08 : 0)
    )
  );

  const factualityRisk = roundScore(
    clamp01(
      (categories.has("factual") ? 0.35 : 0.1) +
        (categories.has("analytical") ? 0.18 : 0) +
        (categories.has("comparative") ? 0.12 : 0) +
        (categories.has("citation-heavy") ? 0.14 : 0) +
        (categories.has("high-risk") ? 0.32 : 0) +
        (categories.has("low-risk") ? -0.15 : 0)
    )
  );

  const hallucinationRisk = roundScore(
    clamp01(
      ambiguity * 0.4 +
        complexityScore * 0.25 +
        (categories.has("exploratory") ? 0.14 : 0) +
        (categories.has("low-confidence") ? 0.18 : 0) +
        (categories.has("high-risk") ? 0.12 : 0) -
        (categories.has("simple-factual") ? 0.1 : 0)
    )
  );

  return {
    categories: [...categories],
    primaryIntent: resolvePrimaryIntent(categories),
    expectedAnswerType: resolveExpectedAnswerType(categories),
    complexity,
    complexityScore,
    ambiguity,
    factualityRisk,
    hallucinationRisk,
    confidence: roundScore(
      clamp01(
        (input.queryConfidence ?? 0.72) -
          ambiguity * 0.1 -
          (categories.has("low-confidence") ? 0.08 : 0) +
          ((input.previousCacheHits ?? 0) > 0 ? 0.04 : 0)
      )
    ),
  };
}

function resolvePrimaryIntent(
  categories: ReadonlySet<AdaptiveQueryCategory>
): AdaptiveQueryClassification["primaryIntent"] {
  if (categories.has("high-risk")) {
    return "high-risk";
  }
  if (categories.has("multi-hop")) {
    return "multi-hop";
  }
  if (categories.has("comparative")) {
    return "comparative";
  }
  if (categories.has("analytical")) {
    return "analytical";
  }
  if (categories.has("summarization")) {
    return "summarization";
  }
  if (categories.has("exploratory")) {
    return "exploratory";
  }
  if (categories.has("memory-dependent")) {
    return "memory-dependent";
  }
  if (categories.has("ambiguous")) {
    return "ambiguous";
  }
  if (categories.has("conversational")) {
    return "conversational";
  }
  return "simple-factual";
}

function resolveExpectedAnswerType(
  categories: ReadonlySet<AdaptiveQueryCategory>
): AdaptiveQueryClassification["expectedAnswerType"] {
  if (categories.has("comparative")) {
    return "comparison";
  }
  if (categories.has("analytical") || categories.has("multi-hop")) {
    return "analysis";
  }
  if (categories.has("summarization")) {
    return "summary";
  }
  if (categories.has("exploratory")) {
    return "exploration";
  }
  if (categories.has("conversational")) {
    return "conversation";
  }
  if (categories.has("memory-dependent")) {
    return "memory-recall";
  }
  if (categories.has("citation-heavy") || categories.has("high-risk")) {
    return "grounded-answer";
  }
  return "fact";
}

function resolveAdaptiveTopK(
  strategy: RetrievalStrategyName,
  classification: AdaptiveQueryClassification,
  risk: QueryRiskAssessment,
  input: AdaptiveRetrievalPlannerInput,
  userModeConfig: UserModeConfig
): number {
  const baseByStrategy: Record<RetrievalStrategyName, number> = {
    DenseOnlyStrategy: 4,
    HybridStrategy: 8,
    HybridRerankStrategy: 12,
    MultiRetrievalStrategy: 18,
    HyDEStrategy: 10,
    GraphEnhancedStrategy: 14,
    HierarchicalStrategy: 16,
    HighValidationStrategy: 20,
  };
  let topK = baseByStrategy[strategy] * userModeConfig.topKMultiplier;

  if (classification.complexity === "medium") {
    topK += 2;
  }
  if (classification.complexity === "high") {
    topK += 5;
  }
  if (classification.ambiguity >= 0.45) {
    topK += 3;
  }
  if (risk.highRisk) {
    topK += 4;
  }
  if ((input.sessionMemoryHits ?? 0) > 0 && classification.categories.includes("memory-dependent")) {
    topK += 2;
  }
  if (input.semanticCacheHit) {
    topK -= 2;
  }

  if (typeof input.tokenBudget === "number" && input.tokenBudget > 0) {
    topK = Math.min(topK, Math.max(4, Math.floor(input.tokenBudget / 120)));
  }
  if (typeof input.latencyBudget === "number" && input.latencyBudget > 0) {
    topK = Math.min(topK, input.latencyBudget <= 150 ? 8 : input.latencyBudget <= 300 ? 14 : 24);
  }
  if (typeof input.costBudget === "number" && input.costBudget > 0 && input.costBudget < 0.005) {
    topK = Math.min(topK, 8);
  }

  return Math.max(4, Math.round(topK));
}

function resolveRerankEnabled(
  strategy: RetrievalStrategyName,
  classification: AdaptiveQueryClassification,
  risk: QueryRiskAssessment,
  userModeConfig: UserModeConfig
): boolean {
  if (risk.highRisk) {
    return true;
  }

  if (
    strategy === "HybridRerankStrategy" ||
    strategy === "MultiRetrievalStrategy" ||
    strategy === "HighValidationStrategy"
  ) {
    return true;
  }

  if (strategy === "DenseOnlyStrategy") {
    return false;
  }

  if (strategy === "HybridStrategy") {
    return userModeConfig.rerankByDefault;
  }

  if (classification.categories.includes("analytical") || classification.categories.includes("comparative")) {
    return true;
  }

  return userModeConfig.rerankByDefault && !classification.categories.includes("simple-factual");
}

function buildQueryExpansionPlan(
  query: string,
  classification: AdaptiveQueryClassification,
  risk: QueryRiskAssessment,
  input: AdaptiveRetrievalPlannerInput,
  threshold: number
): QueryExpansionPlan {
  const shouldExpand =
    classification.ambiguity >= threshold ||
    classification.categories.includes("multi-hop") ||
    classification.categories.includes("low-confidence") ||
    risk.highRisk;

  if (!shouldExpand) {
    return {
      enabled: false,
      strategies: [],
      queries: [],
    };
  }

  const keywords = tokenize(query).filter((token) => token.length > 3 && !STOP_WORDS.has(token));
  const uniqueKeywords = [...new Set(keywords)].slice(0, 5);
  const queries = [query];

  if (uniqueKeywords.length > 0) {
    queries.push(uniqueKeywords.join(" "));
  }
  if (classification.categories.includes("multi-hop") && uniqueKeywords.length >= 2) {
    queries.push(`Explain ${uniqueKeywords.slice(0, 2).join(" and ")} with evidence`);
  }
  if (risk.highRisk || classification.categories.includes("citation-heavy")) {
    queries.push(`${query} cite sources evidence`);
  }
  if (
    (classification.categories.includes("ambiguous") || classification.categories.includes("low-confidence")) &&
    input.hydeAvailable
  ) {
    queries.push(`Hypothetical answer context for: ${query}`);
  }

  return {
    enabled: true,
    strategies: [
      "keyword",
      ...(classification.categories.includes("multi-hop") ? (["decomposition"] as const) : []),
      ...(classification.categories.includes("ambiguous") ? (["multi-query"] as const) : []),
      ...(input.hydeAvailable ? (["hyde"] as const) : []),
    ],
    queries: [...new Set(queries)],
    reason: risk.highRisk ? "high-risk-validation" : "ambiguity-or-complexity",
  };
}

function buildValidationPlan(
  strategy: RetrievalStrategyName,
  classification: AdaptiveQueryClassification,
  risk: QueryRiskAssessment,
  input: AdaptiveRetrievalPlannerInput,
  config: RetrievalPolicyConfig
): RetrievalValidationPlan {
  const profile = risk.highRisk ? config.riskProfiles.highRisk : config.riskProfiles.balanced;
  const validationSteps = ["groundedness-check"];

  if (profile.forceCitationEnforcement || classification.categories.includes("citation-heavy")) {
    validationSteps.push("citation-enforcement");
  }
  if (profile.forceSelfCheck || strategy === "HighValidationStrategy") {
    validationSteps.push("self-check");
  }
  if (strategy === "MultiRetrievalStrategy" || strategy === "HighValidationStrategy") {
    validationSteps.push("retrieval-consensus");
  }
  if (classification.categories.includes("ambiguous") || (input.sessionMemoryHits ?? 0) > 0) {
    validationSteps.push("clarification-check");
  }

  return {
    citationEnforced:
      profile.forceCitationEnforcement || classification.categories.includes("citation-heavy"),
    selfCheckEnabled: profile.forceSelfCheck || strategy === "HighValidationStrategy",
    critiqueEnabled: risk.highRisk || strategy === "HighValidationStrategy",
    consensusRequired:
      strategy === "MultiRetrievalStrategy" ||
      strategy === "HighValidationStrategy" ||
      classification.categories.includes("multi-hop"),
    validationSteps,
  };
}

function buildPlanId(query: string): string {
  const normalized = tokenize(query).slice(0, 6).join("-");
  return `plan:${normalized || "retrieval"}`;
}

function detectDecompositionTypes(
  query: string,
  classification: AdaptiveQueryClassification
): RetrievalDecompositionType[] {
  const types = new Set<RetrievalDecompositionType>();

  if (/\b(phase|version|release|sprint)\s+\w+/i.test(query)) {
    types.add("temporal");
  }
  if (classification.categories.includes("comparative")) {
    types.add("comparative");
  }
  if (classification.categories.includes("multi-hop")) {
    types.add("multi-hop");
  }
  if (/\b(depends?|dependency|impact|affect|influence|connected)\b/i.test(query)) {
    types.add("dependency-based");
  }
  if (/\b(why|because|caused?|reason)\b/i.test(query)) {
    types.add("causal");
  }
  if (classification.categories.includes("analytical")) {
    types.add("analytical");
  }

  return [...types];
}

function shouldEnablePlanning(
  classification: AdaptiveQueryClassification,
  decompositionTypes: RetrievalDecompositionType[]
): boolean {
  return (
    classification.complexity !== "low" ||
    classification.categories.includes("retrieval-heavy") ||
    classification.categories.includes("comparative") ||
    classification.categories.includes("multi-hop") ||
    decompositionTypes.length > 0
  );
}

function buildContextState(query: string): RetrievalContextState {
  const temporalAnchors = query.match(/\b(?:phase|version|release|sprint)\s+\w+/gi) ?? [];
  const entities = tokenize(query)
    .filter(
      (token) =>
        token.length > 3 &&
        !STOP_WORDS.has(token) &&
        !["phase", "version", "release", "sprint", "between"].includes(token)
    )
    .slice(0, 6);

  return {
    entities,
    temporalAnchors,
    comparisonTargets: temporalAnchors.length > 1 ? temporalAnchors : entities.slice(0, 2),
    missingEvidence: [],
  };
}

function buildEvidenceGoals(
  query: string,
  context: RetrievalContextState,
  decompositionTypes: RetrievalDecompositionType[]
): EvidenceGoal[] {
  const focus = context.entities.slice(0, 3).join(" ") || query;
  const goals: EvidenceGoal[] = [];

  if (decompositionTypes.includes("temporal") && context.temporalAnchors.length > 0) {
    goals.push(
      ...context.temporalAnchors.map((anchor, index) => ({
        goalId: `goal:temporal:${index + 1}`,
        description: `${focus} evidence for ${anchor}`,
        priority: "primary" as const,
        target: anchor,
      }))
    );
  }

  if (decompositionTypes.includes("comparative")) {
    goals.push({
      goalId: "goal:comparison",
      description: `Compare ${focus} across the retrieved contexts`,
      priority: "primary",
      target: focus,
    });
  }

  if (decompositionTypes.includes("dependency-based")) {
    goals.push({
      goalId: "goal:dependency",
      description: `Dependency evidence for ${focus}`,
      priority: "supporting",
      target: focus,
    });
  }

  if (decompositionTypes.includes("analytical") || goals.length === 0) {
    goals.push({
      goalId: "goal:analysis",
      description: `Architectural evidence for ${focus}`,
      priority: goals.length === 0 ? "primary" : "supporting",
      target: focus,
    });
  }

  goals.push({
    goalId: "goal:synthesis",
    description: "Synthesize the strongest grounded answer from the retrieved evidence",
    priority: "supporting",
  });

  return goals;
}

function buildSubQueries(
  query: string,
  classification: AdaptiveQueryClassification,
  executionPlan: RetrievalExecutionPlan,
  context: RetrievalContextState,
  evidenceGoals: EvidenceGoal[],
  decompositionTypes: RetrievalDecompositionType[],
  input: AdaptiveRetrievalPlannerInput
): SubQuery[] {
  const focusTerms = context.entities.join(" ");
  const subQueries: SubQuery[] = [];
  const createSubQuery = (
    subQueryId: string,
    text: string,
    type: SubQuery["type"],
    purpose: string,
    evidenceGoalIds: string[],
    stage: SubQuery["stage"] = "focused",
    dependsOn: string[] = []
  ) => {
    subQueries.push({
      subQueryId,
      text,
      type,
      purpose,
      evidenceGoalIds,
      dependsOn,
      stage,
      useGraphRag: executionPlan.graphTraversal,
      useHyDE: executionPlan.queryExpansion.strategies.includes("hyde") || input.hydeAvailable === true,
      useRAPTOR:
        executionPlan.strategy === "HierarchicalStrategy" || input.raptorAvailable === true,
      useMemory: classification.categories.includes("memory-dependent"),
    });
  };

  createSubQuery(
    "subquery:overview",
    query,
    decompositionTypes[0] ?? "analytical",
    "Retrieve the broad overview before drilling into focused evidence",
    evidenceGoals.filter((goal) => goal.priority === "primary").map((goal) => goal.goalId),
    "broad"
  );

  for (const [index, anchor] of context.temporalAnchors.entries()) {
    createSubQuery(
      `subquery:temporal:${index + 1}`,
      `${focusTerms} ${anchor}`.trim(),
      "temporal",
      `Retrieve focused evidence for ${anchor}`,
      evidenceGoals.filter((goal) => goal.target === anchor).map((goal) => goal.goalId),
      "focused",
      ["subquery:overview"]
    );
  }

  if (decompositionTypes.includes("comparative")) {
    createSubQuery(
      "subquery:comparison-adr",
      `ADR ${focusTerms} changes`,
      "comparative",
      "Retrieve ADRs or decision records that explain the comparison",
      evidenceGoals
        .filter((goal) => goal.goalId === "goal:comparison" || goal.goalId === "goal:analysis")
        .map((goal) => goal.goalId),
      "focused",
      ["subquery:overview"]
    );
  }

  if (decompositionTypes.includes("dependency-based")) {
    createSubQuery(
      "subquery:dependency",
      `${focusTerms} dependencies architecture`,
      "dependency-based",
      "Retrieve dependency and architectural relationship evidence",
      evidenceGoals.filter((goal) => goal.goalId === "goal:dependency").map((goal) => goal.goalId),
      "focused",
      ["subquery:overview"]
    );
  }

  if (
    decompositionTypes.includes("analytical") ||
    classification.categories.includes("retrieval-heavy")
  ) {
    createSubQuery(
      "subquery:analysis",
      `${focusTerms} architecture evolution`,
      "analytical",
      "Retrieve architectural change evidence to support synthesis",
      evidenceGoals.filter((goal) => goal.goalId === "goal:analysis").map((goal) => goal.goalId),
      "validation",
      ["subquery:overview"]
    );
  }

  return subQueries
    .filter((subQuery, index, items) => items.findIndex((item) => item.text === subQuery.text) === index)
    .slice(0, executionPlan.multiRetrieval ? 5 : 4);
}

function buildRetrievalTasks(
  subQueries: SubQuery[],
  evidenceGoals: EvidenceGoal[],
  executionPlan: RetrievalExecutionPlan
): Pick<RetrievalPlan, "tasks" | "steps" | "dependencies" | "executionGraph"> {
  const dependencies: RetrievalDependency[] = [];
  const retrievalTasks: RetrievalTask[] = subQueries.map((subQuery) => ({
    taskId: `task:${subQuery.subQueryId}`,
    title: subQuery.purpose,
    type: subQuery.useGraphRag && subQuery.stage !== "broad" ? ("graph-traversal" as const) : ("retrieval" as const),
    subQueryId: subQuery.subQueryId,
    evidenceGoalIds: subQuery.evidenceGoalIds,
    dependencyIds: [],
    executionMode: subQuery.dependsOn.length > 0 ? ("parallel" as const) : ("sequential" as const),
  }));
  const retrievalTaskIds = new Map(retrievalTasks.map((task) => [task.subQueryId!, task.taskId]));

  for (const task of retrievalTasks) {
    const subQuery = subQueries.find((item) => item.subQueryId === task.subQueryId);
    const dependencyIds = (subQuery?.dependsOn ?? [])
      .map((dependencySubQueryId) => retrievalTaskIds.get(dependencySubQueryId))
      .filter((value): value is string => Boolean(value));

    task.dependencyIds.push(...dependencyIds);
    dependencies.push(
      ...dependencyIds.map((dependencyId, index) => ({
        dependencyId: `dependency:${task.taskId}:${index + 1}`,
        fromTaskId: dependencyId,
        toTaskId: task.taskId,
        relation: "requires" as const,
      }))
    );
  }

  const synthesisTask: RetrievalTask = {
    taskId: "task:synthesis",
    title: "Synthesize grounded evidence",
    type: "synthesis",
    evidenceGoalIds: evidenceGoals.filter((goal) => goal.goalId === "goal:synthesis").map((goal) => goal.goalId),
    dependencyIds: retrievalTasks.map((task) => task.taskId),
    executionMode: "sequential",
  };
  const validationTask: RetrievalTask = {
    taskId: "task:validation",
    title: "Validate coverage and consensus",
    type: "validation",
    evidenceGoalIds: evidenceGoals.map((goal) => goal.goalId),
    dependencyIds: [synthesisTask.taskId],
    executionMode: "sequential",
  };

  dependencies.push(
    ...retrievalTasks.map((task, index) => ({
      dependencyId: `dependency:${synthesisTask.taskId}:${index + 1}`,
      fromTaskId: task.taskId,
      toTaskId: synthesisTask.taskId,
      relation: "synthesizes" as const,
    })),
    {
      dependencyId: `dependency:${validationTask.taskId}:1`,
      fromTaskId: synthesisTask.taskId,
      toTaskId: validationTask.taskId,
      relation: "validates",
    }
  );

  const tasks = [...retrievalTasks, synthesisTask, validationTask];
  const steps: RetrievalStep[] = [
    {
      stepId: "step:decomposition",
      title: "Decompose query into focused retrieval tasks",
      stage: "decomposition",
      taskIds: [],
      executionMode: "sequential",
      stopCondition: "subqueries-created",
    },
    {
      stepId: "step:retrieval",
      title: "Execute staged retrieval",
      stage: "retrieval",
      taskIds: retrievalTasks.map((task) => task.taskId),
      executionMode:
        executionPlan.multiRetrieval || retrievalTasks.length > 2 ? "parallel" : "sequential",
      stopCondition: "evidence-goals-partially-covered",
    },
    {
      stepId: "step:synthesis",
      title: "Merge and synthesize evidence",
      stage: "synthesis",
      taskIds: [synthesisTask.taskId],
      executionMode: "sequential",
      stopCondition: "evidence-clusters-built",
    },
    {
      stepId: "step:validation",
      title: "Validate coverage and consensus",
      stage: "validation",
      taskIds: [validationTask.taskId],
      executionMode: "sequential",
      stopCondition: "coverage-checked",
    },
  ];
  const nodes = tasks.map((task) => ({
    nodeId: `node:${task.taskId}`,
    taskId: task.taskId,
    nodeType: task.type,
  }));
  const edges = dependencies.map((dependency) => ({
    edgeId: `edge:${dependency.dependencyId}`,
    fromNodeId: `node:${dependency.fromTaskId}`,
    toNodeId: `node:${dependency.toTaskId}`,
    relation: dependency.relation,
  }));

  return {
    tasks,
    steps,
    dependencies,
    executionGraph: {
      nodes,
      edges,
      parallelTaskGroups:
        steps[1]?.executionMode === "parallel"
          ? [retrievalTasks.map((task) => task.taskId)]
          : [],
    },
  };
}

function resolveClusterTheme(type: SubQuery["type"]): EvidenceCluster["theme"] {
  switch (type) {
    case "temporal":
      return "temporal";
    case "comparative":
    case "analytical":
      return "architectural";
    case "dependency-based":
      return "entity";
    default:
      return "query-stage";
  }
}

function resolveSelectedMode(
  classification: AdaptiveQueryClassification,
  executionPlan: RetrievalExecutionPlan,
  input: AdaptiveRetrievalPlannerInput
): AdaptiveRetrievalMode {
  if (
    classification.categories.includes("conversational") &&
    classification.categories.includes("low-risk")
  ) {
    return "DIRECT_LLM";
  }

  switch (executionPlan.strategy) {
    case "DenseOnlyStrategy":
      return "STANDARD_RAG";
    case "HybridStrategy":
    case "HybridRerankStrategy":
      return "HYBRID_RAG";
    case "HyDEStrategy":
      return "HYDE_RAG";
    case "GraphEnhancedStrategy":
      return input.graphAvailable ? "GRAPH_RAG" : "HYBRID_RAG";
    case "HierarchicalStrategy":
    case "MultiRetrievalStrategy":
    case "HighValidationStrategy":
      return "FULL_PIPELINE";
  }
}

function resolveExecutionMode(
  selectedMode: AdaptiveRetrievalMode,
  input: AdaptiveRetrievalPlannerInput,
  reasoning: string[]
): Pick<AdaptiveRetrievalPlan, "executionMode" | "fallbackReason"> {
  let executionMode = selectedMode;
  let fallbackReason: string | undefined;

  if (selectedMode === "DIRECT_LLM" && input.requireGrounding !== false) {
    executionMode = "STANDARD_RAG";
    fallbackReason = "grounded-retrieval-required-by-current-pipeline";
    reasoning.push("fallback-to-grounded-rag");
  }

  if (selectedMode === "FULL_PIPELINE" && !input.graphAvailable && !input.hydeAvailable && !input.raptorAvailable) {
    executionMode = "HYBRID_RAG";
    fallbackReason = "advanced-retrievers-unavailable";
    reasoning.push("fallback-to-hybrid-rag");
  }

  if (selectedMode === "GRAPH_RAG" && !input.graphAvailable) {
    executionMode = "HYBRID_RAG";
    fallbackReason = "graph-retrieval-unavailable";
    reasoning.push("fallback-to-hybrid-rag");
  }

  if (selectedMode === "HYDE_RAG" && !input.hydeAvailable) {
    executionMode = "HYBRID_RAG";
    fallbackReason = "hyde-unavailable";
    reasoning.push("fallback-to-hybrid-rag");
  }

  return {
    executionMode,
    fallbackReason,
  };
}

function tokenize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}
