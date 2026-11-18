"use client";
import * as React from "react";
import { Icon, typeIconName } from "@/components/icons";
import { Button } from "@/components/controls";
import { OriginBadge, PriorityChip } from "@/components/board/bead-card";
import { useApp } from "@/components/app-context";
import { PageHeader } from "@/components/page-header";
import { BrandButton } from "@/components/brand-button";
import { StatusChip } from "@/components/chip";
import { beadOrigin, originTitle } from "@/lib/attribution";
import {
  catColor,
  typeColor,
  avatarColor,
  initials,
  childrenOf,
  epicProgress,
  beadsWithoutEpic,
} from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/** Chip styling shared with the list rows and drawer so labels read alike. */
const labelChipClass =
  "flex-shrink-0 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-meta text-[var(--text-3)]";

/**
 * Label chips with a "+N" overflow indicator. `archived` is state, not a tag —
 * the Epics screen has no archived toggle at all, so it would be pure noise.
 */
function LabelChips({ labels, max }: { labels: string[]; max: number }) {
  const visible = labels.filter((l) => l !== "archived");
  if (visible.length === 0) return null;
  const shown = visible.slice(0, max);
  const hidden = visible.slice(max);
  return (
    <>
      {shown.map((l) => (
        <span key={l} className={`hidden ${labelChipClass} lg:inline`}>
          {l}
        </span>
      ))}
      {hidden.length > 0 && (
        <span className={`hidden ${labelChipClass} lg:inline`} title={hidden.join(", ")}>
          +{hidden.length}
        </span>
      )}
    </>
  );
}

/** One bead row, under an epic or under the "No epic" section. */
function ChildRow({ k }: { k: Bead }) {
  const { humanAllowlist, selectedBeadId, selectBead, openDetail } = useApp();
  const o = beadOrigin(k, humanAllowlist);
  return (
    <div
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={k.id}
      aria-current={selectedBeadId === k.id ? "true" : undefined}
      onFocus={() => selectBead(k.id)}
      onClick={() => {
        selectBead(k.id);
        openDetail(k.id);
      }}
      className={`flex cursor-pointer items-center gap-[11px] rounded-[9px] p-[9px_12px] hover:bg-[var(--surface)] focus-visible:outline-none max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-1 max-md:py-3 ${
        selectedBeadId === k.id ? "ring-2 ring-inset ring-[var(--brand)]" : ""
      }`}
    >
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full max-md:-order-1"
        style={{ background: catColor(k.status) }}
      />
      <span className="w-[74px] flex-shrink-0 font-mono text-meta text-[var(--text-3)] max-md:w-auto">
        {k.id}
      </span>
      <Icon
        name={typeIconName(k.issue_type)}
        size={14}
        className="flex-shrink-0 max-md:-order-1"
        style={{ color: typeColor(k.issue_type) }}
      />
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-body font-medium max-md:order-1 max-md:basis-full max-md:whitespace-normal max-md:line-clamp-2">
        {k.title}
      </span>
      <LabelChips labels={k.labels ?? []} max={2} />
      <PriorityChip p={k.priority} />
      <OriginBadge origin={o} title={originTitle(k.created_by, o)} />
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-meta font-semibold text-white"
        style={{ background: avatarColor(k.assignee ?? "") }}
      >
        {initials(k.assignee ?? "")}
      </span>
    </div>
  );
}

