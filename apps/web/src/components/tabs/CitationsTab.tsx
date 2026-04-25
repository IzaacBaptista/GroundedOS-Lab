import type { Citation } from "../../api/types";
import {
  explainCitationGrounding,
  explainCitationPosition,
  explainExtractiveAnswer,
  explainNoCitations,
} from "../../utils/explanations";
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

function truncate(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function sourceLabel(source: Citation["source"]): string {
  return source.originalFilename ?? source.sourceType ?? "source";
}

export function CitationsTab({
  citations,
  documentTitle,
  answerText,
}: {
  citations: Citation[];
  documentTitle: string;
  answerText: string;
}) {
  const totalChars = Math.max(...citations.map((citation) => citation.offsets.endOffset ?? 0), 1);

  return (
    <div>
      <header style={{ display: "grid", gap: 4, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>Citações e grounding</h3>
        <p style={{ margin: 0, color: "var(--color-text-secondary, var(--muted))", fontSize: 14 }}>
          Grounding significa que toda resposta tem origem rastreável. Esta aba mostra exatamente
          de onde, no documento, veio cada trecho.
        </p>
      </header>

      <SectionLabel>de onde veio a resposta</SectionLabel>

      {citations.length === 0 ? (
        <ExplainBox variant="warning">
          {explainNoCitations()}
        </ExplainBox>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {citations.map((citation) => (
              <span key={citation.chunkId} style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                <Pill variant="teal" title={citation.chunkId}>
                  chunk {truncate(citation.chunkId, 22)}
                </Pill>
                <Pill variant={citation.score > 0.4 ? "green" : "blue"}>
                  score {citation.score.toFixed(4)}
                </Pill>
                <Pill variant="gray">{sourceLabel(citation.source)}</Pill>
                <Pill variant="amber">
                  chars {citation.offsets.startOffset}–{citation.offsets.endOffset}
                </Pill>
              </span>
            ))}
          </div>

          <ExplainBox variant="success" label="o que grounding significa">
            {citations
              .map((citation) =>
                explainCitationGrounding(
                  citation.chunkId,
                  sourceLabel(citation.source),
                  citation.offsets.startOffset,
                  citation.offsets.endOffset
                )
              )
              .join(" ")}
          </ExplainBox>

          <section
            style={{
              border: "0.5px solid var(--color-border-tertiary, var(--line))",
              borderRadius: 8,
              marginTop: "1rem",
              padding: "1rem",
              background: "var(--color-background-primary, var(--panel))",
            }}
          >
            <h3 style={{ textTransform: "none", fontSize: 14, marginBottom: 12 }}>
              Trecho original no documento · {documentTitle}
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {citations.map((citation) => {
                const start = Math.max(0, citation.offsets.startOffset);
                const end = Math.max(start, citation.offsets.endOffset ?? start);
                const left = Math.min(100, (start / totalChars) * 100);
                const width = Math.max(2, Math.min(100 - left, ((end - start) / totalChars) * 100));

                return (
                  <article key={citation.chunkId}>
                    <div
                      aria-label={`document position ${start} to ${end}`}
                      style={{
                        position: "relative",
                        height: 10,
                        borderRadius: 999,
                        background: "#F1EFE8",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: `${left}%`,
                          width: `${width}%`,
                          height: "100%",
                          background: "#1D9E75",
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 6, color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
                      chars {start}–{end} of ~{totalChars} total
                    </div>
                    <ExplainBox label="posição no documento">
                      {explainCitationPosition(start, totalChars)}
                    </ExplainBox>
                  </article>
                );
              })}
            </div>

            <pre
              style={{
                margin: "1rem 0 0",
                borderRadius: 8,
                padding: "0.75rem",
                background: "#EAF3DE",
                color: "#3B6D11",
                whiteSpace: "pre-wrap",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {answerText || "No cited answer text available."}
            </pre>
            <ExplainBox label="por que a resposta é este trecho exato">
              {explainExtractiveAnswer()}
            </ExplainBox>
          </section>
        </>
      )}
    </div>
  );
}
