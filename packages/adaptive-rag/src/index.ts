export type AdaptiveRetrievalMode =
  | "DIRECT_LLM"
  | "STANDARD_RAG"
  | "HYBRID_RAG"
  | "GRAPH_RAG"
  | "HYDE_RAG"
  | "FULL_PIPELINE";

export type AdaptiveQueryCategory =
  | "factual"
  | "conversational"
  | "memory-based"
  | "analytical"
  | "summarization"
  | "relational"
  | "retrieval-heavy"
  | "low-risk";

export interface AdaptiveQueryClassification {
  categories: AdaptiveQueryCategory[];
  complexity: "low" | "medium" | "high";
  ambiguity: number;
  factualityRisk: number;
  confidence: number;
}

export interface AdaptiveRetrievalPlannerInput {
  query: string;
  queryConfidence?: number;
  previousCacheHits?: number;
  sessionMemoryHits?: number;
  contextLength?: number;
  retrievalCostEstimate?: number;
  graphAvailable?: boolean;
  hydeAvailable?: boolean;
  raptorAvailable?: boolean;
  requireGrounding?: boolean;
}

export interface AdaptiveRetrievalPlan {
  selectedMode: AdaptiveRetrievalMode;
  executionMode: AdaptiveRetrievalMode;
  shouldRetrieve: boolean;
  estimatedCost: "low" | "medium" | "high";
  confidence: number;
  reasoning: string[];
  fallbackReason?: string;
  classification: AdaptiveQueryClassification;
}

const CONVERSATIONAL_PATTERN = /\b(hello|hi|hey|thanks|thank you|good morning|good afternoon)\b/i;
const MEMORY_PATTERN = /\b(previous|earlier|last time|before|remember)\b/i;
const ANALYTICAL_PATTERN = /\b(compare|trade.?off|analy[sz]e|pros and cons|impact|difference)\b/i;
const SUMMARIZATION_PATTERN = /\b(summarize|summary|overview|tldr)\b/i;
const RELATIONAL_PATTERN = /\b(relat|depend|connected|link|graph|path|why does|how does)\b/i;
const FACTUAL_PATTERN = /\b(what|who|where|when|which|define|explain)\b/i;

export class AdaptiveRetrievalPlanner {
  plan(input: AdaptiveRetrievalPlannerInput): AdaptiveRetrievalPlan {
    const classification = classifyAdaptiveQuery(input);
    const reasoning: string[] = [
      `complexity=${classification.complexity}`,
      `ambiguity=${classification.ambiguity.toFixed(2)}`,
      `factualityRisk=${classification.factualityRisk.toFixed(2)}`,
    ];

    let selectedMode: AdaptiveRetrievalMode = "STANDARD_RAG";

    if (classification.categories.includes("relational") && input.graphAvailable) {
      selectedMode = input.hydeAvailable ? "FULL_PIPELINE" : "GRAPH_RAG";
      reasoning.push("relational-query-uses-graph");
    } else if (
      classification.categories.includes("analytical") &&
      input.graphAvailable &&
      input.raptorAvailable
    ) {
      selectedMode = "FULL_PIPELINE";
      reasoning.push("analytical-query-needs-multi-stage-context");
    } else if (
      classification.categories.includes("factual") &&
      classification.ambiguity >= 0.35 &&
      input.hydeAvailable
    ) {
      selectedMode = "HYDE_RAG";
      reasoning.push("ambiguous-factual-query-benefits-from-hyde");
    } else if (classification.categories.includes("retrieval-heavy")) {
      selectedMode = "HYBRID_RAG";
      reasoning.push("query-is-retrieval-heavy");
    } else if (
      classification.categories.includes("conversational") &&
      classification.categories.includes("low-risk")
    ) {
      selectedMode = "DIRECT_LLM";
      reasoning.push("low-risk-conversational-query");
    }

    const shouldRetrieve = selectedMode !== "DIRECT_LLM";
    let executionMode = selectedMode;
    let fallbackReason: string | undefined;

    if (selectedMode === "DIRECT_LLM" && input.requireGrounding !== false) {
      executionMode = "STANDARD_RAG";
      fallbackReason = "grounded-retrieval-required-by-current-pipeline";
      reasoning.push("fallback-to-grounded-rag");
    }

    return {
      selectedMode,
      executionMode,
      shouldRetrieve: executionMode !== "DIRECT_LLM",
      estimatedCost: estimateCost(classification, input),
      confidence: classification.confidence,
      reasoning,
      fallbackReason,
      classification,
    };
  }
}

export function classifyAdaptiveQuery(
  input: Pick<AdaptiveRetrievalPlannerInput, "query" | "queryConfidence">
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
  if (MEMORY_PATTERN.test(query)) {
    categories.add("memory-based");
  }
  if (ANALYTICAL_PATTERN.test(query)) {
    categories.add("analytical");
  }
  if (SUMMARIZATION_PATTERN.test(query)) {
    categories.add("summarization");
  }
  if (RELATIONAL_PATTERN.test(query)) {
    categories.add("relational");
  }
  if (tokenCount >= 8 || categories.has("analytical") || categories.has("summarization")) {
    categories.add("retrieval-heavy");
  }
  if (categories.size === 0) {
    categories.add("low-risk");
  }

  const complexity =
    tokenCount >= 14 || categories.has("analytical") || categories.has("summarization")
      ? "high"
      : tokenCount >= 7 || categories.has("relational")
        ? "medium"
        : "low";

  const ambiguity = Number(
    Math.min(
      1,
      (tokenCount <= 4 ? 0.35 : 0.1) +
        (/\b(it|this|that|they|them)\b/i.test(query) ? 0.35 : 0) +
        (categories.has("memory-based") ? 0.15 : 0)
    ).toFixed(6)
  );

  const factualityRisk = Number(
    Math.min(
      1,
      (categories.has("factual") ? 0.45 : 0.1) +
        (categories.has("relational") ? 0.25 : 0) +
        (categories.has("analytical") ? 0.2 : 0) +
        (categories.has("low-risk") ? -0.15 : 0)
    ).toFixed(6)
  );

  return {
    categories: [...categories],
    complexity,
    ambiguity,
    factualityRisk,
    confidence: Number((input.queryConfidence ?? 0.72).toFixed(6)),
  };
}

function tokenize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function estimateCost(
  classification: AdaptiveQueryClassification,
  input: AdaptiveRetrievalPlannerInput
): "low" | "medium" | "high" {
  const explicit = input.retrievalCostEstimate ?? 0;

  if (explicit >= 0.7 || classification.complexity === "high") {
    return "high";
  }
  if (explicit >= 0.3 || classification.complexity === "medium") {
    return "medium";
  }

  return "low";
}
