import { useState } from "react";
import { ExplainBox } from "../shared/ExplainBox";
import { Pill } from "../shared/Pill";
import { ScoreBar } from "../shared/ScoreBar";
import { STEP_EXPLANATIONS } from "../shared/WorkflowStep";
import {
  detectQueryLanguage,
  explainIntent,
  explainNoWorkflowTrace,
  explainTotalDuration,
  explainWorkflowStepConsequence,
} from "../../utils/explanations";

type WorkflowShape = {
  workflowId?: string;
  steps?: Record<string, { status: string; durationMs?: number; error?: string }>;
  totalDurationMs?: number;
};

type QueryUnderstandingShape = {
  original?: string;
  rewritten?: string;
  expanded?: string[];
  expandedTerms?: string[];
  intent?: string;
  confidence?: number;
};

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

const STEP_LABELS: Record<string, string> = {
  "normalize-request": "Validar entrada",
  "load-memory": "Carregar memória",
  "ingest-document": "Ler documento",
  "build-index": "Criar índice",
  "process-query": "Entender pergunta",
  "cache-lookup": "Checar cache",
  "semantic-cache": "Checar cache",
  "retrieve-chunks": "Buscar chunks",
  rerank: "Reordenar",
  "rerank-chunks": "Reordenar",
  "build-answer": "Montar resposta",
};

const STEP_SUMMARIES: Record<string, string> = {
  "normalize-request": "Campos obrigatórios e padrões.",
  "load-memory": "Contexto salvo da sessão.",
  "ingest-document": "Texto normalizado e rastreável.",
  "build-index": "Chunks, embeddings e vetores.",
  "process-query": "Query preparada para busca.",
  "cache-lookup": "Reuso de resposta anterior.",
  "semantic-cache": "Reuso de resposta anterior.",
  "retrieve-chunks": "Top-K trechos candidatos.",
  rerank: "Melhor ordem antes da resposta.",
  "rerank-chunks": "Melhor ordem antes da resposta.",
  "build-answer": "Resposta com base na fonte.",
};

const STATUS_COLORS: Record<string, string> = {
  success: "#1D9E75",
  completed: "#1D9E75",
  failed: "#B3342B",
  error: "#B3342B",
  running: "#EF9F27",
  pending: "#888780",
};

function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return "n/a";
  }

  return `${durationMs.toFixed(durationMs >= 10 ? 0 : 1)} ms`;
}

function statusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] ?? "#888780";
}

