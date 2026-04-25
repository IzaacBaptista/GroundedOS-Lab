import type { ReactNode } from "react";

type ExplainBoxVariant = "default" | "warning" | "success" | "tip" | "info";

const VARIANTS: Record<
  ExplainBoxVariant,
  { bg: string; color: string; accent: string }
> = {
  default: {
    bg: "var(--color-background-secondary, #F1EFE8)",
    color: "var(--color-text-secondary, var(--muted))",
    accent: "var(--color-border-secondary, var(--line))",
  },
  warning: {
    bg: "#FAEEDA",
    color: "#854F0B",
    accent: "#EF9F27",
  },
  success: {
    bg: "#E1F5EE",
    color: "#085041",
    accent: "#1D9E75",
  },
  tip: {
    bg: "#E6F1FB",
    color: "#0C447C",
    accent: "#378ADD",
  },
  info: {
    bg: "#E6F1FB",
    color: "#0C447C",
    accent: "#378ADD",
  },
};

export function ExplainBox({
  children,
  variant = "default",
  label,
}: {
  children: ReactNode;
  variant?: ExplainBoxVariant;
  label?: string;
}) {
  const colors = VARIANTS[variant];

  return (
    <div
      style={{
        borderRadius: 6,
        marginTop: "0.5rem",
        padding: "0.5rem 0.75rem",
        background: colors.bg,
        color: colors.color,
        borderLeft: `2px solid ${colors.accent}`,
        fontSize: 12,
        lineHeight: 1.65,
      }}
    >
      {label && (
        <div
          style={{
            marginBottom: 4,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.07em",
            opacity: 0.7,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
