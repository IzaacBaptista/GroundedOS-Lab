/**
 * WorkflowRunner — lightweight sequential step executor (Concept 3 — Phase 2).
 *
 * Responsibilities:
 *   - Execute a list of WorkflowSteps in order
 *   - Track status and wall-clock duration per step
 *   - Stop on the first failure (retry policy is Phase 3+)
 *   - Emit a WorkflowResult with the full context for Dev Mode
 */
import type { WorkflowResult, WorkflowStep } from "./types";
export declare class WorkflowRunner<TOutput = unknown> {
    private readonly steps;
    private readonly workflowId;
    constructor(steps: WorkflowStep[], workflowId?: string);
    /**
     * Run all steps in sequence.
     *
     * @param initialInput – the value passed to the first step
     * @param extraMetadata – optional initial metadata to pre-populate the context
     */
    run(initialInput: unknown, extraMetadata?: Record<string, unknown>): Promise<WorkflowResult<TOutput>>;
}
