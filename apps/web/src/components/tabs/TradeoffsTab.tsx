import type { TradeoffMetricsResponse } from "../../api/types";
import { ExplainBox } from "../shared/ExplainBox";
import { ProviderRow } from "../shared/ProviderRow";

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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.75rem",
        background: "var(--color-background-secondary, #F1EFE8)",
      }}
    >
      <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
        {label}
      </div>
      <strong style={{ display: "block", marginTop: 4, fontSize: 18 }}>
        {value}
      </strong>
    </article>
  );
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function tradeoffInsight(tradeoffs: TradeoffMetricsResponse): string {
  const lexical = tradeoffs.providers.find((provider) => provider.provider === "api-lexical");
  const ollama = tradeoffs.providers.find((provider) => provider.provider === "ollama");

  if (lexical && ollama && ollama.avgLatencyMs > lexical.avgLatencyMs * 10) {
    const ratio = Math.round(ollama.avgLatencyMs / Math.max(lexical.avgLatencyMs, 1));

    return `Ollama is ${ratio}x slower than api-lexical but may have higher cache hit rate. Slower providers benefit more from caching repeated queries because each avoided request saves more latency. All local providers have $0.00 cost. Cloud providers will show real costs when configured in Phase 4.`;
  }

  return "All local providers have $0.00 cost. Cloud providers (OpenAI, Anthropic) will show real costs when configured in Phase 4.";
}

export function TradeoffsTab({
  tradeoffs,
  loading,
  onRefresh,
}: {
  tradeoffs: TradeoffMetricsResponse | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  const maxLatency = Math.max(...(tradeoffs?.providers.map((provider) => provider.avgLatencyMs) ?? [0]));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel>latência · custo · qualidade — por provider</SectionLabel>
        <button
          type="button"
          className="secondary-button"
          onClick={onRefresh}
          disabled={loading}
          style={{ minHeight: 32 }}
        >
          {loading ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {!tradeoffs ? (
        <ExplainBox variant="info">
          Trade-off metrics are loading or not available yet. Run a few Ask requests to populate provider latency, cache, and cost metrics.
        </ExplainBox>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              marginBottom: "1rem",
            }}
          >
            <MetricCard label="Total requests" value={String(tradeoffs.totals.requests)} />
            <MetricCard label="Avg latency" value={`${tradeoffs.totals.avgLatencyMs.toFixed(1)} ms`} />
            <MetricCard label="Cache hit rate" value={formatRate(tradeoffs.totals.cacheHitRate)} />
            <MetricCard label="Grounded rate" value={formatRate(tradeoffs.totals.groundedRate)} />
            <MetricCard label="Avg cost" value={`$${tradeoffs.totals.avgCostUsd.toFixed(6)}`} />
            <MetricCard label="P95 latency" value={`${tradeoffs.totals.p95LatencyMs.toFixed(1)} ms`} />
          </div>

          <section
            style={{
              border: "0.5px solid var(--color-border-tertiary, var(--line))",
              borderRadius: 8,
              padding: "0.5rem 1rem",
              background: "var(--color-background-primary, var(--panel))",
            }}
          >
            {tradeoffs.providers.length === 0 ? (
              <ExplainBox>No provider rows yet. Run Ask to record per-provider samples.</ExplainBox>
            ) : (
              tradeoffs.providers.map((provider) => (
                <ProviderRow
                  key={provider.provider}
                  provider={provider.provider}
                  avgLatencyMs={provider.avgLatencyMs}
                  cacheHitRate={provider.cacheHitRate}
                  maxLatencyMs={maxLatency}
                />
              ))
            )}
          </section>

          <ExplainBox>{tradeoffInsight(tradeoffs)}</ExplainBox>
        </>
      )}
    </div>
  );
}
