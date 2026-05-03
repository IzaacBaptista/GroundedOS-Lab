export type RoutingIntent =
  | "simple"
  | "reasoning"
  | "ambiguous"
  | "comparative"
  | "procedural";

export interface RoutingCandidate {
  model: string;
  provider: "local" | "cloud" | "ollama";
  latencyTier: "low" | "medium" | "high";
  costTier: "low" | "medium" | "high";
  qualityTier: "baseline" | "strong" | "reasoning";
}

export interface QueryRoutingFeatures {
  queryLength: number;
  tokenEstimate: number;
  hasReasoningKeywords: boolean;
  hasAmbiguityKeywords: boolean;
  hasComparisonKeywords: boolean;
  hasProceduralKeywords: boolean;
  intent: RoutingIntent;
  complexityScore: number;
}

export interface RetrievalRoutingSignals {
  resultCount: number;
  topScore: number;
  avgScore: number;
  scoreSpread: number;
  groundedResultRatio: number;
  uniqueDocuments: number;
}

export interface ModelRoutingDecision {
  selectedModel: string;
  selectedProvider: "local" | "cloud" | "ollama";
  reason: string;
  stage: "pre-retrieval" | "post-retrieval";
  strategy: "query-only" | "hybrid";
  confidence: number;
  tradeoff: {
    latency: "low" | "medium" | "high";
    cost: "low" | "medium" | "high";
    quality: "baseline" | "strong" | "reasoning";
  };
  alternatives: Array<{
    model: string;
    provider: "local" | "cloud" | "ollama";
    reason: string;
  }>;
  features: QueryRoutingFeatures;
  retrievalSignals?: RetrievalRoutingSignals;
  refinement?: {
    changed: boolean;
    reason: string;
    triggeredBy: string[];
  };
}

export interface RoutingContext {
  forcedModel?: string;
  forceCheap?: boolean;
  forceQuality?: boolean;
  postRetrieval?: RetrievalRoutingSignals;
}

const DEFAULT_CANDIDATES: RoutingCandidate[] = [
  {
    model: "local-extractive",
    provider: "local",
    latencyTier: "low",
    costTier: "low",
    qualityTier: "baseline",
  },
  {
    model: "ollama",
    provider: "ollama",
    latencyTier: "medium",
    costTier: "low",
    qualityTier: "strong",
  },
  {
    model: "groq",
    provider: "cloud",
    latencyTier: "medium",
    costTier: "medium",
    qualityTier: "reasoning",
  },
];

const REASONING_KEYWORDS = [
  "why",
  "explain",
  "compare",
  "tradeoff",
  "reason",
  "because",
  "how",
  "difference",
];
const AMBIGUITY_KEYWORDS = ["maybe", "could", "might", "or", "versus", "unclear"];
const COMPARISON_KEYWORDS = ["compare", "vs", "versus", "better", "worse", "difference"];
const PROCEDURAL_KEYWORDS = ["steps", "how to", "implement", "configure", "setup", "run"];

export function analyzeQuery(query: string): QueryRoutingFeatures {
  const normalized = query.trim().toLowerCase();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const tokenEstimate = Math.max(1, tokens.length);

  const hasReasoningKeywords = hasAnyKeyword(normalized, REASONING_KEYWORDS);
  const hasAmbiguityKeywords = hasAnyKeyword(normalized, AMBIGUITY_KEYWORDS);
  const hasComparisonKeywords = hasAnyKeyword(normalized, COMPARISON_KEYWORDS);
  const hasProceduralKeywords = hasAnyKeyword(normalized, PROCEDURAL_KEYWORDS);

  const complexityScore = Math.min(
    1,
    tokenEstimate / 28 +
      (hasReasoningKeywords ? 0.28 : 0) +
      (hasAmbiguityKeywords ? 0.2 : 0) +
      (hasComparisonKeywords ? 0.2 : 0)
  );

  let intent: RoutingIntent = "simple";
  if (hasComparisonKeywords) {
    intent = "comparative";
  } else if (hasProceduralKeywords) {
    intent = "procedural";
  } else if (hasAmbiguityKeywords) {
    intent = "ambiguous";
  } else if (hasReasoningKeywords) {
    intent = "reasoning";
  }

  return {
    queryLength: normalized.length,
    tokenEstimate,
    hasReasoningKeywords,
    hasAmbiguityKeywords,
    hasComparisonKeywords,
    hasProceduralKeywords,
    intent,
    complexityScore: Number(complexityScore.toFixed(3)),
  };
}

