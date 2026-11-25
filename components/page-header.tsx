import * as React from "react";

/**
 * The header every page starts with: title, a one-line subtitle, then the page's controls and
 * actions. On desktop everything sits in one row. On phones the title takes the first row with the
 * actions (e.g. New) at its right, and the controls wrap onto their own rows below.
 *
 * `center` is for a page whose one main scope control (the Repo dropdown on the all-repos pages)
 * belongs in the middle of the bar. On desktop the header becomes three columns, so the control sits
 * at the bar's true centre whatever the title and actions weigh. On phones it gets its own row, centred;
 * the back arrow (`controls`) is not shown there, so the row is the control's alone, and `extra` sits
 * at the right of the title instead of taking a row of its own.
 */
export function PageHeader({
  title,
  subtitle,
  controls,
  center,
  extra,
  actions,
  standalone = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Search, filters and sorting. Direct children of the header on desktop. With `center`, the leading controls (the back arrow), desktop only. */
  controls?: React.ReactNode;
  /** One control centred in the bar, see above. */
  center?: React.ReactNode;
  /** With `center`: a secondary toggle (Completed) kept at the right on desktop, at the right of the title on phones. */
  extra?: React.ReactNode;
  /** Buttons that belong to the page, such as New. */
  actions?: React.ReactNode;
  /** The page is not inside the app shell (the all-repos pages), so no phone top bar names it: keep the h1 visible. */
  standalone?: boolean;
}) {
  const titleBlock = (
    <div className="mr-1 flex min-w-0 flex-col gap-px max-md:order-1 max-md:flex-1">
      {/* On phones the top bar of the app shell shows the page name, so the h1 stays for screen readers only. */}
      <h1 className="m-0 text-page-title font-semibold tracking-[-.01em] max-md:data-[phone-hidden=true]:sr-only" data-phone-hidden={!standalone}>
        {title}
      </h1>
      {subtitle && <span className="text-meta text-[var(--text-3)]">{subtitle}</span>}
    </div>
  );
  const actionsBlock = actions && <div className="flex flex-shrink-0 items-center gap-3 max-md:order-2 md:ml-auto">{actions}</div>;

  if (center) {
    return (
      <header className="flex flex-shrink-0 flex-wrap items-center gap-x-3 border-b border-border bg-[var(--surface)] p-[14px_22px] max-md:p-[12px_16px] md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* One cell on desktop (title, then the back arrow); on phones its children join the header's own rows. The back arrow is left out on phones. */}
        <div className="contents md:flex md:min-w-0 md:items-center md:gap-3">
          {titleBlock}
          {controls && <div className="flex items-center max-md:hidden">{controls}</div>}
        </div>
        {/* On phones the dropdown(s) take the row below the title, centred. */}
        <div className="flex min-w-0 justify-center max-md:order-3 max-md:mt-3 max-md:basis-full">{center}</div>
        {/* Desktop: the right cell, `extra` then `actions`. Phones: `extra` stays at the right of the title, so the toggle takes no row of its own; `actions` are desktop only here (an empty box would still add a flex gap). */}
        <div className="flex items-center gap-3 md:justify-self-end max-md:contents">
          {extra && <div className="flex flex-shrink-0 items-center max-md:order-2">{extra}</div>}
          {actions && <div className="flex flex-shrink-0 items-center gap-3 max-md:hidden">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-3 border-b border-border bg-[var(--surface)] p-[14px_22px] max-md:p-[12px_16px]">
      {titleBlock}
      {controls && (
        <div className="contents max-md:order-3 max-md:flex max-md:basis-full max-md:flex-wrap max-md:items-center max-md:gap-2">
          {controls}
        </div>
      )}
      {actionsBlock}
    </header>
  );
}
