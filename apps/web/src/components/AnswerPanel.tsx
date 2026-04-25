import { useState } from "react";
import type { RagAskResponse, TradeoffMetricsResponse } from "../api/types";
import { Pill } from "./shared/Pill";
import { ChunksTab } from "./tabs/ChunksTab";
import { CitationsTab } from "./tabs/CitationsTab";
import { TradeoffsTab } from "./tabs/TradeoffsTab";
import { WorkflowTab } from "./tabs/WorkflowTab";
import { ExplainBox } from "./shared/ExplainBox";

export type AnswerTab = "chunks" | "citations" | "workflow" | "tradeoffs";

const TABS: Array<{ id: AnswerTab; label: string }> = [
  { id: "chunks", label: "Cache hit" },
  { id: "citations", label: "Citações" },
  { id: "workflow", label: "Workflow" },
  { id: "tradeoffs", label: "Trade-offs" },
];

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

function getDevWorkflow(response: RagAskResponse): WorkflowShape | undefined {
  const devMode = response.devMode as RagAskResponse["devMode"] & {
    workflow?: WorkflowShape;
    workflowContext?: WorkflowShape;
  };

  return devMode.workflow ?? devMode.workflowContext;
}

function getQueryUnderstanding(response: RagAskResponse): QueryUnderstandingShape | undefined {
  const devMode = response.devMode as RagAskResponse["devMode"] & {
    queryUnderstanding?: QueryUnderstandingShape;
    processedQuery?: QueryUnderstandingShape;
  };

  return devMode.queryUnderstanding ?? devMode.processedQuery;
}

function EmptyTab({ label }: { label: string }) {
  return (
    <ExplainBox variant="info">
      {label} aparece aqui depois de executar Ask. A estrutura da interface é mantida para facilitar comparação entre queries.
    </ExplainBox>
  );
}

export function AnswerPanel({
  response,
  tradeoffs,
  tradeoffsLoading,
  onRefreshTradeoffs,
  activeTab,
  onActiveTabChange,
  showTabs = true,
}: {
  response: RagAskResponse | null;
  tradeoffs: TradeoffMetricsResponse | null;
  tradeoffsLoading: boolean;
  onRefreshTradeoffs: () => void;
  activeTab?: AnswerTab;
  onActiveTabChange?: (tab: AnswerTab) => void;
  showTabs?: boolean;
}) {
  const [internalTab, setInternalTab] = useState<AnswerTab>("chunks");
  const resolvedTab = activeTab ?? internalTab;
  const answerText =
    response?.answer.text ??
    "Index a document on the left, then ask a question to see grounded Dev Mode output here.";

  return (
    <div>
      <div
        style={{
          borderLeft: "3px solid #1D9E75",
          borderRadius: "0 8px 8px 0",
          background: "var(--color-background-secondary, #F1EFE8)",
          padding: "0.75rem 1rem",
          fontSize: 14,
          lineHeight: 1.7,
          marginBottom: "0.75rem",
        }}
      >
        {answerText}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.25rem" }}>
        <Pill variant="teal">{response?.index.embeddingProvider ?? "provider pending"}</Pill>
        <Pill variant="gray">{response?.index.chunkCount ?? 0} chunks</Pill>
        <Pill variant={response?.answer.grounded ? "green" : "amber"}>
          {response?.answer.grounded ? "grounded" : "not grounded yet"}
        </Pill>
      </div>

      {showTabs && (
        <div
          role="tablist"
          aria-label="Answer Dev Mode views"
          style={{
            display: "flex",
            gap: 8,
            borderBottom: "0.5px solid var(--color-border-tertiary, var(--line))",
            marginBottom: "1.25rem",
            overflowX: "auto",
            paddingBottom: 10,
          }}
        >
          {TABS.map((tab) => {
            const active = resolvedTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  onActiveTabChange?.(tab.id);
                  if (!activeTab) {
                    setInternalTab(tab.id);
                  }
                }}
                style={{
                  borderRadius: 8,
                  border: "0.5px solid var(--color-border-tertiary, var(--line))",
                  padding: "0.4rem 0.875rem",
                  background: active
                    ? "var(--color-background-secondary, #F1EFE8)"
                    : "var(--color-background-primary, var(--panel))",
                  color: "var(--color-text-primary, var(--text))",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {resolvedTab === "chunks" && response && (
        <ChunksTab
          results={response.devMode.results ?? []}
          embeddingProvider={response.index.embeddingProvider}
          chunkCount={response.index.chunkCount}
          cache={
            (response.devMode as RagAskResponse["devMode"] & { cache?: Record<string, unknown> })
              .cache
          }
          citations={response.answer.citations}
          rawPayload={response}
        />
      )}

      {resolvedTab === "chunks" && !response && <EmptyTab label="Cache hit" />}

      {resolvedTab === "citations" && response && (
        <CitationsTab
          citations={response.answer.citations}
          documentTitle={response.document.title}
          answerText={response.answer.text}
        />
      )}

      {resolvedTab === "citations" && !response && <EmptyTab label="Citações" />}

      {resolvedTab === "workflow" && response && (
        <WorkflowTab
          workflow={getDevWorkflow(response)}
          queryUnderstanding={getQueryUnderstanding(response)}
        />
      )}

      {resolvedTab === "workflow" && !response && <EmptyTab label="Workflow" />}

      {resolvedTab === "tradeoffs" && (
        <TradeoffsTab
          tradeoffs={tradeoffs ?? undefined}
          loading={tradeoffsLoading}
          onRefresh={onRefreshTradeoffs}
        />
      )}
    </div>
  );
}