export function routeModel(
  query: string,
  context: RoutingContext = {},
  candidates: RoutingCandidate[] = DEFAULT_CANDIDATES
): ModelRoutingDecision {
  const features = analyzeQuery(query);
  const stage = context.postRetrieval ? "post-retrieval" : "pre-retrieval";
  const strategy = context.postRetrieval ? "hybrid" : "query-only";

  if (context.forcedModel) {
    const forced =
      candidates.find((candidate) => candidate.model === context.forcedModel) ?? candidates[0]!;

    return {
      selectedModel: forced.model,
      selectedProvider: forced.provider,
      reason: `Model forced by context: ${forced.model}`,
      stage,
      strategy,
      confidence: 1,
      tradeoff: {
        latency: forced.latencyTier,
        cost: forced.costTier,
        quality: forced.qualityTier,
      },
      alternatives: buildAlternatives(candidates, forced.model),
      features,
      retrievalSignals: context.postRetrieval,
      refinement: context.postRetrieval
        ? {
            changed: false,
            reason: "Forced selection bypassed retrieval-based refinement.",
            triggeredBy: ["forced-model"],
          }
        : undefined,
    };
  }

  const preferred = pickCandidate(features, context, candidates);
  const refinement = refineCandidate(preferred, features, context.postRetrieval, candidates);
  const confidence = computeRoutingConfidence(features, refinement.selected, context.postRetrieval);

  return {
    selectedModel: refinement.selected.model,
    selectedProvider: refinement.selected.provider,
    reason: buildReason(features, refinement.selected, context.postRetrieval, refinement),
    stage,
    strategy,
    confidence,
    tradeoff: {
      latency: refinement.selected.latencyTier,
      cost: refinement.selected.costTier,
      quality: refinement.selected.qualityTier,
    },
    alternatives: buildAlternatives(candidates, refinement.selected.model),
    features,
    retrievalSignals: context.postRetrieval,
    refinement: context.postRetrieval
      ? {
          changed: refinement.changed,
          reason: refinement.reason,
          triggeredBy: refinement.triggers,
        }
      : undefined,
  };
}

function refineCandidate(
  preferred: RoutingCandidate,
  features: QueryRoutingFeatures,
  signals: RetrievalRoutingSignals | undefined,
  candidates: RoutingCandidate[]
): {
  selected: RoutingCandidate;
  changed: boolean;
  reason: string;
  triggers: string[];
} {
  if (!signals) {
    return {
      selected: preferred,
      changed: false,
      reason: "No retrieval evidence available yet.",
      triggers: [],
    };
  }

  const triggers: string[] = [];
  const needsEscalation =
    signals.topScore < 0.45 ||
    signals.scoreSpread < 0.08 ||
    signals.groundedResultRatio < 0.5 ||
    (signals.uniqueDocuments <= 1 && signals.resultCount <= 2);
  const supportsDowngrade =
    signals.topScore >= 0.82 &&
    signals.scoreSpread >= 0.18 &&
    signals.groundedResultRatio >= 0.8 &&
    features.intent === "simple";

  if (signals.topScore < 0.45) {
    triggers.push("weak-top-hit");
  }
  if (signals.scoreSpread < 0.08) {
    triggers.push("tight-score-band");
  }
  if (signals.groundedResultRatio < 0.5) {
    triggers.push("low-grounded-ratio");
  }
  if (signals.uniqueDocuments <= 1 && signals.resultCount <= 2) {
    triggers.push("narrow-evidence");
  }
  if (supportsDowngrade) {
    triggers.push("high-confidence-retrieval");
  }

  if (needsEscalation) {
    const escalated =
      candidates.find((candidate) => candidate.qualityTier === "reasoning") ??
      candidates.find((candidate) => candidate.qualityTier === "strong") ??
      preferred;

    return {
      selected: escalated,
      changed: escalated.model !== preferred.model,
      reason:
        escalated.model === preferred.model
          ? "Retrieval signaled uncertainty, but no stronger candidate was available."
          : "Retrieval signaled ambiguity; upgraded to a stronger refinement model.",
      triggers,
    };
  }

  if (supportsDowngrade) {
    const cheaper = candidates.find((candidate) => candidate.costTier === "low") ?? preferred;

    return {
      selected: cheaper,
      changed: cheaper.model !== preferred.model,
      reason:
        cheaper.model === preferred.model
          ? "Retrieval confidence was strong enough to keep the low-cost route."
          : "Retrieval was highly confident; downgraded to a faster lower-cost model.",
      triggers,
    };
  }

  return {
    selected: preferred,
    changed: false,
    reason: "Post-retrieval evidence confirmed the initial route.",
    triggers,
  };
}

