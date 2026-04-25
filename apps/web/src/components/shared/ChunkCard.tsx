import type { Citation, DevModeResult } from "../../api/types";
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

function providerExplanation(provider: string): string {
  if (provider === "ollama") {
    return "Ollama usa similaridade semântica: duas frases podem combinar mesmo sem repetir as mesmas palavras, porque o embedding captura significado.";
  }

  if (provider === "api-lexical" || provider === "local-hash") {
    return `${provider} usa uma estratégia lexical baseada em tokens. Ela é rápida e local, mas perde relações semânticas quando as palavras não se repetem.`;
  }

  return `${provider} gerou o vetor usado para comparar a query com este chunk. O score vem dessa comparação.`;
}

function scoreExplanation({
  score,
  provider,
  rank,
  isCited,
}: {
  score: number;
  provider: string;
  rank: number;
  isCited: boolean;
}) {
  if (score === 0) {
    return `Score zero significa que este chunk não teve sobreposição lexical relevante ou similaridade suficiente para a query. ${providerExplanation(provider)}`;
  }

  if (score > 0.4) {
    return `Score alto: os sinais deste chunk batem forte com a pergunta, por isso ele ficou no topo da recuperação. ${providerExplanation(provider)}${rank === 1 && isCited ? " Este chunk também foi citado, então ele produziu a resposta final." : ""}`;
  }

  return `Score intermediário: este chunk tem algum sinal útil, mas é menos direto que os primeiros resultados. ${providerExplanation(provider)}`;
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

      <ExplainBox>
        {scoreExplanation({
          score: chunk.score,
          provider: embeddingProvider,
          rank: chunk.rank,
          isCited,
        })}
      </ExplainBox>

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
