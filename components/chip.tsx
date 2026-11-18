import * as React from "react";
import { catColor, statusLabel } from "@/lib/beads-view";

/**
 * The small rounded pill used for counts, labels and statuses. Neutral by default (`tone="strong"`
 * for darker text); pass `color` for a tinted one: the text takes the colour, with a faint
 * background and border of the same hue.
 */
export function Chip({
  color,
  tone = "muted",
  mono = false,
  className = "",
  style,
  children,
  ...props
}: React.ComponentProps<"span"> & { color?: string; tone?: "muted" | "strong"; mono?: boolean }) {
  const neutral = `border border-border bg-[var(--surface-2)] ${
    tone === "strong" ? "text-[var(--text-2)]" : "text-[var(--text-3)]"
  }`;
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full px-2 py-px text-meta ${
        color ? "font-semibold tracking-[.01em]" : neutral
      } ${mono ? "font-mono" : ""} ${className}`}
      style={color ? { color, background: `${color}1c`, border: `1px solid ${color}33`, ...style } : style}
    >
      {children}
    </span>
  );
}

/** A bead's status as a tinted Chip. */
export function StatusChip({ status }: { status: string }) {
  return <Chip color={catColor(status)}>{statusLabel(status)}</Chip>;
}
