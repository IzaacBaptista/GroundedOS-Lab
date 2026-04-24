import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  CostBudgetEnforcer,
  CostLedger,
  CostTracker,
  resolveUnitCostUsd,
} from "./cost";

describe("CostTracker", () => {
  it("tracks events and summarizes per request", () => {
    const tracker = new CostTracker("req-1");

    tracker.trackEvent("embedding-query", "api-lexical", 120, 0);
    tracker.trackEvent("retrieval", "api-lexical", 1, 0);

    const summary = tracker.summarize(true);

    expect(summary.requestId).toBe("req-1");
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.withinBudget).toBe(true);
    expect(summary.breakdown).toHaveLength(2);
  });

  it("computes non-zero totals for paid providers", () => {
    const tracker = new CostTracker("req-2");
    tracker.trackEvent("llm-inference", "openai", 1000, 0.000001);

    expect(tracker.getTotalCostUsd()).toBe(0.001);
  });
});

describe("CostLedger", () => {
  it("persists and reads JSONL summaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-cost-test-"));

    try {
      const ledger = new CostLedger(dir, "ledger.jsonl");

      await ledger.appendSummary({
        requestId: "req-3",
        totalCostUsd: 0,
        withinBudget: true,
        breakdown: [
          {
            requestId: "req-3",
            stage: "retrieval",
            provider: "api-lexical",
            units: 1,
            unitCost: 0,
            totalCost: 0,
            metadata: { timestamp: Date.now() },
          },
        ],
      });

      const summaries = await ledger.readSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.requestId).toBe("req-3");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("CostBudgetEnforcer", () => {
  it("throws BudgetExceededError when per-request budget is exceeded", () => {
    const enforcer = new CostBudgetEnforcer({
      perRequestLimitUsd: 0.01,
      dailyLimitUsd: 10,
      alertThresholdPct: 80,
    });

    expect(() => enforcer.validateBudget("req-4", 0.02, 0)).toThrow(BudgetExceededError);
  });

  it("throws BudgetExceededError when daily budget would be exceeded", () => {
    const enforcer = new CostBudgetEnforcer({
      perRequestLimitUsd: 10,
      dailyLimitUsd: 0.05,
      alertThresholdPct: 80,
    });

    expect(() => enforcer.validateBudget("req-5", 0.02, 0.04)).toThrow(BudgetExceededError);
  });

  it("computes budget remaining", () => {
    const enforcer = new CostBudgetEnforcer({
      perRequestLimitUsd: 1,
      dailyLimitUsd: 1,
      alertThresholdPct: 80,
    });

    expect(enforcer.computeBudgetRemaining(0.2, 0.3)).toBe(0.5);
  });
});

describe("resolveUnitCostUsd", () => {
  it("returns zero cost for local providers", () => {
    expect(resolveUnitCostUsd("api-lexical", "embedding-query")).toBe(0);
    expect(resolveUnitCostUsd("local-hash", "embedding-query")).toBe(0);
    expect(resolveUnitCostUsd("ollama", "llm-inference")).toBe(0);
  });
});
