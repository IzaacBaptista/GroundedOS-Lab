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

    const selectedMode = resolveSelectedMode(classification, executionPlan, input);
    const { executionMode, fallbackReason } = resolveExecutionMode(selectedMode, input, reasoning);

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
