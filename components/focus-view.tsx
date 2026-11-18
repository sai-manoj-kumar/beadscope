"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Button, LinkButton, SelectField } from "@/components/controls";
import { Icon, typeIconName } from "@/components/icons";
import { PriorityChip } from "@/components/board/bead-card";
import { AgentIcon } from "@/components/agent-icon";
import { PageHeader } from "@/components/page-header";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { agentByName } from "@/lib/agents";
import { isBlocked, blockingDeps, relTime, fmtDateTime, typeColor, catColor } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/**
 * Focus — "what's happening now". Three fixed columns cut by status × priority:
 *
 *   In flight — in_progress or hooked (work claimed or attached to an agent)
 *   Blocked   — blocked status, or open with an unresolved blocking dep
 *   Next up   — open, unblocked, P0/P1 only
 *
 * Recently finished work can be shown as an optional fourth column.
 * Everything else (the deep ready pool, P2+ backlog) stays behind
 * the Board/List views — that's the point: an optional screen that answers
 * "what's in flight, what's stuck, what would I pick up next" without scrolling.
 *
 * Lane chips: when BEADSCOPE_LANE_PREFIX is set (e.g. "ctx:"), one chip per lane
 * label found on the visible beads filters all three columns — a one-click
 * "show me this lane's now". Unset → no chips.
 */

const ARCHIVED = "archived";
const RECENT_LIMIT = 7;
type FocusColumn = { id: string; title: string; hint: string; items: Bead[] };

function completionDate(bead: Bead): string | undefined {
  // Invalid/missing completion dates fall back to the last known update.
  const closed = Date.parse(bead.closed_at || "");
  if (Number.isFinite(closed)) return bead.closed_at || undefined;
  const updated = Date.parse(bead.updated_at || "");
  return Number.isFinite(updated) ? bead.updated_at : undefined;
}

function completionTime(bead: Bead): number {
  return Date.parse(completionDate(bead) || "") || 0;
}

function assigneeKey(bead: Bead): string {
  // Prefix real names so no name can collide with the blank-assignee sentinel.
  return bead.assignee?.trim() ? `person:${bead.assignee.trim()}` : "none";
}

