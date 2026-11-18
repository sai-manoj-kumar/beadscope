"use client";
import * as React from "react";
import { Icon } from "@/components/icons";

/**
 * The card every Settings section sits in: one padding, one title style. `data-phone-targets` opts
 * the controls inside into the phone rule in globals.css (44px buttons, selects and fields).
 */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      data-phone-targets
      className="flex flex-col gap-[14px] rounded-[13px] border border-border bg-[var(--surface)] p-[18px_20px] max-md:p-4"
    >
      <h2 className="m-0 text-body font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * One setting: a title and explanation with its control. Side by side on desktop; on a phone the
 * control sits under the text, so the explanation gets the full card width instead of a narrow column.
 */
export function SettingRow({
  title,
  description,
  control,
  titleId,
  descriptionId,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  titleId?: string;
  descriptionId?: string;
  /** Extra content under the text, such as an error line. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 max-md:flex-col max-md:items-start max-md:gap-3">
      <div className="min-w-0">
        <div id={titleId} className="text-body">{title}</div>
        {description && (
          <div id={descriptionId} className="mt-1 text-meta text-[var(--text-3)]">{description}</div>
        )}
        {children}
      </div>
      {control && <div className="flex-shrink-0 max-md:max-w-full">{control}</div>}
    </div>
  );
}

/** The check/cross button used for on-off settings. Pass `role="switch"` and aria props for a real switch. */
export function ToggleButton({
  on,
  onText = "Enabled",
  offText = "Disabled",
  className = "",
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  on: boolean;
  onText?: string;
  offText?: string;
  /** Replaces the On/Off text, e.g. "Saving…". */
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`flex h-[34px] flex-shrink-0 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[13px] text-label hover:bg-[var(--surface-3)] disabled:opacity-50 max-md:h-11 ${className}`}
    >
      {children ?? (
        <>
          <Icon name={on ? "check" : "x"} size={14} />
          <span>{on ? onText : offText}</span>
        </>
      )}
    </button>
  );
}
