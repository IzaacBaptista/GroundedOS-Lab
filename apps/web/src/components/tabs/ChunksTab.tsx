import { useState } from "react";
import type { Citation, DevModeOutput, DevModeResult, RagAskResponse } from "../../api/types";
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

function CacheStatusBanner({ cache }: { cache: Record<string, unknown> }) {
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
          Similarity {similarity?.toFixed(4) ?? "n/a"} — result served from semantic cache, retrieval skipped
        </span>
        <ExplainBox>
          Semantic cache stores previous results and reuses them when a new query is similar enough. That avoids embedding and retrieval work for repeated questions.
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
      <ExplainBox>
        A miss means no previous query was similar enough, so GroundedOS embedded the query and searched the vector index normally.
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
      <SectionLabel>o que foi encontrado — e por quê</SectionLabel>

      {cache && <CacheStatusBanner cache={cache} />}

      {devMode && <RetrievalPipelinePanel devMode={devMode} />}

      {results.length === 0 ? (
        <ExplainBox variant="warning">
          Nenhum chunk foi recuperado. Isso normalmente significa que a query não teve sinal suficiente no índice de {chunkCount} chunks.
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
            <ScoreBreakdownRow
              key={candidate.chunkId}
              label={`${candidate.sectionId} · dense #${candidate.denseRank} → hybrid #${candidate.hybridRank}`}
              scores={[
                { label: "dense", value: candidate.denseScore },
                { label: "sparse", value: candidate.sparseScore },
                { label: "combined", value: candidate.combinedScore },
              ]}
            />
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

      <ExplainBox>
        Hybrid retrieval first blends semantic/dense similarity with sparse lexical signal. Re-ranking then reorders the candidates using direct query overlap so the final answer is grounded in the most answer-like chunks.
      </ExplainBox>
    </section>
  );
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
