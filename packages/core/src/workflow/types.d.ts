/**
 * Types for the lightweight Workflow Engine (Concept 3 — Phase 2).
 *
 * A Workflow is an ordered sequence of named Steps with explicit state
 * transitions, per-step durations, and a shared context object.  Every
 * pipeline in GroundedOS Lab (RAG ask, agent flow, eval run) is modelled
 * as a Workflow so that Dev Mode can expose a step-by-step execution trace.
 */
/** Lifecycle state of a single workflow step. */
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";
/**
 * A single typed step in a workflow.
 *
 * @template TInput  – type the step receives as input
 * @template TOutput – type the step emits as output
 */
export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
    /** Unique name within the workflow (used as the key in WorkflowContext.steps). */
    name: string;
    /** Execute the step. Receives the output of the previous step and the shared context. */
    run(input: TInput, context: WorkflowContext): Promise<TOutput>;
}
/** Per-step runtime information accumulated during a workflow run. */
export interface WorkflowStepRecord {
    status: StepStatus;
    /** Wall-clock duration in milliseconds, populated on completion or failure. */
    durationMs?: number;
    /** Serialisable error message when status is "failed". */
    error?: string;
}
/**
 * Shared mutable context passed to every step in the workflow.
 * Steps may read and write `metadata` to share intermediate results.
 */
export interface WorkflowContext {
    /** Unique run identifier (UUID recommended). */
    workflowId: string;
    /** Unix timestamp (ms) when the run started. */
    startedAt: number;
    /** Live step records keyed by step name. */
    steps: Record<string, WorkflowStepRecord>;
    /** Arbitrary key-value bag for inter-step communication. */
    metadata: Record<string, unknown>;
}
/** Final result returned by WorkflowRunner.run(). */
export interface WorkflowResult<TOutput = unknown> {
    workflowId: string;
    status: "success" | "failed";
    /** Present when status is "success". */
    output?: TOutput;
    context: WorkflowContext;
    totalDurationMs: number;
}
