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
  });
}
