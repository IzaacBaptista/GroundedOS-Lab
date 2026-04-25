import type { Citation, DevModeResult } from "../../api/types";
import { explainQueryReformulation, explainScore } from "../../utils/explanations";
import { ExplainBox } from "./ExplainBox";
import { Pill } from "./Pill";
import { RankBadge } from "./RankBadge";
import { ScoreBar } from "./ScoreBar";

function rankColor(rank: number): string {
  if (rank === 1) {
    return "#1D9E75";
  }

  if (rank === 2) {
    return "#378ADD";
  }

  return "#B4B2A9";
}

function relevanceLabel(score: number): { label: string; variant: "green" | "blue" | "gray" } {
  if (score > 0.4) {
    return { label: "melhor match", variant: "green" };
  }

  if (score > 0) {
    return { label: "match parcial", variant: "blue" };
  }

  return { label: "baixa relevância", variant: "gray" };
}

export function ChunkCard({
  chunk,
  maxScore,
  embeddingProvider,
  citations,
}: {
  chunk: DevModeResult;
  maxScore: number;
  embeddingProvider: string;
  citations: Citation[];
}) {
  const color = rankColor(chunk.rank);
  const relevance = relevanceLabel(chunk.score);
  const isCited = citations.some((citation) => citation.chunkId === chunk.chunkId);
  const reformulation = explainQueryReformulation(chunk.score, embeddingProvider);
  const dimensions = (chunk as DevModeResult & { embedding?: { dimensions?: number } }).embedding
    ?.dimensions;

  return (
    <article
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "0.875rem 1rem",
        background: "var(--color-background-primary, var(--panel))",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <RankBadge rank={chunk.rank} />
        <Pill variant={relevance.variant}>{relevance.label}</Pill>
        <span style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
          {chunk.sectionId} · {chunk.text.length} chars · offsets {chunk.offsets.startOffset}–
          {chunk.offsets.endOffset}
        </span>
        <span style={{ flex: "1 1 auto" }} />
        <Pill variant="gray">{embeddingProvider}</Pill>
      </div>

      <ScoreBar score={chunk.score} maxScore={maxScore} color={color} />

      <p
        style={{
          margin: "0.875rem 0 0",
          color: "var(--color-text-secondary, var(--muted))",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        “{chunk.text}”
      </p>

      <ExplainBox
        variant={chunk.score > 0.4 ? "success" : chunk.score < 0.2 ? "warning" : "default"}
        label="o que esse score significa"
      >
        {explainScore(chunk.score, maxScore, embeddingProvider)}
        {chunk.rank === 1 && isCited
          ? " Como este chunk também foi citado, ele produziu a resposta final."
          : ""}
      </ExplainBox>

      {reformulation && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary style={{ cursor: "pointer", color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
            Quando reformular a query
          </summary>
          <ExplainBox variant="tip" label="quando reformular a query">
            {reformulation}
          </ExplainBox>
        </details>
      )}

      <details style={{ marginTop: "0.75rem" }}>
        <summary style={{ cursor: "pointer", color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
          Chunk metadata
        </summary>
        <div style={{ marginTop: 8, color: "var(--color-text-secondary, var(--muted))", fontSize: 12, lineHeight: 1.6 }}>
          <div>chunkId: {chunk.chunkId}</div>
          <div>sectionId: {chunk.sectionId}</div>
          <div>documentId: {chunk.documentId}</div>
          <div>startOffset: {chunk.offsets.startOffset}</div>
          <div>endOffset: {chunk.offsets.endOffset}</div>
          <div>dimensions: {dimensions ?? "not included in this response"}</div>
        </div>
      </details>
    </article>
  );
}
