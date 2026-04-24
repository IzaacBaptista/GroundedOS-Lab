import type { ChunkOffsets } from "../api/types";

export function formatScore(score: number | undefined): string {
  return typeof score === "number" ? score.toFixed(4) : "0.0000";
}

export function scoreToPercent(score: number | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

export function toNormalizedPercent(
  score: number | undefined,
  maxScore: number
): number {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return 0;
  }

  if (!(maxScore > 0)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

export function formatOffsets(offsets: ChunkOffsets | undefined): string {
  if (!offsets) {
    return "";
  }

  return `${offsets.offsetBasis}:${offsets.startOffset}-${offsets.endOffset}`;
}

export function truncateChunkId(chunkId: string | undefined, maxLength = 20): string {
  if (!chunkId || chunkId.length <= maxLength) {
    return chunkId ?? "";
  }

  const prefix = "…";
  return prefix + chunkId.slice(-(maxLength - prefix.length));
}

export function getScoreBadgeClass(score: number | undefined): string {
  const value = typeof score === "number" ? score : 0;

  if (value >= 0.5) return "pill--score-high";
  if (value >= 0.2) return "pill--score-medium";
  return "pill--score-low";
}
