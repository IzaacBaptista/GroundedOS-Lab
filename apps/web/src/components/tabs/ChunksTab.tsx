import { useState } from "react";
import type { Citation, DevModeOutput, DevModeResult, RagAskResponse } from "../../api/types";
import {
  explainCacheHit,
  explainCacheMiss,
  explainCacheSavings,
  explainHybridScores,
  explainNoChunks,
  explainReranking,
} from "../../utils/explanations";
import { ChunkCard } from "../shared/ChunkCard";
import { ExplainBox } from "../shared/ExplainBox";
import { Pill } from "../shared/Pill";

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        marginBottom: "0.75rem",
        color: "var(--color-text-tertiary, var(--muted))",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function CacheStatusBanner({
  cache,
  provider,
  estimatedLatencyMs,
}: {
  cache: Record<string, unknown>;
  provider: string;
  estimatedLatencyMs: number;
}) {
  const hit = Boolean(cache.hit);
  const similarity = typeof cache.similarity === "number" ? cache.similarity : undefined;
  const hits = Number(cache.hits ?? cache.hitCount ?? 0);
  const misses = Number(cache.misses ?? cache.missCount ?? 0);

  if (hit) {
    return (
      <div
        style={{
          display: "grid",
          gap: 6,
          borderRadius: 8,
          marginBottom: "1rem",
          padding: "0.625rem 0.875rem",
          background: "#EAF3DE",
        }}
      >
        <span style={{ color: "#3B6D11", fontSize: 12, fontWeight: 600 }}>
          Cache hit
        </span>
        <span style={{ color: "#3B6D11", fontSize: 12 }}>
          Similarity {similarity?.toFixed(4) ?? "n/a"} — resultado servido do cache, retrieval ignorado
        </span>
        <ExplainBox variant="success" label="o que esse número significa">
          {explainCacheHit(similarity ?? 1, provider, estimatedLatencyMs)}
        </ExplainBox>
        <ExplainBox variant="tip" label="o que o cache economizou">
          {explainCacheSavings(provider, estimatedLatencyMs)}
        </ExplainBox>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 8,
        marginBottom: "1rem",
        padding: "0.625rem 0.875rem",
        background: "#F1EFE8",
      }}
    >
      <span style={{ color: "#444441", fontSize: 12 }}>
        Cache miss — full retrieval pipeline executed · {hits} hits / {misses} misses so far
      </span>
      <ExplainBox label="o que aconteceu">
        {explainCacheMiss(hits, misses)}
      </ExplainBox>
    </div>
  );
}

export function ChunksTab({
  results,
  embeddingProvider,
  chunkCount,
  cache,
  citations,
  rawPayload,
}: {
  results: DevModeResult[];
  embeddingProvider: string;
  chunkCount: number;
  cache?: Record<string, unknown>;
  citations: Citation[];
  rawPayload: unknown;
}) {
  const [copyLabel, setCopyLabel] = useState("Copy JSON");
  const maxScore = Math.max(...results.map((result) => result.score || 0), 0);
  const json = JSON.stringify(rawPayload, null, 2);
  const devMode = extractDevMode(rawPayload);
  const estimatedLatencyMs = extractEstimatedLatency(rawPayload, embeddingProvider);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy JSON"), 1800);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel("Copy JSON"), 1800);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h3 style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>Cache semântico</h3>
        <p style={{ margin: 0, color: "var(--color-text-secondary, var(--muted))", fontSize: 14 }}>
          O sistema guarda resultados de queries anteriores. Quando a nova query é parecida o
          suficiente, serve do cache e evita embedding + retrieval.
        </p>
      </header>

      <SectionLabel>o que foi encontrado — e por quê</SectionLabel>

      {cache && (
        <CacheStatusBanner
          cache={cache}
          provider={embeddingProvider}
          estimatedLatencyMs={estimatedLatencyMs}
        />
      )}

      {devMode && <RetrievalPipelinePanel devMode={devMode} />}

      {results.length === 0 ? (
        <ExplainBox variant="warning">
          {explainNoChunks(chunkCount)}
        </ExplainBox>
      ) : (
        results
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((result) => (
            <ChunkCard
              key={result.chunkId}
              chunk={result}
              maxScore={maxScore}
              embeddingProvider={embeddingProvider}
              citations={citations}
            />
          ))
      )}

      <details style={{ marginTop: "0.5rem" }}>
        <summary
          style={{
            cursor: "pointer",
            color: "var(--color-text-secondary, var(--muted))",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Dev Mode JSON
        </summary>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void handleCopy()}
          style={{ marginTop: 10 }}
        >
          {copyLabel}
        </button>
        <pre className="dev-mode__raw" style={{ marginTop: 10 }}>
          {json}
        </pre>
      </details>
    </div>
  );
}

