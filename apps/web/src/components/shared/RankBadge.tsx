export function RankBadge({ rank }: { rank: number }) {
  const colors =
    rank === 1
      ? { bg: "#E1F5EE", text: "#085041" }
      : rank === 2
        ? { bg: "#E6F1FB", text: "#0C447C" }
        : { bg: "#F1EFE8", text: "#444441" };

  return (
    <span
      aria-label={`rank ${rank}`}
      style={{
        display: "inline-flex",
        width: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: colors.bg,
        color: colors.text,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        flex: "0 0 auto",
      }}
    >
      {rank}
    </span>
  );
}
