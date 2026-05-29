export const STREAM_EVENT_TYPES = [
  "retrieval_started",
  "retrieval_completed",
  "reranking_completed",
  "generation_started",
  "token",
  "citation",
  "reasoning_summary",
  "tool_call_started",
  "tool_call_completed",
  "critique_started",
  "critique_completed",
  "queued",
  "started",
  "progress",
  "retry",
  "step_started",
  "observation",
  "handoff",
  "planning_updates",
  "eval_progress",
  "sample_completed",
  "metric_updates",
  "completed",
  "error",
] as const;

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export interface StreamChunk {
  text: string;
  index: number;
}

export interface PartialAnswer {
  text: string;
  citations: Array<{ chunkId: string; documentId: string; sectionId: string }>;
}

export interface RealtimeTrace {
  eventId: string;
  scope: string;
  timestamp: string;
  type: StreamEventType;
  payload: Record<string, unknown>;
}

export interface StreamEvent {
  type: StreamEventType;
  timestamp: string;
  sequence: number;
  payload: Record<string, unknown>;
}

export interface StreamLifecycle {
  streamId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "error" | "cancelled";
}
