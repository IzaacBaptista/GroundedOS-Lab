import { ExplainBox } from "../shared/ExplainBox";
import { Pill } from "../shared/Pill";
import { ScoreBar } from "../shared/ScoreBar";
import { WorkflowStep } from "../shared/WorkflowStep";
import {
  detectQueryLanguage,
  explainIntent,
  explainNoWorkflowTrace,
  explainTotalDuration,
  explainWorkflowObservability,
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

export function WorkflowTab({
  workflow,
  queryUnderstanding,
}: {
  workflow?: WorkflowShape;
  queryUnderstanding?: QueryUnderstandingShape;
}) {
  const steps = Object.entries(workflow?.steps ?? {});
  const totalDuration =
    workflow?.totalDurationMs ??
    steps.reduce((sum, [, step]) => sum + (step.durationMs ?? 0), 0);

  return (
    <div>
      <header style={{ display: "grid", gap: 4, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>Pipeline de execução</h3>
        <p style={{ margin: 0, color: "var(--color-text-secondary, var(--muted))", fontSize: 14 }}>
          Cada pergunta passa por etapas em sequência. O workflow mostra o que aconteceu em cada
          passo, quanto tempo levou e qual decisão foi tomada.
        </p>
      </header>

      <SectionLabel>o que aconteceu por baixo — passo a passo</SectionLabel>

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
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <Pill variant="gray">{totalDuration.toFixed(1)} ms total</Pill>
          </div>
          <ExplainBox
            variant={totalDuration > 1000 ? "warning" : totalDuration < 10 ? "success" : "default"}
            label="o que a duração total indica"
          >
            {explainTotalDuration(totalDuration)}
          </ExplainBox>
          {steps.map(([name, step]) => (
            <WorkflowStep
              key={name}
              name={name}
              status={step.status}
              durationMs={step.durationMs}
              error={step.error}
            />
          ))}
        </section>
      )}

      <ExplainBox>
        {explainWorkflowObservability()}
      </ExplainBox>

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
          <h3 style={{ marginBottom: 12 }}>Query understanding</h3>
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
        </section>
      )}
    </div>
  );
}