function PipelineCard({
  name,
  status,
  durationMs,
  selected,
  onSelect,
}: {
  name: string;
  status: string;
  durationMs?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = STEP_LABELS[name] ?? name;
  const summary = STEP_SUMMARIES[name] ?? `Status da etapa: ${status}.`;
  const color = statusColor(status);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%",
        border: selected
          ? "1px solid var(--accent)"
          : "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.75rem",
        background: "var(--color-background-secondary, #F1EFE8)",
        color: "var(--color-text-primary, var(--text))",
        display: "grid",
        gap: 8,
        minHeight: 132,
        textAlign: "left",
        boxShadow: selected ? "inset 0 0 0 1px rgba(38, 166, 144, 0.35)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: color,
              flex: "0 0 auto",
            }}
          />
          <strong style={{ fontSize: 13, lineHeight: 1.2 }}>{label}</strong>
        </div>
        <span
          style={{
            color: "var(--color-text-secondary, var(--muted))",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {formatDuration(durationMs)}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          color: "var(--color-text-secondary, var(--muted))",
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        {summary}
      </p>

      <span
        style={{
          alignSelf: "end",
          color: selected ? "var(--accent-strong)" : "var(--color-text-tertiary, var(--muted))",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {selected ? "selecionada" : "ver detalhes"}
      </span>
    </button>
  );
}

function StepDetailPanel({
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
  const label = STEP_LABELS[name] ?? name;
  const explanation = STEP_EXPLANATIONS[name] ?? `Pipeline step "${name}" reported status "${status}".`;

  return (
    <section
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.875rem 1rem",
        background: "var(--color-background-secondary, #F1EFE8)",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
        <strong>{label}</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Pill variant="gray">{name}</Pill>
          <Pill variant="teal">{status}</Pill>
          <Pill variant="gray">{formatDuration(durationMs)}</Pill>
        </div>
      </div>
      <p style={{ margin: 0, color: "var(--color-text-secondary, var(--muted))", fontSize: 13, lineHeight: 1.6 }}>
        {explanation}
      </p>
      <ExplainBox label="impacto desta etapa">
        {explainWorkflowStepConsequence(name)}
      </ExplainBox>
      {error && <ExplainBox variant="warning">{error}</ExplainBox>}
    </section>
  );
}

export function WorkflowTab({
  workflow,
  queryUnderstanding,
}: {
  workflow?: WorkflowShape;
  queryUnderstanding?: QueryUnderstandingShape;
}) {
  const steps = Object.entries(workflow?.steps ?? {});
  const [selectedStepName, setSelectedStepName] = useState<string | undefined>(() => steps[0]?.[0]);
  const selectedStep = steps.find(([name]) => name === selectedStepName) ?? steps[0];
  const totalDuration =
    workflow?.totalDurationMs ??
    steps.reduce((sum, [, step]) => sum + (step.durationMs ?? 0), 0);

  return (
    <div>
      <header style={{ display: "grid", gap: 4, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 28, fontWeight: 650 }}>Etapas da pergunta</h3>
        <p style={{ margin: 0, color: "var(--color-text-secondary, var(--muted))", fontSize: 14, lineHeight: 1.55 }}>
          Visão compacta do caminho entre pergunta, busca e resposta. Os detalhes técnicos ficam
          colapsados para o print caber na tela.
        </p>
      </header>

      {!workflow || steps.length === 0 ? (
        <ExplainBox variant="warning">
          {explainNoWorkflowTrace()}
        </ExplainBox>
      ) : (
        <section
          style={{
            border: "0.5px solid var(--color-border-tertiary, var(--line))",
            borderRadius: 8,
            padding: "0.5rem 1rem",
            background: "var(--color-background-primary, var(--panel))",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <SectionLabel>pipeline executada</SectionLabel>
              <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12, marginTop: -6 }}>
                {steps.length} etapas registradas
              </div>
            </div>
            <Pill variant="gray">{totalDuration.toFixed(1)} ms total</Pill>
          </div>
          <ExplainBox
            variant={totalDuration > 1000 ? "warning" : totalDuration < 10 ? "success" : "default"}
            label="o que a duração total indica"
          >
            {explainTotalDuration(totalDuration)}
          </ExplainBox>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              marginTop: 12,
            }}
          >
            {steps.map(([name, step]) => (
              <PipelineCard
                key={name}
                name={name}
                status={step.status}
                durationMs={step.durationMs}
                selected={(selectedStep?.[0] ?? "") === name}
                onSelect={() => setSelectedStepName(name)}
              />
            ))}
          </div>
          {selectedStep && (
            <div style={{ marginTop: 12 }}>
              <StepDetailPanel
                name={selectedStep[0]}
                status={selectedStep[1].status}
                durationMs={selectedStep[1].durationMs}
                error={selectedStep[1].error}
              />
            </div>
          )}
        </section>
      )}

      {queryUnderstanding && (
        <section
          style={{
            border: "0.5px solid var(--color-border-tertiary, var(--line))",
            borderRadius: 8,
            marginTop: "1rem",
            padding: "1rem",
            background: "var(--color-background-primary, var(--panel))",
          }}
        >
          <details>
            <summary
              style={{
                cursor: "pointer",
                color: "var(--color-text-primary, var(--text))",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Como a pergunta foi interpretada
            </summary>
            <div style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 13 }}>
              <strong>Original:</strong> {queryUnderstanding.original ?? "n/a"}
            </div>
            {queryUnderstanding.rewritten &&
              queryUnderstanding.rewritten !== queryUnderstanding.original && (
                <div style={{ fontSize: 13 }}>
                  <strong>Rewritten:</strong>{" "}
                  <mark style={{ background: "#E6F1FB", color: "#0C447C", borderRadius: 4 }}>
                    {queryUnderstanding.rewritten}
                  </mark>
                </div>
              )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(queryUnderstanding.expanded ?? queryUnderstanding.expandedTerms ?? []).map((term) => (
                <Pill key={term} variant="blue">
                  {term}
                </Pill>
              ))}
              {queryUnderstanding.intent && (
                <Pill variant="teal">intent {queryUnderstanding.intent}</Pill>
              )}
            </div>
            {typeof queryUnderstanding.confidence === "number" && (
              <ScoreBar
                score={queryUnderstanding.confidence}
                maxScore={1}
                color="#378ADD"
              />
            )}
          </div>
          {queryUnderstanding.intent && typeof queryUnderstanding.confidence === "number" && (
            <ExplainBox label="o que esse intent significa">
              {explainIntent(
                queryUnderstanding.intent,
                queryUnderstanding.confidence,
                detectQueryLanguage(queryUnderstanding.original)
              )}
            </ExplainBox>
          )}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
