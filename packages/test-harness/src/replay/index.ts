import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  ExecutionSnapshotSchema,
  ReplayComparisonReportSchema,
  type ExecutionSnapshot,
  type ReplayComparisonResult,
} from "@groundedos/core";

export function captureExecutionSnapshot(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  return ExecutionSnapshotSchema.parse(snapshot);
}

export async function persistExecutionSnapshot(
  snapshot: ExecutionSnapshot,
  filePath: string
): Promise<ExecutionSnapshot> {
  assertNonEmptyString(filePath, "filePath");
  const validated = captureExecutionSnapshot(snapshot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(validated, null, 2), "utf-8");
  return validated;
}

export async function loadExecutionSnapshot(filePath: string): Promise<ExecutionSnapshot> {
  assertNonEmptyString(filePath, "filePath");
  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as unknown;
  return captureExecutionSnapshot(parsed as ExecutionSnapshot);
}

export async function replayExecution(
  snapshot: ExecutionSnapshot,
  executor: (input: ExecutionSnapshot) => Promise<ExecutionSnapshot>
): Promise<ReplayComparisonResult> {
  const original = captureExecutionSnapshot(snapshot);
  const replayed = captureExecutionSnapshot(await executor(original));
  return compareReplayResults(original, replayed);
}

export function compareReplayResults(
  original: ExecutionSnapshot,
  replay: ExecutionSnapshot
): ReplayComparisonResult {
  const validatedOriginal = captureExecutionSnapshot(original);
  const validatedReplay = captureExecutionSnapshot(replay);
  const originalChunkIds = new Set(validatedOriginal.chunks.map((item) => item.chunkId));
  const replayChunkIds = new Set(validatedReplay.chunks.map((item) => item.chunkId));
  const addedChunkIds = [...replayChunkIds].filter((item) => !originalChunkIds.has(item));
  const removedChunkIds = [...originalChunkIds].filter((item) => !replayChunkIds.has(item));
  const reorderedChunkIds = validatedOriginal.chunks
    .filter((item) => validatedReplay.chunks.some((candidate) => candidate.chunkId === item.chunkId))
    .filter((item) => {
      const replayItem = validatedReplay.chunks.find((candidate) => candidate.chunkId === item.chunkId);
      return replayItem?.rank !== item.rank;
    })
    .map((item) => item.chunkId);

  const scoreDeltas = validatedOriginal.chunks
    .filter((item) => validatedReplay.chunks.some((candidate) => candidate.chunkId === item.chunkId))
    .map((item) => {
      const replayItem = validatedReplay.chunks.find((candidate) => candidate.chunkId === item.chunkId);
      const replayScore = replayItem?.score;
      return {
        chunkId: item.chunkId,
        originalScore: item.score,
        replayScore,
        delta: typeof replayScore === "number" ? round(replayScore - item.score, 3) : undefined,
      };
    })
    .filter((item) => item.delta !== 0);

  const responseChanged =
    normalizeWhitespace(validatedOriginal.original.answer.text) !==
    normalizeWhitespace(validatedReplay.original.answer.text);
  const groundednessChanged =
    validatedOriginal.original.answer.grounded !== validatedReplay.original.answer.grounded;
  const modelChanged = validatedOriginal.providers.selectedModel !== validatedReplay.providers.selectedModel;
  const providerChanged =
    validatedOriginal.providers.selectedProvider !== validatedReplay.providers.selectedProvider;
  const embeddingProviderChanged =
    validatedOriginal.providers.embeddingProvider !== validatedReplay.providers.embeddingProvider;
  const chunkOrderChanged = reorderedChunkIds.length > 0;
  const scoresChanged = scoreDeltas.length > 0;
  const retrievalChanged =
    addedChunkIds.length > 0 ||
    removedChunkIds.length > 0 ||
    chunkOrderChanged ||
    scoresChanged ||
    JSON.stringify(validatedOriginal.reranking) !== JSON.stringify(validatedReplay.reranking);

  const status: ReplayComparisonResult["status"] =
    responseChanged ||
    retrievalChanged ||
    groundednessChanged ||
    modelChanged ||
    providerChanged ||
    embeddingProviderChanged
      ? "diverged"
      : "matched";

  const result: ReplayComparisonResult = {
    version: "v1",
    replayId: randomUUID(),
    originalTraceId: validatedOriginal.correlation.traceId,
    createdAt: new Date().toISOString(),
    status,
    original: validatedOriginal,
    replay: validatedReplay,
    differences: {
      responseChanged,
      retrievalChanged,
      chunkOrderChanged,
      scoresChanged,
      groundednessChanged,
      modelChanged,
      providerChanged,
      embeddingProviderChanged,
      costDeltaUsd: round(
        (validatedReplay.original.costUsd ?? 0) - (validatedOriginal.original.costUsd ?? 0),
        6
      ),
      latencyDeltaMs: round(
        (validatedReplay.original.latencyMs ?? 0) - (validatedOriginal.original.latencyMs ?? 0),
        3
      ),
      addedChunkIds,
      removedChunkIds,
      reorderedChunkIds,
      scoreDeltas,
    },
    errors: [],
    summary: [
      responseChanged ? "Answer text changed between original and replay." : "Answer text remained stable.",
      retrievalChanged ? "Retrieved evidence changed." : "Retrieved evidence remained stable.",
      groundednessChanged ? "Groundedness changed." : "Groundedness remained stable.",
      chunkOrderChanged ? "Chunk order changed." : "Chunk order remained stable.",
      scoresChanged ? "Chunk scores changed." : "Chunk scores remained stable.",
      ...(modelChanged ? ["Selected model changed."] : []),
      ...(providerChanged || embeddingProviderChanged ? ["Provider selection changed."] : []),
    ],
  };

  return ReplayComparisonReportSchema.parse(result);
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
