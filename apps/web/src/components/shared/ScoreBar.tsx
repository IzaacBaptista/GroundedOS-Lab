export function ScoreBar({
  score,
  maxScore,
  color,
}: {
  score: number;
  maxScore: number;
  color: string;
}) {
  const safeScore = Number.isFinite(score) ? Math.max(0, score) : 0;
  const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 1;
  const relativePercent = Math.min(100, Math.round((safeScore / safeMax) * 100));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        aria-label={`score ${safeScore.toFixed(4)}`}
        style={{
          height: 4,
          overflow: "hidden",
          borderRadius: 999,
          background: "#F1EFE8",
        }}
      >
        <div
          style={{
            width: `${relativePercent}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
      <span
        style={{
          color,
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {safeScore.toFixed(4)} · {relativePercent}% max
      </span>
    </div>
  );
}
