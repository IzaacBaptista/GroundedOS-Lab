import { useState } from "react";
import type { TradeoffMetricsResponse } from "../../api/types";
import {
  explainLatencyCurve,
  explainNoProviderRows,
  explainOllamaCacheParadox,
  explainProviderLatency,
  explainTradeoffInsight,
  explainTradeoffsLoading,
  explainTradeoffMetric,
  explainZeroCacheRate,
} from "../../utils/explanations";
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
  const explanation = explainTradeoffMetric(label);
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <article
      title={explanation}
      onMouseEnter={() => setShowExplanation(true)}
      onMouseLeave={() => setShowExplanation(false)}
      onFocus={() => setShowExplanation(true)}
      onBlur={() => setShowExplanation(false)}
      tabIndex={0}
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.75rem",
        background: "var(--color-background-secondary, #F1EFE8)",
      }}
    >
      <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>
        {label} <span aria-hidden="true">?</span>
      </div>
      <strong style={{ display: "block", marginTop: 4, fontSize: 18 }}>
        {value}
      </strong>
      {showExplanation && (
        <ExplainBox label="o que essa métrica significa">
          {explanation}
        </ExplainBox>
      )}
    </article>
  );
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function DonutChart({ value, label }: { value: number; label: string }) {
  const safe = clamp01(value);
  const angle = Math.round(safe * 360);

  return (
    <article
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.75rem",
        background: "var(--color-background-secondary, #F1EFE8)",
        display: "grid",
        gap: 8,
        justifyItems: "center",
      }}
    >
      <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12 }}>{label}</div>
      <div
        role="img"
        aria-label={`${label} ${formatRate(safe)}`}
        style={{
          width: 78,
          height: 78,
          borderRadius: "999px",
          background: `conic-gradient(var(--accent) ${angle}deg, var(--line) ${angle}deg 360deg)`,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "999px",
            background: "var(--color-background-primary, var(--panel))",
            display: "grid",
            placeItems: "center",
            color: "var(--color-text-primary, var(--text))",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {formatRate(safe)}
        </div>
      </div>
    </article>
  );
}

function ProgressStat({ label, value }: { label: string; value: number }) {
  const safe = clamp01(value);

  return (
    <article
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.75rem",
        background: "var(--color-background-secondary, #F1EFE8)",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 12,
          color: "var(--color-text-secondary, var(--muted))",
        }}
      >
        <span>{label}</span>
        <strong style={{ color: "var(--color-text-primary, var(--text))", fontSize: 12 }}>
          {formatRate(safe)}
        </strong>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "var(--line)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(safe * 100)}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--accent)",
          }}
        />
      </div>
    </article>
  );
}

