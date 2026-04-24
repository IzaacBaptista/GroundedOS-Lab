import { useState } from "react";
import type { RagAskResponse, TradeoffMetricsResponse } from "../api/types";
import { Pill } from "./shared/Pill";
import { ChunksTab } from "./tabs/ChunksTab";
import { CitationsTab } from "./tabs/CitationsTab";
import { TradeoffsTab } from "./tabs/TradeoffsTab";
import { WorkflowTab } from "./tabs/WorkflowTab";
import { ExplainBox } from "./shared/ExplainBox";

type AnswerTab = "chunks" | "citations" | "workflow" | "tradeoffs";

const TABS: Array<{ id: AnswerTab; label: string }> = [
  { id: "chunks", label: "Chunks recuperados" },
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
      {label} will appear after you run Ask. The tab is available now so the Dev Mode layout stays stable before and after a request.
    </ExplainBox>
  );
}

export function AnswerPanel({
  response,
  tradeoffs,
  tradeoffsLoading,
  onRefreshTradeoffs,
}: {
  response: RagAskResponse | null;
  tradeoffs: TradeoffMetricsResponse | null;
  tradeoffsLoading: boolean;
  onRefreshTradeoffs: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AnswerTab>("chunks");
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

      <div
        role="tablist"
        aria-label="Answer Dev Mode views"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "0.5px solid var(--color-border-tertiary, var(--line))",
          marginBottom: "1.25rem",
          overflowX: "auto",
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: "none",
                borderBottom: `2px solid ${active ? "var(--color-text-primary, var(--text))" : "transparent"}`,
                marginBottom: -1,
                padding: "0.5rem 0.875rem",
                background: "none",
                color: active
                  ? "var(--color-text-primary, var(--text))"
                  : "var(--color-text-secondary, var(--muted))",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "chunks" && response && (
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

      {activeTab === "chunks" && !response && <EmptyTab label="Retrieved chunks" />}

      {activeTab === "citations" && response && (
        <CitationsTab
          citations={response.answer.citations}
          documentTitle={response.document.title}
          answerText={response.answer.text}
        />
      )}

      {activeTab === "citations" && !response && <EmptyTab label="Citations" />}

      {activeTab === "workflow" && response && (
        <WorkflowTab
          workflow={getDevWorkflow(response)}
          queryUnderstanding={getQueryUnderstanding(response)}
        />
      )}

      {activeTab === "workflow" && !response && <EmptyTab label="Workflow trace" />}

      {activeTab === "tradeoffs" && (
        <TradeoffsTab
          tradeoffs={tradeoffs ?? undefined}
          loading={tradeoffsLoading}
          onRefresh={onRefreshTradeoffs}
        />
      )}
    </div>
  );
}
