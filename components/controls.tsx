import * as React from "react";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

/*
 * The everyday controls, written once: buttons, icon buttons, text-like buttons, text fields, text
 * areas, native selects, checkboxes and a one-of-N picker. Every view and dialog uses these, so the
 * same job looks and sizes the same everywhere. On phones they are 44px tall (the `tap-target`
 * utility) and fields are 16px (a global rule), so call sites do not repeat either.
 *
 * Page-level actions in the brand colour are BrandButton; small pills are Chip.
 */

/* ---------- Buttons ---------- */

const buttonSizes = {
  sm: "h-8 rounded-lg px-3 text-label",
  md: "h-9 rounded-[9px] px-3 text-label",
  lg: "h-[38px] rounded-[9px] px-4 text-body",
} as const;

const buttonVariants = {
  /** Filled with the raised surface colour: Cancel, Open preview, Refine. */
  secondary:
    "border border-border bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]",
  /** Transparent with a border. */
  outline: "border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)]",
  /** No border until hovered. */
  ghost: "text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  /** A dashed "add something" button. */
  dashed:
    "border border-dashed border-[var(--border-strong)] text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)]",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  pressed,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  icon?: IconName;
  /** Makes this an on/off toggle: sets `aria-pressed` and highlights it in the brand colour while on. */
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      {...props}
      className={cn(
        "tap-target inline-flex flex-shrink-0 items-center justify-center gap-[6px] whitespace-nowrap font-medium transition-colors disabled:opacity-50",
        buttonSizes[size],
        buttonVariants[variant],
        pressed !== undefined &&
          "aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]",
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === "lg" ? 15 : 14} />}
      {children}
    </button>
  );
}

const iconButtonSizes = { sm: "h-6 w-6 rounded-md", md: "h-[30px] w-[30px] rounded-lg", lg: "h-[34px] w-[34px] rounded-lg" } as const;

/** A square button holding only an icon. `label` is its accessible name (required). */
export function IconButton({
  label,
  variant = "bordered",
  size = "md",
  danger = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "aria-label"> & {
  label: string;
  /** `bordered` has a border and a surface fill; `ghost` shows nothing until hovered. */
  variant?: "bordered" | "ghost";
  size?: keyof typeof iconButtonSizes;
  /** Turns red on hover: remove and delete. */
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      className={cn(
        "tap-target flex flex-shrink-0 items-center justify-center transition-colors disabled:opacity-50",
        iconButtonSizes[size],
        variant === "bordered"
          ? "border border-border bg-[var(--surface)] text-[var(--text-2)]"
          : "text-[var(--text-3)]",
        danger
          ? "hover:border-[#ef444433] hover:bg-[#ef444415] hover:text-[#ef4444]"
          : "hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A button that reads as text: an id that opens a bead, "Retry", "remove". */
export function LinkButton({
  tone = "muted",
  underline = false,
  mono = false,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  /** `muted` is grey and darkens on hover; `text` is normal text colour; `brand` is the accent. */
  tone?: "muted" | "text" | "brand";
  underline?: boolean;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "tap-target cursor-pointer text-left transition-colors disabled:opacity-50",
        tone === "muted" && "text-[var(--text-3)] hover:text-[var(--text)]",
        tone === "text" && "text-[var(--text)] hover:underline",
        tone === "brand" && "text-[var(--brand)] hover:underline",
        underline && "underline underline-offset-2",
        mono && "font-mono",
        className,
      )}
    />
  );
}

/* ---------- Fields ---------- */

const fieldBase =
  "w-full min-w-0 rounded-[9px] border border-border bg-[var(--surface-2)] text-[var(--text)] outline-none focus:border-[var(--brand)] disabled:opacity-50";
const fieldSizes = { sm: "h-8 px-[9px] text-label", md: "h-[38px] px-3 text-body" } as const;

/** A single-line text field. Pass `type` for number, search and so on. */
export function TextInput({
  size = "md",
  mono = false,
  dashed = false,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: keyof typeof fieldSizes;
  mono?: boolean;
  /** A dashed border for an "add one" field. */
  dashed?: boolean;
}) {
  return (
    <input
      type="text"
      {...props}
      className={cn(fieldBase, fieldSizes[size], mono && "font-mono", dashed && "border-dashed bg-transparent", className)}
    />
  );
}

/** A multi-line text field that the user can resize vertically. */
export function TextArea({
  size = "md",
  className,
  ...props
}: React.ComponentProps<"textarea"> & { size?: "sm" | "md" }) {
  return (
    <textarea
      {...props}
      className={cn(
        fieldBase,
        "resize-y",
        size === "sm" ? "rounded-lg p-2 text-label" : "p-[9px_11px] text-body leading-[1.5]",
        className,
      )}
    />
  );
}

/** A native select. Native keeps the phone's own picker. */
export function SelectField({
  size = "md",
  className,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: keyof typeof fieldSizes }) {
  return (
    <select
      {...props}
      className={cn(
        "cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] text-[var(--text)] outline-none focus:border-[var(--brand)] disabled:opacity-50",
        size === "sm" ? "h-8 px-2 text-label max-md:h-11" : "h-[38px] px-[10px] text-body max-md:h-11",
        className,
      )}
    />
  );
}

/** A checkbox in the brand colour: 20px on phones, 16px on desktop. */
export function CheckInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      {...props}
      className={cn("h-5 w-5 flex-shrink-0 cursor-pointer accent-[var(--brand)] disabled:cursor-default disabled:opacity-40 md:h-4 md:w-4", className)}
    />
  );
}

/* ---------- Pickers ---------- */

/** Pick one of a few options, shown side by side: a range, a scope, a mode. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  fill = false,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  /** Stretch to the full width and share it equally. */
  fill?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex gap-1 rounded-[9px] border border-border bg-[var(--surface-2)] p-1", fill ? "w-full" : "flex-shrink-0")}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "tap-target rounded-[7px] px-[11px] py-[6px] text-label font-medium transition-colors",
              fill && "flex-1",
              active ? "bg-[var(--brand-solid)] text-white" : "text-[var(--text-2)] hover:bg-[var(--surface-3)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
