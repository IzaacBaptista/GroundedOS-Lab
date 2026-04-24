import { ExplainBox } from "../shared/ExplainBox";
import { Pill } from "../shared/Pill";
import { ScoreBar } from "../shared/ScoreBar";
import { WorkflowStep } from "../shared/WorkflowStep";

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
      <SectionLabel>o que aconteceu por baixo — passo a passo</SectionLabel>

      {!workflow || steps.length === 0 ? (
        <ExplainBox variant="warning">
          Workflow tracing not available for this request. Enable it in API settings.
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
        Cada linha é um passo rastreável do pipeline. Status, duração e explicação ajudam a diferenciar um sistema observável de uma caixa-preta.
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
          <ExplainBox>
            Query understanding transforma a pergunta em sinais de busca: intenção, termos expandidos e confiança determinam como os chunks serão recuperados.
          </ExplainBox>
        </section>
      )}
    </div>
  );
}
