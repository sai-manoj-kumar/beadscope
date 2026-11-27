import * as React from "react";
import { catColor, statusLabel } from "@/lib/beads-view";

/** A hue as readable text: mixed halfway toward the normal text colour, so it clears AA on a light or dark surface. */
export function readableColor(color: string): string {
  return `color-mix(in srgb, ${color} 50%, var(--text))`;
}

/**
 * Colours for a label tinted with one hue: the text is the hue mixed halfway toward the normal text
 * colour, so it stays AA-readable on its own faint tint in both themes (the quality gate checks it).
 */
export function tintStyle(color: string, tint = "1c"): React.CSSProperties {
  return {
    color: readableColor(color),
    background: `${color}${tint}`,
    border: `1px solid ${color}33`,
  };
}

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
      style={color ? { ...tintStyle(color), ...style } : style}
    >
      {children}
    </span>
  );
}

/**
 * A bead's status as a tinted Chip. It stays on one line: when the row is too narrow the label is
 * cut short with an ellipsis (the full label is the tooltip) instead of wrapping onto a second line.
 */
export function StatusChip({ status }: { status: string }) {
  const label = statusLabel(status);
  return (
    <Chip color={catColor(status)} title={label} className="min-w-0 max-w-full">
      <span className="truncate">{label}</span>
    </Chip>
  );
}
