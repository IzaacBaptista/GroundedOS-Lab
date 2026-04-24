import type { ReactNode } from "react";

export type PillVariant = "green" | "blue" | "amber" | "gray" | "teal";

const PILL_COLORS: Record<PillVariant, { bg: string; text: string }> = {
  green: { bg: "#EAF3DE", text: "#3B6D11" },
  blue: { bg: "#E6F1FB", text: "#0C447C" },
  amber: { bg: "#FAEEDA", text: "#854F0B" },
  gray: { bg: "#F1EFE8", text: "#444441" },
  teal: { bg: "#E1F5EE", text: "#085041" },
};

export function Pill({
  children,
  variant,
  title,
}: {
  children: ReactNode;
  variant: PillVariant;
  title?: string;
}) {
  const colors = PILL_COLORS[variant];

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
        borderRadius: 20,
        padding: "3px 8px",
        background: colors.bg,
        color: colors.text,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
