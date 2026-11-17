import * as React from "react";

/**
 * The header every page starts with: title, a one-line subtitle, then the page's controls and
 * actions. On desktop everything sits in one row. On phones the title takes the first row with the
 * actions (e.g. New) at its right, and the controls wrap onto their own rows below.
 */
export function PageHeader({
  title,
  subtitle,
  controls,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Search, filters and sorting. Direct children of the header on desktop. */
  controls?: React.ReactNode;
  /** Buttons that belong to the page, such as New. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-3 border-b border-border bg-[var(--surface)] p-[14px_22px] max-md:p-[12px_16px]">
      <div className="mr-1 flex min-w-0 flex-col gap-px max-md:order-1 max-md:flex-1">
        <h1 className="m-0 text-page-title font-semibold tracking-[-.01em]">{title}</h1>
        {subtitle && <span className="text-meta text-[var(--text-3)]">{subtitle}</span>}
      </div>
      {controls && (
        <div className="contents max-md:order-3 max-md:flex max-md:basis-full max-md:flex-wrap max-md:items-center max-md:gap-2">
          {controls}
        </div>
      )}
      {actions && <div className="flex flex-shrink-0 items-center gap-3 max-md:order-2">{actions}</div>}
    </header>
  );
}