function extractDevMode(payload: unknown): DevModeOutput | undefined {
  const maybeResponse = payload as Partial<RagAskResponse> | undefined;

  if (maybeResponse?.devMode?.results) {
    return maybeResponse.devMode;
  }

  const maybeDevMode = payload as Partial<DevModeOutput> | undefined;
  return maybeDevMode?.results ? (maybeDevMode as DevModeOutput) : undefined;
}

function RetrievalPipelinePanel({ devMode }: { devMode: DevModeOutput }) {
  const hybrid = devMode.hybrid;
  const reranking = devMode.reranking;

  if (!hybrid && !reranking) {
    return null;
  }

  const hybridCandidates = hybrid?.candidates ?? [];
  const rerankCandidates = reranking?.candidates ?? [];
  const hybridRankOne = hybridCandidates.find((candidate) => candidate.hybridRank === 1);
  const finalRankOne = rerankCandidates.find((candidate) => candidate.afterRank === 1);

  return (
    <section
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.875rem 1rem",
        background: "var(--color-background-primary, var(--panel))",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>Retrieval pipeline</strong>
        {hybrid && (
          <>
            <Pill variant="teal">hybrid search</Pill>
            <Pill variant="gray">dense {(hybrid.denseWeight * 100).toFixed(0)}%</Pill>
            <Pill variant="gray">sparse {(hybrid.sparseWeight * 100).toFixed(0)}%</Pill>
          </>
        )}
        {reranking?.applied && <Pill variant="blue">re-ranking</Pill>}
      </div>

      {hybridCandidates.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <SectionLabel>dense + sparse → combined score</SectionLabel>
          {hybridCandidates.slice(0, 6).map((candidate) => (
            <div key={candidate.chunkId}>
              <ScoreBreakdownRow
                label={`${candidate.sectionId} · dense #${candidate.denseRank} → hybrid #${candidate.hybridRank}`}
                scores={[
                  { label: "dense", value: candidate.denseScore },
                  { label: "sparse", value: candidate.sparseScore },
                  { label: "combined", value: candidate.combinedScore },
                ]}
              />
              <ExplainBox label="por que esses sinais importam">
                {explainHybridScores(
                  candidate.denseScore,
                  candidate.sparseScore,
                  candidate.combinedScore
                )}
              </ExplainBox>
            </div>
          ))}
        </div>
      )}

      {rerankCandidates.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <SectionLabel>combined → reranked final order</SectionLabel>
          {rerankCandidates.map((candidate) => (
            <ScoreBreakdownRow
              key={`${candidate.chunkId}-rerank`}
              label={`${candidate.sectionId} · hybrid #${candidate.beforeRank} → final #${candidate.afterRank}`}
              scores={[
                { label: "hybrid", value: candidate.hybridScore },
                { label: "overlap", value: candidate.lexicalOverlapScore },
                { label: "final", value: candidate.finalScore },
              ]}
            />
          ))}
        </div>
      )}

      {hybridRankOne && finalRankOne && hybridRankOne.chunkId !== finalRankOne.chunkId && (
        <ExplainBox
          variant="warning"
          label="efeito do re-ranking"
        >
          {explainReranking(
            hybridRankOne.chunkId,
            finalRankOne.chunkId,
            finalRankOne.hybridScore,
            finalRankOne.finalScore
          )}
        </ExplainBox>
      )}
    </section>
  );
}

function extractEstimatedLatency(payload: unknown, provider: string): number {
  const maybe = payload as { devMode?: { workflow?: { totalDurationMs?: number } } } | undefined;
  const total = maybe?.devMode?.workflow?.totalDurationMs;

  if (typeof total === "number" && total > 0) {
    return total;
  }

  if (provider === "ollama") {
    return 1000;
  }

  return 25;
}

function ScoreBreakdownRow({
  label,
  scores,
}: {
  label: string;
  scores: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...scores.map((score) => score.value), 1);

  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        borderTop: "1px solid var(--color-border-tertiary, var(--line))",
        paddingTop: 8,
      }}
    >
      <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
        {label}
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {scores.map((score) => (
          <div
            key={score.label}
            style={{
              display: "grid",
              gridTemplateColumns: "72px minmax(0, 1fr) 58px",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--color-text-secondary, var(--muted))" }}>
              {score.label}
            </span>
            <span
              aria-hidden="true"
              style={{
                height: 7,
                borderRadius: 999,
                background: "var(--color-background-secondary, #f1efe8)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${Math.max(3, Math.round((score.value / max) * 100))}%`,
                  borderRadius: "inherit",
                  background: "linear-gradient(90deg, var(--accent), var(--accent-strong))",
                }}
              />
            </span>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>
              {score.value.toFixed(3)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