export function EpicsView({
  focusEpic,
  onFocusHandledAction,
}: {
  focusEpic?: { id: string; nonce: number } | null;
  onFocusHandledAction?: () => void;
}) {
  const {
    beads,
    openCreate,
    openDetail,
    selectedBeadId,
    selectBead,
    readOnly,
    loading,
  } = useApp();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [noEpicExpanded, setNoEpicExpanded] = React.useState<boolean | undefined>(undefined);
  const [hideClosed, setHideClosed] = React.useState(true);
  const flashedElement = React.useRef<HTMLElement | null>(null);
  const focusFrame = React.useRef<number | null>(null);
  const flashTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Explicitly ordered: open before closed, then priority ascending, then id
  // for stability. Previously a bare .filter(), so the apparent priority order
  // was incidental to whatever `bd export` returned.
  const allEpics = beads
    .filter((b) => b.issue_type === "epic")
    .sort(
      (a, b) =>
        Number(a.status === "closed") - Number(b.status === "closed") ||
        a.priority - b.priority ||
        a.id.localeCompare(b.id),
    );
  // "Filter out closed" (bead 8vm): hide closed epics (and closed children below).
  // Progress % still counts all children, so it stays accurate. A newly focused
  // closed epic is included for the first render; the focus effect then turns
  // this filter off so the control accurately reflects what is visible.
  const epics = allEpics.filter(
    (e) => !hideClosed || e.status !== "closed" || e.id === focusEpic?.id,
  );

  // Beads that belong to no epic, shown last under a "No epic" section so the
  // screen accounts for every bead. Same Hide Closed and ordering rules as the
  // children above; the header count says how many are hidden.
  const noEpicAll = beadsWithoutEpic(beads);
  const noEpic = noEpicAll
    .filter((b) => !hideClosed || b.status !== "closed")
    .sort(
      (a, b) =>
        Number(a.status === "closed") - Number(b.status === "closed") ||
        a.priority - b.priority ||
        a.id.localeCompare(b.id),
    );
  const noEpicOpen = noEpicExpanded ?? true;

  // Consume each focus request after scrolling. Keeping a handled request in
  // AppShell made its closed-epic exception permanent, so "Hide closed" could
  // never hide that epic and returning to this view focused it again.
  React.useEffect(() => {
    if (!focusEpic) return;
    const el = document.querySelector<HTMLElement>(`[data-epic-id="${CSS.escape(focusEpic.id)}"]`);
    if (!el) return;

    const focusedEpic = beads.find((bead) => bead.id === focusEpic.id);
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      if (focusedEpic?.status === "closed") setHideClosed(false);
      setExpanded((state) => ({ ...state, [focusEpic.id]: true }));
      onFocusHandledAction?.();
      focusFrame.current = null;
    });

    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashedElement.current?.classList.remove("epic-flash");
    flashedElement.current = el;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("epic-flash");
    flashTimeout.current = setTimeout(() => {
      el.classList.remove("epic-flash");
      flashedElement.current = null;
      flashTimeout.current = null;
    }, 1600);
  }, [beads, focusEpic, onFocusHandledAction]);

  React.useEffect(
    () => () => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      flashedElement.current?.classList.remove("epic-flash");
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Epics"
        subtitle={loading && allEpics.length === 0 ? "Loading…" : <>
            {epics.length}
            {hideClosed && allEpics.length !== epics.length ? ` of ${allEpics.length}` : ""} epics ·
            progress = closed ÷ children
        </>}
        actions={<BrandButton
          icon="plus"
          disabled={readOnly}
          onClick={() => openCreate({ type: "epic" })}
        >
          New epic
        </BrandButton>}
        controls={<>
        <span className="flex-1 max-md:hidden" />
        <Button
          icon={hideClosed ? "check" : "x"}
          onClick={() => setHideClosed((v) => !v)}
          title={hideClosed ? "Show closed epics and children" : "Hide closed epics and children"}
        >
          {hideClosed ? "Show Closed" : "Hide Closed"}
        </Button>
        </>}
      />

      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[20px_22px] max-md:p-[12px_16px_24px]">
        <div className="mx-auto flex max-w-[880px] flex-col gap-[14px]">
          {epics.map((e) => {
            const { closed, total, pct } = epicProgress(e.id, beads);
            const kids = childrenOf(e.id, beads)
              .filter((k) => !hideClosed || k.status !== "closed")
              .sort(
                (a, b) =>
                  Number(a.status === "closed") - Number(b.status === "closed") ||
                  a.priority - b.priority,
              );
            // Auto-expand the epic we jumped to (until the user toggles it).
            const isOpen = expanded[e.id] ?? e.id === focusEpic?.id;
            return (
              <section
                key={e.id}
                data-epic-id={e.id}
                className="overflow-hidden rounded-[14px] border border-border bg-[var(--surface)] shadow-[var(--shadow)]"
              >
                {/* Expanding to see children is the PRIMARY action on this
                    screen, so the whole row owns it and the small "Details"
                    button below owns the secondary one. An earlier pass had
                    this inverted — row-click opened details and expand was
                    left to the ~28px chevron alone — which @Nopik reported as
                    a regression on GH #17. Note `!isOpen`, not `!st[e.id]`:
                    isOpen resolves the auto-expand default, and reading the raw
                    map reintroduces the "focused epic won't collapse" bug. */}
                <div
                  role="button"
                  tabIndex={0}
                  data-keyboard-bead-id={e.id}
                  aria-current={selectedBeadId === e.id ? "true" : undefined}
                  aria-expanded={isOpen}
                  onFocus={() => selectBead(e.id)}
                  onClick={() => {
                    selectBead(e.id);
                    setExpanded((st) => ({ ...st, [e.id]: !isOpen }));
                  }}
                  onKeyDown={(ev) => {
                    if (ev.target !== ev.currentTarget) return;
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setExpanded((st) => ({ ...st, [e.id]: !isOpen }));
                    }
                  }}
                  title={isOpen ? "Hide children" : "Show children"}
                  className={`flex cursor-pointer items-center gap-[14px] p-[16px_18px] focus-visible:outline-none max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-3 max-md:p-[14px] ${
                    selectedBeadId === e.id ? "ring-2 ring-inset ring-[var(--brand)]" : ""
                  }`}
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-weak)] text-[var(--brand)]">
                    <Icon name="target" size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* overflow-hidden: every chip on this row is flex-shrink-0,
                        so without it a heavily-labelled epic would spill past
                        the progress block instead of clipping. */}
                    <div className="flex min-w-0 items-center gap-[9px] overflow-hidden max-md:flex-wrap max-md:gap-y-1">
                      <span className="flex-shrink-0 font-mono text-meta text-[var(--text-3)]">
                        {e.id}
                      </span>
                      <StatusChip status={e.status} />
                      <PriorityChip p={e.priority} />
                      <LabelChips labels={e.labels ?? []} max={3} />
                    </div>
                    <div className="mt-[3px] text-section font-semibold tracking-[-.01em]">
                      {e.title}
                    </div>
                  </div>
                  <div className="flex w-[200px] flex-shrink-0 flex-col items-end gap-[7px] max-md:order-4 max-md:w-full max-md:basis-full max-md:items-stretch">
                    <div className="flex items-baseline gap-[6px] max-md:justify-between">
                      <span className="font-mono text-page-title font-semibold tracking-[-.02em]">
                        {pct}%
                      </span>
                      <span className="text-meta text-[var(--text-3)]">
                        {closed}/{total} done
                      </span>
                    </div>
                    <div className="h-[7px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{
                          width: `${pct}%`,
                          background: pct === 100 ? "#16a34a" : "var(--brand)",
                        }}
                      />
                    </div>
                  </div>
                  {/* Secondary action, so it gets a small explicit target with a
                      VISIBLE word — an icon alone wasn't discoverable, which is
                      half of what GH #17 was about. stopPropagation is
                      load-bearing: without it this also toggles the row. */}
                  <Button
                    size="sm"
                    icon="list"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      openDetail(e.id);
                    }}
                    aria-label={`Open details for ${e.id}`}
                    title={`Open details for ${e.id}`}
                    className="max-md:order-5 max-md:basis-full"
                  >
                    Details
                  </Button>
                  {/* Redundant mouse convenience for the row's own toggle. The
                      row carries aria-expanded, so this is aria-hidden and out
                      of the tab order — two elements announcing the same
                      expanded state is a screen-reader annoyance. Stays a
                      <button> inside a role="button" div, never a real
                      <button>, per a3c1328 / GH #10. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setExpanded((st) => ({ ...st, [e.id]: !isOpen }));
                    }}
                    className="tap-target flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] max-md:order-3"
                  >
                    <Icon
                      name="chevron"
                      size={18}
                      className="transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    />
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-border bg-[var(--surface-2)] p-[6px]">
                    {kids.map((k) => (
                      <ChildRow key={k.id} k={k} />
                    ))}
                    <Button
                      variant="ghost"
                      icon="plus"
                      disabled={readOnly}
                      onClick={() => openCreate({ parent: e.id })}
                      className="m-[2px] w-[calc(100%-4px)] justify-start text-[var(--brand)] hover:bg-[var(--surface)] hover:text-[var(--brand)]"
                    >
                      Add child to this epic
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
          {epics.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-border p-10 text-center text-body text-[var(--text-3)]">
              No epics yet. Create one with type “epic”.
            </div>
          )}
          {noEpicAll.length > 0 && (
            <section
              data-no-epic-section
              className="overflow-hidden rounded-[14px] border border-border bg-[var(--surface)] shadow-[var(--shadow)]"
            >
              {/* A group header, not a bead: it only expands and collapses. */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={noEpicOpen}
                onClick={() => setNoEpicExpanded(!noEpicOpen)}
                onKeyDown={(ev) => {
                  if (ev.target !== ev.currentTarget) return;
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setNoEpicExpanded(!noEpicOpen);
                  }
                }}
                title={noEpicOpen ? "Hide beads" : "Show beads"}
                className="flex cursor-pointer items-center gap-[14px] p-[16px_18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)] max-md:gap-3 max-md:p-[14px]"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-2)] text-[var(--text-3)]">
                  <Icon name="list" size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-section font-semibold tracking-[-.01em]">No epic</div>
                  <div className="mt-[3px] text-meta text-[var(--text-3)]">
                    Beads that are not part of any epic · {noEpic.length}
                    {hideClosed && noEpic.length !== noEpicAll.length ? ` of ${noEpicAll.length}` : ""}{" "}
                    {noEpicAll.length === 1 ? "bead" : "beads"}
                  </div>
                </div>
                <Icon
                  name="chevron"
                  size={18}
                  className="flex-shrink-0 text-[var(--text-3)] transition-transform"
                  style={{ transform: noEpicOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </div>
              {noEpicOpen && (
                <div className="border-t border-border bg-[var(--surface-2)] p-[6px]">
                  {noEpic.map((k) => (
                    <ChildRow key={k.id} k={k} />
                  ))}
                  {noEpic.length === 0 && (
                    <div className="p-[9px_12px] text-body text-[var(--text-3)]">
                      Every bead outside an epic is closed. Use Show Closed to see them.
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    icon="plus"
                    disabled={readOnly}
                    onClick={() => openCreate()}
                    className="m-[2px] w-[calc(100%-4px)] justify-start text-[var(--brand)] hover:bg-[var(--surface)] hover:text-[var(--brand)]"
                  >
                    New bead
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

