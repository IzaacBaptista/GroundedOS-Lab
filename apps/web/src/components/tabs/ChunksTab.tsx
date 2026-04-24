import { useState } from "react";
import type { Citation, DevModeResult } from "../../api/types";
import { ChunkCard } from "../shared/ChunkCard";
import { ExplainBox } from "../shared/ExplainBox";

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
