import type { ReactNode } from "react";

const VARIANT_BACKGROUNDS = {
  default: "var(--color-background-secondary, #F1EFE8)",
  info: "#E6F1FB",
  warning: "#FAEEDA",
};

export function ExplainBox({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "info" | "warning";
}) {
  return (
    <div
      style={{
        borderRadius: 6,
        marginTop: "0.5rem",
        padding: "0.5rem 0.75rem",
        background: VARIANT_BACKGROUNDS[variant],
        color: "var(--color-text-secondary, var(--muted))",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <span style={{ marginRight: 4 }}>→</span>
      {children}
    </div>
  );
}
