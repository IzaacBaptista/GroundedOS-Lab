import { Pill } from "./Pill";

function latencyColor(avgLatencyMs: number): string {
  if (avgLatencyMs < 50) {
    return "#1D9E75";
  }

  if (avgLatencyMs <= 500) {
    return "#378ADD";
  }

  return "#EF9F27";
}

export function ProviderRow({
  provider,
  avgLatencyMs,
  cacheHitRate,
  maxLatencyMs,
}: {
  provider: string;
  avgLatencyMs: number;
  cacheHitRate: number;
  maxLatencyMs: number;
}) {
  const safeMax = maxLatencyMs > 0 ? maxLatencyMs : 1;
  const width = Math.max(2, Math.min(100, (avgLatencyMs / safeMax) * 100));
  const color = latencyColor(avgLatencyMs);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(90px, 140px) minmax(0, 1fr) auto auto",
        gap: 12,
        alignItems: "center",
        borderBottom: "0.5px solid var(--color-border-tertiary, var(--line))",
        padding: "0.6rem 0",
      }}
    >
      <strong style={{ fontSize: 13, color: "var(--color-text-primary, var(--text))" }}>
        {provider}
      </strong>
      <div style={{ height: 5, borderRadius: 999, background: "#F1EFE8", overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: color }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary, var(--muted))", whiteSpace: "nowrap" }}>
        {avgLatencyMs.toFixed(1)} ms avg
      </span>
      <Pill variant={cacheHitRate >= 0.5 ? "green" : "blue"}>
        {Math.round(cacheHitRate * 100)}% cache
      </Pill>
    </div>
  );
}
