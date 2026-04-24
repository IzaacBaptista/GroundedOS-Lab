import { describe, it, expect, vi } from "vitest";
import { WorkflowRunner } from "./runner";
import type { WorkflowStep, WorkflowContext } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(
  name: string,
  fn: (input: unknown, ctx: WorkflowContext) => Promise<unknown>
): WorkflowStep {
  return { name, run: fn };
}

function successStep(name: string, output: unknown): WorkflowStep {
  return makeStep(name, async () => output);
}

function failingStep(name: string, message: string): WorkflowStep {
  return makeStep(name, async () => {
    throw new Error(message);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkflowRunner", () => {
  it("throws when constructed with no steps", () => {
    expect(() => new WorkflowRunner([])).toThrow();
  });

  it("runs a single step successfully", async () => {
    const runner = new WorkflowRunner([successStep("step-1", "hello")]);
    const result = await runner.run(null);

    expect(result.status).toBe("success");
    expect(result.output).toBe("hello");
    expect(result.context.steps["step-1"]?.status).toBe("success");
    expect(result.context.steps["step-1"]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("runs steps in order and passes output between them", async () => {
    const order: string[] = [];

    const steps: WorkflowStep[] = [
      makeStep("step-a", async (input) => {
        order.push("step-a");
        return `${input}-a`;
      }),
      makeStep("step-b", async (input) => {
        order.push("step-b");
        return `${input}-b`;
      }),
      makeStep("step-c", async (input) => {
        order.push("step-c");
        return `${input}-c`;
      }),
    ];

    const runner = new WorkflowRunner(steps);
    const result = await runner.run("start");

    expect(order).toEqual(["step-a", "step-b", "step-c"]);
    expect(result.status).toBe("success");
    expect(result.output).toBe("start-a-b-c");
  });

  it("stops on the first failure and records the error", async () => {
    const steps: WorkflowStep[] = [
      successStep("step-1", "ok"),
      failingStep("step-2", "boom"),
      successStep("step-3", "never"),
    ];

    const runner = new WorkflowRunner(steps);
    const result = await runner.run(null);

    expect(result.status).toBe("failed");
    expect(result.output).toBeUndefined();
    expect(result.context.steps["step-1"]?.status).toBe("success");
    expect(result.context.steps["step-2"]?.status).toBe("failed");
    expect(result.context.steps["step-2"]?.error).toBe("boom");
    expect(result.context.steps["step-3"]?.status).toBe("skipped");
  });

  it("records durationMs for each step", async () => {
    const runner = new WorkflowRunner([
      successStep("quick-step", 42),
    ]);

    const result = await runner.run(null);
    const stepRecord = result.context.steps["quick-step"];

    expect(typeof stepRecord?.durationMs).toBe("number");
    expect(stepRecord?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("exposes totalDurationMs in the result", async () => {
    const runner = new WorkflowRunner([successStep("fast", null)]);
    const result = await runner.run(null);

    expect(typeof result.totalDurationMs).toBe("number");
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("populates initial metadata when supplied", async () => {
    const runner = new WorkflowRunner([
      makeStep("check-meta", async (_input, ctx) => ctx.metadata["key"]),
    ]);

    const result = await runner.run(null, { key: "value-from-caller" });
    expect(result.output).toBe("value-from-caller");
  });

  it("steps can write to context.metadata and subsequent steps can read it", async () => {
    const steps: WorkflowStep[] = [
      makeStep("writer", async (_input, ctx) => {
        ctx.metadata["shared"] = "written";
        return "ignored";
      }),
      makeStep("reader", async (_input, ctx) => {
        return ctx.metadata["shared"];
      }),
    ];

    const runner = new WorkflowRunner(steps);
    const result = await runner.run(null);

    expect(result.status).toBe("success");
    expect(result.output).toBe("written");
  });

  it("workflowId is stable across the run", async () => {
    const capturedIds: string[] = [];

    const steps: WorkflowStep[] = [
      makeStep("s1", async (_input, ctx) => {
        capturedIds.push(ctx.workflowId);
        return null;
      }),
      makeStep("s2", async (_input, ctx) => {
        capturedIds.push(ctx.workflowId);
        return null;
      }),
    ];

    const runner = new WorkflowRunner(steps, "fixed-id");
    await runner.run(null);

    expect(capturedIds).toHaveLength(2);
    expect(capturedIds[0]).toBe("fixed-id");
    expect(capturedIds[1]).toBe("fixed-id");
  });
});