function ProviderLatencyBars({
  providers,
}: {
  providers: TradeoffMetricsResponse["providers"];
}) {
  const maxLatency = Math.max(...providers.map((provider) => provider.avgLatencyMs), 1);

  return (
    <article
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.75rem",
        background: "var(--color-background-secondary, #F1EFE8)",
      }}
    >
      <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12, marginBottom: 8 }}>
        Latency bars by provider
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {providers.map((provider) => {
          const ratio = Math.max(3, (provider.avgLatencyMs / maxLatency) * 100);

          return (
            <div key={provider.provider} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
              <span style={{ color: "var(--color-text-primary, var(--text))", fontSize: 12 }}>{provider.provider}</span>
              <div style={{ height: 8, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
                <div style={{ width: `${ratio}%`, height: "100%", borderRadius: 999, background: "var(--accent)" }} />
              </div>
              <span style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 11, whiteSpace: "nowrap" }}>
                {provider.avgLatencyMs.toFixed(1)} ms
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function LatencyCurve({
  recent,
}: {
  recent: TradeoffMetricsResponse["recent"];
}) {
  if (recent.length < 2) {
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
          Latency curve (recent requests)
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-tertiary, var(--muted))" }}>
          Need at least 2 requests to draw the curve.
        </div>
      </article>
    );
  }

  const chartWidth = 360;
  const chartHeight = 110;
  const maxLatency = Math.max(...recent.map((sample) => sample.latencyMs), 1);
  const points = recent
    .map((sample, index) => {
      const x = (index / Math.max(recent.length - 1, 1)) * chartWidth;
      const y = chartHeight - (sample.latencyMs / maxLatency) * chartHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <article
      style={{
        border: "0.5px solid var(--color-border-tertiary, var(--line))",
        borderRadius: 8,
        padding: "0.75rem",
        background: "var(--color-background-secondary, #F1EFE8)",
      }}
    >
      <div style={{ color: "var(--color-text-secondary, var(--muted))", fontSize: 12, marginBottom: 8 }}>
        Latency curve (recent requests)
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" style={{ width: "100%", height: 120, display: "block" }}>
        <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="var(--line)" strokeWidth="1" />
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={points} />
      </svg>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary, var(--muted))" }}>
        p95 {Math.max(...recent.map((sample) => sample.latencyMs)).toFixed(1)} ms · samples {recent.length}
      </div>
      <ExplainBox label="como ler a curva">
        {explainLatencyCurve(recent.map((sample) => sample.latencyMs))}
      </ExplainBox>
    </article>
  );
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
  const baselineLatency =
    tradeoffs?.providers.find((provider) => provider.provider === "api-lexical")?.avgLatencyMs ??
    tradeoffs?.providers.reduce(
      (min, provider) => Math.min(min, provider.avgLatencyMs),
      Number.POSITIVE_INFINITY
    ) ??
    1;
  const lexical = tradeoffs?.providers.find((provider) => provider.provider === "api-lexical");
  const ollama = tradeoffs?.providers.find((provider) => provider.provider === "ollama");
  const ollamaRatio =
    lexical && ollama
      ? Math.round(ollama.avgLatencyMs / Math.max(lexical.avgLatencyMs, 1))
      : undefined;

  return (
    <div>
      <header style={{ display: "grid", gap: 4, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>Trade-offs de providers</h3>
        <p style={{ margin: 0, color: "var(--color-text-secondary, var(--muted))", fontSize: 14 }}>
          Cada provider de embedding tem um perfil diferente de velocidade, cache e custo. Este
          painel agrega as requests da sessão para mostrar esse perfil.
        </p>
      </header>

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
          {explainTradeoffsLoading()}
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
              marginBottom: "1rem",
            }}
          >
            <DonutChart value={tradeoffs.totals.groundedRate} label="Grounded rate (pie)" />
            <ProgressStat label="Cache hit progress" value={tradeoffs.totals.cacheHitRate} />
            <ProviderLatencyBars providers={tradeoffs.providers} />
            <LatencyCurve recent={tradeoffs.recent} />
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
              <ExplainBox>{explainNoProviderRows()}</ExplainBox>
            ) : (
              tradeoffs.providers.map((provider) => (
                <div key={provider.provider}>
                  <ProviderRow
                    provider={provider.provider}
                    avgLatencyMs={provider.avgLatencyMs}
                    cacheHitRate={provider.cacheHitRate}
                    maxLatencyMs={maxLatency}
                  />
                  <ExplainBox label="consequência operacional">
                    {explainProviderLatency(
                      provider.provider,
                      provider.avgLatencyMs,
                      Number.isFinite(baselineLatency) ? baselineLatency : provider.avgLatencyMs
                    )}
                  </ExplainBox>
                  {provider.cacheHitRate === 0 && provider.requests > 5 && (
                    <ExplainBox variant="tip" label="como testar o cache">
                      {explainZeroCacheRate(provider.provider, provider.requests)}
                    </ExplainBox>
                  )}
                  {provider.provider === "ollama" &&
                    Number.isFinite(baselineLatency) &&
                    provider.avgLatencyMs > baselineLatency * 100 && (
                      <ExplainBox variant="warning" label="paradoxo do cache com ollama">
                        {explainOllamaCacheParadox(provider.provider)}
                      </ExplainBox>
                    )}
                </div>
              ))
            )}
          </section>

          <ExplainBox>
            {explainTradeoffInsight(Boolean(lexical && ollama && ollamaRatio && ollamaRatio > 10), ollamaRatio)}
          </ExplainBox>
        </>
      )}
    </div>
  );
}
