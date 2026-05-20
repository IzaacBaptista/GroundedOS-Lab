import {
  ExecutionSnapshotSchema,
  type ExecutionSnapshot,
  type ReplayComparisonReport,
} from "@groundedos/core";
import { compareReplaySnapshots } from "../../../../apps/api/src/retrieval-reliability";

export function captureExecutionSnapshot(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  return ExecutionSnapshotSchema.parse(snapshot);
}

export async function replayExecution<T>(
  snapshot: ExecutionSnapshot,
  executor: (input: ExecutionSnapshot) => Promise<T>
): Promise<T> {
  const validated = captureExecutionSnapshot(snapshot);
  return await executor(validated);
}

export function compareReplayResults(
  original: ExecutionSnapshot,
  replay: ExecutionSnapshot
): ReplayComparisonReport {
  return compareReplaySnapshots({
    original: captureExecutionSnapshot(original),
    replay: captureExecutionSnapshot(replay),
    originalAnswer: {
      text: original.original.answer.text,
      grounded: original.original.answer.grounded,
    },
    replayAnswer: {
      text: replay.original.answer.text,
      grounded: replay.original.answer.grounded,
    },
    originalCostUsd: original.original.costUsd,
    replayCostUsd: replay.original.costUsd,
    originalLatencyMs: original.original.latencyMs,
    replayLatencyMs: replay.original.latencyMs,
  });
}