function assigneeGroups(columns: FocusColumn[]) {
  const groups = new Map<string, { key: string; label: string; columns: FocusColumn[]; active: boolean }>();
  for (const [columnIndex, column] of columns.entries()) {
    for (const bead of column.items) {
      const key = assigneeKey(bead);
      let group = groups.get(key);
      if (!group) {
        group = { key, label: bead.assignee?.trim() || "No assignee",
          columns: columns.map(c => ({ ...c, items: [] })), active: false };
        groups.set(key, group);
      }
      group.columns[columnIndex].items.push(bead);
      group.active ||= column.id === "flight";
    }
  }
  return [...groups.values()].sort((a, b) =>
    Number(a.key === "none") - Number(b.key === "none") ||
    Number(b.active) - Number(a.active) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function laneOf(b: Bead, prefix: string): string | null {
  const l = (b.labels ?? []).find((x) => x.startsWith(prefix));
  return l ? l.slice(prefix.length) : null;
}

export function FocusView() {
  const { beads, index, meta, loading } = useApp();
  const prefix = meta?.lanePrefix ?? null;
  const [groupBy, setGroupBy] = React.useState<"none" | "assignee">("none");
  const [showRecent, setShowRecent] = React.useState(false);
  const [showAllRecent, setShowAllRecent] = React.useState(false);
  const [lane, setLane] = React.useState<string | null>(null); // null = all, "" = unlabeled
  const [agent, setAgent] = React.useState<string | null>(null); // null = all; else an agent identity id

  const active = React.useMemo(
    () => beads.filter((b) => !(b.labels ?? []).includes(ARCHIVED)),
    [beads],
  );

  const lanes = React.useMemo(() => {
    if (!prefix) return [];
    const s = new Set<string>();
    for (const b of active) {
      if (!["in_progress", "hooked", "blocked", "open"].includes(b.status) && !(showRecent && b.status === "closed")) continue;
      const l = laneOf(b, prefix);
      if (l) s.add(l);
    }
    return [...s].sort();
  }, [active, prefix, showRecent]);

  // A live update can remove the selected lane. Fall back to All so the
  // hidden filter cannot strand the user on an empty screen.
  const selectedLane = lane && !lanes.includes(lane) ? null : lane;

  // The agent chips list the enabled identities (Settings → Agents). A live
  // update or a Settings change can switch the selected one off; fall back to
  // All so the hidden filter cannot strand the user on an empty screen.
  const enabledAgents = React.useMemo(() => (meta?.agents ?? []).filter((a) => a.enabled), [meta?.agents]);
  const selectedAgent = enabledAgents.find((a) => a.id === agent) ?? null;

  const inLane = React.useCallback(
    (b: Bead) => {
      if (selectedAgent && agentByName([selectedAgent], b.assignee)?.id !== selectedAgent.id) return false;
      if (!prefix || selectedLane === null) return true;
      const l = laneOf(b, prefix);
      return selectedLane === "" ? l === null : l === selectedLane;
    },
    [prefix, selectedLane, selectedAgent],
  );

  const inFlight = React.useMemo(
    () => active.filter((b) => (b.status === "in_progress" || b.status === "hooked") && inLane(b)),
    [active, inLane],
  );
  const blocked = React.useMemo(
    () => active.filter((b) => isBlocked(b, index) && inLane(b)),
    [active, index, inLane],
  );
  const nextUp = React.useMemo(
    () =>
      active.filter(
        // One agent's queue shows everything assigned to it, not just P0/P1.
        (b) => b.status === "open" && (selectedAgent !== null || b.priority <= 1) && !isBlocked(b, index) && inLane(b),
      ),
    [active, index, inLane, selectedAgent],
  );

  const recentlyFinished = active.filter(b => b.status === "closed" && inLane(b))
    .sort((a, b) => completionTime(b) - completionTime(a) || a.id.localeCompare(b.id));
  const recentItems = showAllRecent ? recentlyFinished : recentlyFinished.slice(0, RECENT_LIMIT);
  const columns: FocusColumn[] = [
    { id: "flight", title: "In flight", hint: "in progress or hooked", items: inFlight },
    { id: "blocked", title: "Blocked", hint: "waiting on a dependency or marked blocked", items: blocked },
    { id: "next", title: "Next up", hint: selectedAgent ? "ready · any priority" : "ready · P0/P1", items: nextUp },
    ...(showRecent ? [{ id: "recent", title: "Recently finished", hint: "latest completions", items: recentItems }] : []),
  ];
  const groups = groupBy === "assignee" ? assigneeGroups(columns) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Focus"
        subtitle={loading && beads.length === 0 ? "what\u2019s happening now · loading…" : <>
            what&rsquo;s happening now · {inFlight.length} in flight · {blocked.length} blocked ·{" "}
            {nextUp.length} next up
        </>}
        controls={<>
        <span className="flex-1 max-md:hidden" />
        <label className="flex items-center gap-2 text-label text-[var(--text-2)] tap-target">
          Group by
          <SelectField size="sm" value={groupBy} onChange={e => setGroupBy(e.target.value === "assignee" ? "assignee" : "none")}>
            <option value="none">None</option>
            <option value="assignee">Assignee</option>
          </SelectField>
        </label>
        <Button size="sm" variant="outline" pressed={showRecent} onClick={() => { setShowRecent(!showRecent); setShowAllRecent(false); }}>
          Recently finished
        </Button>
        {enabledAgents.length > 0 && (
          <div role="group" aria-label="Agent queue" className="flex flex-wrap items-center gap-[6px] max-md:basis-full">
            <span className="text-label text-[var(--text-2)]">Agent</span>
            <LaneChip label="All" selected={selectedAgent === null} onClick={() => setAgent(null)} />
            {enabledAgents.map((a) => (
              <LaneChip
                key={a.id}
                label={a.name}
                icon={<AgentIcon agent={a} size={14} />}
                selected={selectedAgent?.id === a.id}
                onClick={() => setAgent(selectedAgent?.id === a.id ? null : a.id)}
              />
            ))}
          </div>
        )}
        {prefix && lanes.length > 0 && (
          <div className="flex flex-wrap items-center gap-[6px] max-md:basis-full">
            <LaneChip label="All" selected={selectedLane === null} onClick={() => setLane(null)} />
            {lanes.map((l) => (
              <LaneChip
                key={l}
                label={l}
                selected={selectedLane === l}
                onClick={() => setLane(selectedLane === l ? null : l)}
              />
            ))}
            <LaneChip
              label="unlabeled"
              selected={selectedLane === ""}
              onClick={() => setLane(selectedLane === "" ? null : "")}
            />
          </div>
        )}
        </>}
      />

      {showRecent && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border px-[22px] py-2 text-label text-[var(--text-2)] max-md:px-4">
          <span aria-live="polite">Showing {recentItems.length} of {recentlyFinished.length} completed beads</span>
          {recentlyFinished.length > RECENT_LIMIT && (
            <LinkButton tone="brand" className="rounded px-2 py-1 font-medium hover:bg-[var(--brand-weak)]" onClick={() => setShowAllRecent(!showAllRecent)}>
              {showAllRecent ? `Show latest ${RECENT_LIMIT}` : `Show all ${recentlyFinished.length} completed`}
            </LinkButton>
          )}
          <span className="text-[var(--text-3)]">Current lane filter applies. Active and blocked work is always shown in full.</span>
        </div>
      )}
      {groupBy === "none" ? (
        <div className="bd-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-[18px_22px] max-md:overflow-x-hidden max-md:overflow-y-auto max-md:p-[8px_16px_24px]">
          <div className="flex h-full min-h-0 gap-4 max-md:h-auto max-md:flex-col max-md:gap-1">
            {columns.map(c => <FocusColumnView key={c.id} column={c} />)}
          </div>
        </div>
      ) : (
        <div className="bd-scroll min-h-0 flex-1 overflow-auto p-[18px_22px] max-md:p-[8px_16px_24px]">
          {groups.length === 0 ? <p className="p-4 text-body text-[var(--text-3)]">No matching work. Try another lane or include recently finished work.</p> : (
            <div className="min-w-max max-md:min-w-0">
              <div className="sticky top-0 z-10 mb-2 flex gap-4 bg-[var(--bg)] py-2 max-md:hidden" aria-hidden="true">
                <div className="w-[160px] shrink-0 text-label font-medium text-[var(--text-3)]">Assignee</div>
                {columns.map(c => <div key={c.id} className="w-[280px] shrink-0 text-body font-semibold">{c.title} <span className="font-normal text-[var(--text-3)]">· {c.items.length}</span></div>)}
              </div>
              {groups.map(group => (
                <section key={group.key} aria-label={`Assignee: ${group.label}`} className="flex gap-4 border-t border-border py-4 max-md:flex-col max-md:gap-2">
                  <div className="w-[160px] shrink-0 max-md:w-full">
                    <h2 className="flex items-center gap-[6px] break-words text-body font-semibold">
                      {agentByName(meta?.agents, group.label) && <AgentIcon agent={agentByName(meta?.agents, group.label)!} size={16} />}
                      {group.label}
                    </h2>
                    <p className="mt-1 text-meta text-[var(--text-3)]">{group.key === "none" ? "Not assigned" : "Assigned work"} · {group.columns.reduce((n, c) => n + c.items.length, 0)}</p>
                  </div>
                  {group.columns.map(c => <FocusColumnView key={c.id} column={c} grouped />)}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FocusColumnView({ column, grouped = false }: { column: FocusColumn; grouped?: boolean }) {
  // Phones stack the columns and fold each one; an empty one starts folded so it does not
  // take a screen of blank space.
  const mobile = useIsMobile();
  const [folded, setFolded] = React.useState<boolean | null>(null);
  const isFolded = mobile && !grouped && (folded ?? column.items.length === 0);
  const listId = React.useId();
  return (
    <section data-focus-column={column.id} aria-label={grouped ? column.title : undefined}
      className={grouped ? "w-[280px] shrink-0 max-md:w-full" : "flex h-full min-h-0 w-[320px] shrink-0 flex-col max-md:h-auto max-md:w-full max-md:shrink"}>
      {!grouped && <div className="relative mb-2 flex flex-wrap items-baseline gap-2 px-1 max-md:min-h-11 max-md:flex-nowrap max-md:items-center">
        {/* The button is just the title, so the heading reads "Blocked"; on phones it stretches over the whole row. */}
        <h2 className="m-0 text-body font-semibold text-[var(--text)]">
          {mobile ? (
            <button type="button" aria-expanded={!isFolded} aria-controls={listId} aria-label={`${column.title} lane`}
              onClick={() => setFolded(!isFolded)}
              className="tap-target flex items-center text-left after:absolute after:inset-0">
              {column.title}
            </button>
          ) : column.title}
        </h2>
        <span className="text-meta text-[var(--text-3)] max-md:min-w-0 max-md:truncate">{column.items.length} · {column.hint}</span>
        <Icon name="chevron" size={14} className={`pointer-events-none ml-auto text-[var(--text-3)] transition-transform md:hidden ${isFolded ? "-rotate-90" : ""}`} />
      </div>}
      <div id={listId} hidden={isFolded} className={`rounded-[12px] border border-border bg-[var(--surface-2)] p-2 ${isFolded ? "hidden" : ""} ${grouped ? "min-h-[70px]" : "bd-scroll min-h-0 flex-1 overflow-y-auto max-md:overflow-visible"}`}>
        {column.items.length === 0 ? <div className="p-4 text-center text-label text-[var(--text-3)]">Nothing here.</div> : (
          <div className="flex flex-col gap-2">{column.items.map(b => (
            <FocusCard key={b.id} bead={b} showBlockers={column.id === "blocked"} />
          ))}</div>
        )}
      </div>
    </section>
  );
}

function LaneChip({
  label,
  selected,
  onClick,
  icon,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={selected}
      onClick={onClick}
      className="tap-target inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[3px] text-meta font-medium transition-colors"
      style={
        selected
          ? { borderColor: "var(--brand)", background: "var(--brand-weak)", color: "var(--brand)" }
          : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }
      }
    >
      {icon}
      {label}
    </button>
  );
}

function FocusCard({ bead, showBlockers }: { bead: Bead; showBlockers?: boolean }) {
  const { index, openDetail, selectedBeadId, selectBead } = useApp();
  const blockers = showBlockers ? blockingDeps(bead, index) : [];
  const timestamp = bead.status === "closed" ? completionDate(bead) : bead.updated_at;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={bead.title}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail(bead.id);
        }
      }}
      onClick={() => {
        selectBead(bead.id);
        openDetail(bead.id);
      }}
      className={`cursor-pointer rounded-[11px] border bg-[var(--surface)] p-[10px_12px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      <div className="mb-[5px] flex items-center gap-[7px]">
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: catColor(bead.status) }} />
        <span className="font-mono text-meta text-[var(--text-3)]">{bead.id}</span>
        <span className="flex-1" />
        <PriorityChip p={bead.priority} />
        <Icon
          name={typeIconName(bead.issue_type)}
          size={13}
          style={{ color: typeColor(bead.issue_type) }}
        />
      </div>
      <div className="text-label font-medium leading-[1.35] text-[var(--text)] [text-wrap:pretty]">
        {bead.title}
      </div>
      <div className="mt-[6px] flex flex-wrap items-center gap-x-[8px] gap-y-1 text-meta text-[var(--text-3)]">
        <span title={fmtDateTime(timestamp)}>{relTime(timestamp)}</span>
        {blockers.length > 0 && (
          <span className="truncate font-mono" title={`blocked by ${blockers.join(", ")}`}>
            ⛔ {blockers.join(", ")}
          </span>
        )}
      </div>
    </article>
  );
}
