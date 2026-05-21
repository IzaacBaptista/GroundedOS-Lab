import { describe, expect, it } from "vitest";

import { AdaptiveRetrievalPlanner, classifyAdaptiveQuery } from "./index";

describe("adaptive-rag", () => {
  it("classifies relational analytical questions as retrieval-heavy", () => {
    const classification = classifyAdaptiveQuery({
      query: "How does semantic cache relate to retrieval latency and why does it matter?",
      queryConfidence: 0.81,
    });

    expect(classification.categories).toEqual(
      expect.arrayContaining(["relational", "retrieval-heavy"])
    );
    expect(classification.complexity).toBe("high");
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
    expect(plan.reasoning).toContain("relational-query-uses-graph");
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
});
