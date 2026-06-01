import { describe, expect, it } from "vitest";

import { AdaptiveRetrievalPlanner, classifyAdaptiveQuery } from "./index";

describe("adaptive-rag", () => {
  it("classifies relational analytical questions as retrieval-heavy", () => {
    const classification = classifyAdaptiveQuery({
      query: "How does semantic cache relate to retrieval latency and why does it matter?",
      queryConfidence: 0.81,
    });

    expect(classification.categories).toEqual(
      expect.arrayContaining(["relational", "retrieval-heavy", "multi-hop"])
    );
    expect(classification.complexity).toBe("high");
    expect(classification.primaryIntent).toBe("multi-hop");
  });

  it("routes relational queries to graph-aware retrieval when graph signals are available", () => {
    const planner = new AdaptiveRetrievalPlanner();
    const plan = planner.plan({
      query: "How does semantic cache depend on retrieval?",
      graphAvailable: true,
      hydeAvailable: true,
      raptorAvailable: true,
      requireGrounding: true,
    });

    expect(plan.selectedMode).toBe("FULL_PIPELINE");
    expect(plan.executionMode).toBe("FULL_PIPELINE");
    expect(plan.executionPlan.strategy).toBe("MultiRetrievalStrategy");
    expect(plan.executionPlan.graphTraversal).toBe(true);
    expect(plan.executionPlan.queryExpansion.enabled).toBe(true);
  });

  it("falls back from direct LLM to grounded retrieval when grounding is required", () => {
    const planner = new AdaptiveRetrievalPlanner();
    const plan = planner.plan({
      query: "Thanks!",
      requireGrounding: true,
    });

    expect(plan.selectedMode).toBe("DIRECT_LLM");
    expect(plan.executionMode).toBe("STANDARD_RAG");
    expect(plan.fallbackReason).toBe("grounded-retrieval-required-by-current-pipeline");
  });

  it("enforces high-validation policies for high-risk queries", () => {
    const planner = new AdaptiveRetrievalPlanner();
    const plan = planner.plan({
      query: "Is this legally compliant? Cite the evidence and explain the risks.",
      graphAvailable: true,
      hydeAvailable: true,
      raptorAvailable: true,
      requireGrounding: true,
      userMode: "DEEP",
    });

    expect(plan.classification.categories).toEqual(
      expect.arrayContaining(["high-risk", "citation-heavy"])
    );
    expect(plan.executionPlan.strategy).toBe("HighValidationStrategy");
    expect(plan.executionPlan.multiRetrieval).toBe(true);
    expect(plan.executionPlan.validation.citationEnforced).toBe(true);
    expect(plan.executionPlan.validation.selfCheckEnabled).toBe(true);
    expect(plan.executionPlan.topK).toBeGreaterThanOrEqual(20);
  });

  it("keeps simple factual fast-mode queries on cheap retrieval", () => {
    const planner = new AdaptiveRetrievalPlanner();
    const plan = planner.plan({
      query: "What is semantic cache?",
      requireGrounding: true,
      userMode: "FAST",
      semanticCacheHit: true,
    });

    expect(plan.classification.categories).toContain("simple-factual");
    expect(plan.executionPlan.strategy).toBe("DenseOnlyStrategy");
    expect(plan.executionPlan.rerankEnabled).toBe(false);
    expect(plan.executionPlan.retrievalMode).toBe("dense");
    expect(plan.executionPlan.topK).toBeLessThanOrEqual(4);
  });

  it("builds an explicit retrieval plan for temporal comparisons", () => {
    const planner = new AdaptiveRetrievalPlanner();
    const plan = planner.plan({
      query: "Compare auth strategy changes between phase 5 and phase 6",
      graphAvailable: true,
      hydeAvailable: true,
      raptorAvailable: true,
      requireGrounding: true,
      userMode: "DEEP",
    });

    expect(plan.retrievalPlan.planningEnabled).toBe(true);
    expect(plan.retrievalPlan.decompositionTypes).toEqual(
      expect.arrayContaining(["temporal", "comparative", "analytical"])
    );
    expect(plan.retrievalPlan.subQueries.map((subQuery) => subQuery.text)).toEqual(
      expect.arrayContaining([
        "Compare auth strategy changes between phase 5 and phase 6",
        "compare auth strategy changes phase 5",
        "compare auth strategy changes phase 6",
        "ADR compare auth strategy changes changes",
      ])
    );
    expect(plan.retrievalPlan.steps.map((step) => step.stage)).toEqual([
      "decomposition",
      "retrieval",
      "synthesis",
      "validation",
    ]);
    expect(plan.planTrace.retrievalStrategy).toBe("agentic");
    expect(plan.planTrace.createdSubqueries).toBeGreaterThanOrEqual(4);
  });
});