function pickCandidate(
  features: QueryRoutingFeatures,
  context: RoutingContext,
  candidates: RoutingCandidate[]
): RoutingCandidate {
  if (context.forceCheap) {
    return candidates.find((candidate) => candidate.costTier === "low") ?? candidates[0]!;
  }

  if (context.forceQuality) {
    return (
      candidates.find((candidate) => candidate.qualityTier === "reasoning") ??
      candidates.find((candidate) => candidate.qualityTier === "strong") ??
      candidates[0]!
    );
  }

  if (features.tokenEstimate <= 10 && features.complexityScore < 0.35) {
    return candidates.find((candidate) => candidate.costTier === "low") ?? candidates[0]!;
  }

  if (features.hasReasoningKeywords || features.intent === "comparative") {
    return (
      candidates.find((candidate) => candidate.qualityTier === "reasoning") ??
      candidates.find((candidate) => candidate.qualityTier === "strong") ??
      candidates[0]!
    );
  }

  if (features.complexityScore >= 0.55 || features.hasAmbiguityKeywords) {
    return candidates.find((candidate) => candidate.qualityTier !== "baseline") ?? candidates[0]!;
  }

  return candidates.find((candidate) => candidate.provider === "ollama") ?? candidates[0]!;
}

function buildReason(
  features: QueryRoutingFeatures,
  candidate: RoutingCandidate,
  signals?: RetrievalRoutingSignals,
  refinement?: { changed: boolean; reason: string; triggers: string[] }
): string {
  if (signals && refinement) {
    const triggerText = refinement.triggers.length > 0 ? ` Signals: ${refinement.triggers.join(", ")}.` : "";
    return `${refinement.reason}${triggerText}`;
  }

  if (candidate.qualityTier === "reasoning") {
    return "Reasoning/comparison intent detected; routed to higher-quality reasoning model.";
  }

  if (candidate.qualityTier === "strong") {
    return "Query complexity is moderate/high; routed to stronger model for better answer quality.";
  }

  return "Query is short/simple; routed to fast low-cost model to minimize latency and cost.";
}

function buildAlternatives(candidates: RoutingCandidate[], selectedModel: string) {
  return candidates
    .filter((candidate) => candidate.model !== selectedModel)
    .slice(0, 2)
    .map((candidate) => ({
      model: candidate.model,
      provider: candidate.provider,
      reason: `${candidate.qualityTier} quality, ${candidate.costTier} cost, ${candidate.latencyTier} latency`,
    }));
}

function computeRoutingConfidence(
  features: QueryRoutingFeatures,
  selected: RoutingCandidate,
  signals?: RetrievalRoutingSignals
): number {
  const base = 0.6;
  const intentBoost =
    features.intent === "simple"
      ? 0.2
      : features.intent === "reasoning" || features.intent === "comparative"
        ? 0.28
        : 0.18;
  const complexityPenalty = selected.qualityTier === "baseline" && features.complexityScore > 0.5 ? 0.2 : 0;
  const retrievalBoost =
    signals === undefined
      ? 0
      : Math.max(-0.12, Math.min(0.12, signals.topScore * 0.1 + signals.scoreSpread * 0.08));

  return Number(
    Math.max(0.4, Math.min(0.98, base + intentBoost - complexityPenalty + retrievalBoost)).toFixed(2)
  );
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}
