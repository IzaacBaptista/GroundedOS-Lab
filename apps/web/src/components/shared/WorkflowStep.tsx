import { ExplainBox } from "./ExplainBox";

export const STEP_EXPLANATIONS: Record<string, string> = {
  "normalize-request": "Validated input fields and applied defaults (topK, provider, sessionId).",
  "ingest-document": "ETL pipeline extracted sections into a NormalizedDocument with lineage and SHA-256 checksum.",
  "process-query": "Rewrote and expanded query tokens, then detected intent for retrieval optimization.",
  "semantic-cache": "Checked cache for a semantically similar previous query on this document.",
  "build-index": "Chunked the document, embedded each chunk, and stored vectors in InMemoryVectorStore.",
  "retrieve-chunks": "Computed similarity between query embedding and chunk embeddings, then returned top-K.",
  rerank: "Applied a secondary scoring pass to reorder chunks by relevance signal.",
  "rerank-chunks": "Applied a secondary scoring pass to reorder chunks by relevance signal.",
  "build-answer": "Constructed an extractive answer from top chunks, keeping the answer tied to source text.",
};

const STATUS_COLORS: Record<string, string> = {
  success: "#1D9E75",
  completed: "#1D9E75",
  failed: "#B3342B",
  error: "#B3342B",
  running: "#EF9F27",
  pending: "#888780",
};

export function WorkflowStep({
  name,
  status,
  durationMs,
  error,
}: {
  name: string;
  status: string;
  durationMs?: number;
  error?: string;
}) {
  const color = STATUS_COLORS[status.toLowerCase()] ?? "#888780";
  const explanation = STEP_EXPLANATIONS[name] ?? `Pipeline step "${name}" reported status "${status}".`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "10px minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "start",
        borderBottom: "0.5px solid var(--color-border-tertiary, var(--line))",
        padding: "0.75rem 0",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          marginTop: 4,
        }}
      />
      <div>
        <div style={{ color: "var(--color-text-primary, var(--text))", fontSize: 13, fontWeight: 600 }}>
          {name}
        </div>
        <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 11, lineHeight: 1.45 }}>
          {explanation}
        </div>
        {error && <ExplainBox variant="warning">{error}</ExplainBox>}
      </div>
      <span style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
        {durationMs === undefined ? "n/a" : `${durationMs.toFixed(1)} ms`}
      </span>
    </div>
  );
}
