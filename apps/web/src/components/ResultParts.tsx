import { useState } from "react";
import type {
  DevModeResult,
  ChunkOffsets,
} from "../api/types";
import {
  formatOffsets,
  formatScore,
  getScoreBadgeClass,
  scoreToPercent,
  toNormalizedPercent,
  truncateChunkId,
} from "../utils/format";

/**
 * Fallback when no chunks are supplied.
 */
function EmptyRow() {
  return <p className="chunk-text">None.</p>;
}

export function CitationsList({
  citations,
}: {
  citations: ReadonlyArray<{
    chunkId: string;
    score: number;
    source: { sourceType?: string; originalFilename?: string };
    offsets: ChunkOffsets;
  }>;
}) {
  if (citations.length === 0) {
    return <EmptyRow />;
  }

  return (
    <>
      {citations.map((citation) => (
        <article key={citation.chunkId} className="result-row">
          <div className="result-row__pills">
            <span className="pill pill--id" title={citation.chunkId}>
              {truncateChunkId(citation.chunkId, 24)}
            </span>
            <span className={`pill pill--score ${getScoreBadgeClass(citation.score)}`}>
              ↑ {formatScore(citation.score)}
            </span>
            <span className="pill pill--source">
              {citation.source?.originalFilename ??
                citation.source?.sourceType ??
                "source"}
            </span>
            <span className="pill pill--offsets">
              {formatOffsets(citation.offsets)}
            </span>
          </div>
        </article>
      ))}
    </>
  );
}

export function ChunksList({
  results,
}: {
  results: ReadonlyArray<DevModeResult>;
}) {
  if (results.length === 0) {
    return <EmptyRow />;
  }

  const maxScore = Math.max(...results.map((item) => item.score || 0), 0);

  return (
    <>
      {results.map((chunk) => (
        <ChunkRow key={chunk.chunkId} chunk={chunk} maxScore={maxScore} />
      ))}
    </>
  );
}

function ChunkRow({
  chunk,
  maxScore,
}: {
  chunk: DevModeResult;
  maxScore: number;
}) {
  const metaItems = [
    `rank ${chunk.rank}`,
    truncateChunkId(chunk.chunkId, 24),
    `section ${chunk.sectionId}`,
    `${(chunk.text || "").length} chars`,
  ];
  const normalizedPercent = toNormalizedPercent(chunk.score, maxScore);

  return (
    <article className="result-row">
      <div className="result-row__meta">
        {metaItems.map((value, i) => (
          <span key={i}>{value}</span>
        ))}
      </div>
      <div className="chunk-score-container">
        <div className="score-bar">
          <span
            style={
              {
                ["--score-width" as string]: `${scoreToPercent(chunk.score)}%`,
              } as React.CSSProperties
            }
          />
        </div>
        <div className="score-label">
          Relevance: {formatScore(chunk.score)} ({normalizedPercent}% max)
        </div>
      </div>
      <p className="chunk-text">{chunk.text || ""}</p>
      <div className="chunk-offsets">
        <details className="chunk-offsets-details">
          <summary>Chunk metadata</summary>
          <div className="chunk-offsets-list">
            <p className="chunk-meta-line">
              Offsets: {formatOffsets(chunk.offsets) || "n/a"}
            </p>
            <p className="chunk-meta-line">
              Document: {chunk.documentId || "n/a"}
            </p>
            <p className="chunk-meta-line">
              Chunk: {chunk.chunkId || "n/a"}
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}

type JsonValue = unknown;

/**
 * Recursive JSON-tree renderer that expands the first two levels and hides
 * deeper structure behind <details>. Mirrors the vanilla `renderJsonTree`.
 */
export function JsonTree({ value, depth = 0 }: { value: JsonValue; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="json-tree-value json-tree-value--null">null</span>;
  }

  if (typeof value !== "object") {
    return (
      <span className={`json-tree-value json-tree-value--${typeof value}`}>
        {JSON.stringify(value)}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="json-tree-value json-tree-value--null">[]</span>;
    }

    return (
      <details className="json-tree-node" open={depth < 2}>
        <summary>{`[${value.length} items]`}</summary>
        <div className="json-tree-items">
          {value.map((item, index) => (
            <div className="json-tree-item" key={index}>
              <span className="json-tree-key">{`[${index}]`}</span>
              <div>
                <JsonTree value={item} depth={depth + 1} />
              </div>
            </div>
          ))}
        </div>
      </details>
    );
  }

  const entries = Object.entries(value as Record<string, JsonValue>);

  if (entries.length === 0) {
    return <span className="json-tree-value json-tree-value--null">{"{}"}</span>;
  }

  return (
    <details className="json-tree-node" open={depth < 2}>
      <summary>{`{${entries.length} keys}`}</summary>
      <div className="json-tree-items">
        {entries.map(([key, child]) => (
          <div className="json-tree-item" key={key}>
            <span className="json-tree-key">{`"${key}"`}</span>
            <div>
              <JsonTree value={child} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

export function DevModeBlock({ payload }: { payload: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const json = JSON.stringify(payload, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy"), 2000);
    } catch {
      window.alert("Failed to copy JSON.");
    }
  };

  return (
    <details className="dev-mode">
      <summary>
        <div className="dev-mode__header">
          <span>Dev Mode JSON</span>
          <button
            type="button"
            className="dev-mode__copy-button"
            onClick={(event) => {
              event.preventDefault();
              void handleCopy();
            }}
            title="Copy JSON to clipboard"
          >
            {copyLabel}
          </button>
        </div>
      </summary>
      {!showRaw && (
        <div className="json-tree">
          <JsonTree value={payload} />
        </div>
      )}
      <div className="dev-mode__raw-toggle">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowRaw((current) => !current)}
          title="Toggle raw JSON view"
        >
          {showRaw ? "Tree View" : "Raw JSON"}
        </button>
      </div>
      {showRaw && <pre className="dev-mode__raw">{json}</pre>}
    </details>
  );
}
