/**
 * WorkflowRunner — lightweight sequential step executor (Concept 3 — Phase 2).
 *
 * Responsibilities:
 *   - Execute a list of WorkflowSteps in order
 *   - Track status and wall-clock duration per step
 *   - Stop on the first failure (retry policy is Phase 3+)
 *   - Emit a WorkflowResult with the full context for Dev Mode
 */

import { randomUUID } from "crypto";
import type {
  WorkflowContext,
  WorkflowResult,
  WorkflowStep,
} from "./types";

const ERROR_PREFIX = "[core/workflow]";

export class WorkflowRunner<TOutput = unknown> {
  private readonly steps: WorkflowStep[];
  private readonly workflowId: string;

  constructor(steps: WorkflowStep[], workflowId?: string) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error(`${ERROR_PREFIX} WorkflowRunner requires at least one step.`);
    }

    this.steps = steps;
    this.workflowId = workflowId ?? randomUUID();
  }

  /**
   * Run all steps in sequence.
   *
   * @param initialInput – the value passed to the first step
   * @param extraMetadata – optional initial metadata to pre-populate the context
   */
  async run(
    initialInput: unknown,
    extraMetadata: Record<string, unknown> = {}
  ): Promise<WorkflowResult<TOutput>> {
    const startedAt = Date.now();

    const context: WorkflowContext = {
      workflowId: this.workflowId,
      startedAt,
      steps: {},
      metadata: { ...extraMetadata },
    };

    // Pre-populate all steps as "pending"
    for (const step of this.steps) {
      context.steps[step.name] = { status: "pending" };
    }

    let current: unknown = initialInput;

    for (const step of this.steps) {
      const stepStart = Date.now();
      context.steps[step.name]!.status = "running";

      try {
        current = await step.run(current, context);
        context.steps[step.name]!.status = "success";
        context.steps[step.name]!.durationMs = Date.now() - stepStart;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        context.steps[step.name]!.status = "failed";
        context.steps[step.name]!.durationMs = Date.now() - stepStart;
        context.steps[step.name]!.error = message;

        // Mark remaining steps as skipped
        let reached = false;

        for (const s of this.steps) {
          if (reached) {
            context.steps[s.name]!.status = "skipped";
          }

          if (s.name === step.name) {
            reached = true;
          }
        }

        return {
          workflowId: this.workflowId,
          status: "failed",
          context,
          totalDurationMs: Date.now() - startedAt,
        };
      }
    }

    return {
      workflowId: this.workflowId,
      status: "success",
      output: current as TOutput,
      context,
      totalDurationMs: Date.now() - startedAt,
    };
  }
}
