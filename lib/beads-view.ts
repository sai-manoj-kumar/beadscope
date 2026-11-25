import type { Bead } from "./schema";
import { BLOCKING_DEP_TYPES } from "./schema";

/**
 * Pure view-model helpers, ported from the Claude Design export prototype.
 * Framework-agnostic so they can run on the server and the client.
 */

/**
 * A bead needs a human decision when it carries the `human` label (set by
 * `bd human`) and is still actionable (not closed or deferred). Drives the
 * "Needs You" inbox and its sidebar count badge.
 */
export function needsHuman(b: Bead): boolean {
  return (b.labels ?? []).includes("human") && b.status !== "closed" && b.status !== "deferred";
}

/**
 * A human-approval gate: an `issue_type === "gate"` bead created by
 * `bd gate create --type human`. Unlike `bd human` (a label on a normal bead),
 * a gate is its own bead whose sub-type lives in `await_type`, so it never
 * carries the `human` label and `needsHuman()` misses it.
 */
export function isHumanGate(b: Bead): boolean {
  return b.issue_type === "gate" && b.await_type === "human";
}

/**
 * A human-approval gate that is unresolved and not itself blocked — its own
 * blockers (if any) are all closed, so a person can approve/resolve it now.
 * These belong on the "Needs You" inbox alongside `needsHuman()` beads
 * (bead 8qc / gh-6). Resolving = closing the gate, which unblocks its dependents.
 */
export function readyHumanGate(b: Bead, index: Map<string, Bead>): boolean {
  return isHumanGate(b) && b.status !== "closed" && !isBlocked(b, index);
}

/** Beads that this gate blocks (they depend on it via a blocking dep). */
export function gateBlocks(gateId: string, beads: Bead[]): Bead[] {
  return beads.filter((b) =>
    (b.dependencies ?? []).some((d) => d.depends_on_id === gateId && BLOCKING_DEP_TYPES.includes(d.type as never)),
  );
}

/**
 * GFM task-list ("- [ ]" / "- [x]") helpers. Checklists live in the bead
 * description text itself (zero new schema), so toggling rewrites the markdown.
 */
const TASK_RE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]/gm;

export function checklistProgress(text?: string | null): { done: number; total: number } {
  if (!text) return { done: 0, total: 0 };
  const re = new RegExp(TASK_RE);
  let done = 0;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    total++;
    if (m[2].toLowerCase() === "x") done++;
  }
  return { done, total };
}

/** Flip the Nth task checkbox (0-based, document order) and return the new text. */
export function toggleTask(text: string, index: number): string {
  let i = 0;
  return text.replace(TASK_RE, (full, prefix: string, mark: string) => {
    if (i++ !== index) return full;
    return `${prefix}[${mark.toLowerCase() === "x" ? " " : "x"}]`;
  });
}

/**
 * `bd close` with no `--reason` still records a reason: the literal "Closed".
 * That placeholder carries no information, so treat it as absent rather than
 * rendering a "Close reason" section that just says "Closed".
 */
export function closeReasonOf(b: Bead): string {
  const reason = b.close_reason?.trim() ?? "";
  return reason.toLowerCase() === "closed" ? "" : reason;
}

export type StatusCategory = "done" | "wip" | "blocked" | "frozen" | "active";

export function category(status: string): StatusCategory {
  if (status === "closed") return "done";
  if (status === "in_progress" || status === "hooked") return "wip";
  if (status === "blocked") return "blocked";
  if (status === "deferred" || status === "pinned") return "frozen";
  return "active";
}

const CAT_COLORS: Record<StatusCategory, string> = {
  done: "#16a34a",
  wip: "#d97706",
  blocked: "#ef4444",
  frozen: "#64748b",
  active: "#3b82f6",
};
export function catColor(status: string): string {
  return CAT_COLORS[category(status)];
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  deferred: "Deferred",
  closed: "Closed",
  pinned: "Pinned",
  hooked: "Hooked",
};
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const PRIO_COLORS = ["#ef4444", "#f97316", "#eab308", "#0ea5e9", "#64748b"];
const PRIO_LABELS = ["Critical", "High", "Medium", "Low", "Backlog"];
export function prioColor(p: number): string {
  return PRIO_COLORS[p] ?? "#64748b";
}
export function prioLabel(p: number): string {
  return PRIO_LABELS[p] ?? String(p);
}

export function typeColor(t: string): string {
  if (t === "epic") return "var(--brand)";
  if (t === "bug") return "#ef4444";
  return "var(--text-3)";
}
export function typeLabel(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Each is at least 4.5:1 against the white initials drawn on it (checked by the quality gate).
const AVATARS = [
  "#5f50e6",
  "#0369a1",
  "#15803d",
  "#b45309",
  "#be185d",
  "#0e7490",
  "#6d28d9",
];
export function avatarColor(name: string): string {
  if (!name) return "#6b7280";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.split(/[-_ .]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---- relationship helpers (need the full bead set for lookups) ----

export function makeIndex(beads: Bead[]): Map<string, Bead> {
  const m = new Map<string, Bead>();
  for (const b of beads) m.set(b.id, b);
  return m;
}

/**
 * A bead assigned to the current user (the configured human actor) that is still live: not closed
 * or deferred. Human gates and `bd human` beads are left out because the Needs You pages already
 * show them as their own kind of card; this is the plain "your work" part of the list.
 */
export function assignedToYou(b: Bead, actor: string | undefined): boolean {
  const you = actor?.trim();
  if (!you || b.assignee?.trim() !== you) return false;
  if (b.status === "closed" || b.status === "deferred") return false;
  return !isHumanGate(b) && !needsHuman(b);
}

/** How far back the queue pages look for "recently completed" beads. */
export const RECENTLY_COMPLETED_DAYS = 3;
const RECENTLY_COMPLETED_MS = RECENTLY_COMPLETED_DAYS * 86_400_000;

/** When a closed bead was closed: its `closed_at`, else its last update. null when neither is readable. */
export function closedAtMs(b: Pick<Bead, "closed_at" | "updated_at" | "status">): number | null {
  if (b.status !== "closed") return null;
  const t = Date.parse(b.closed_at ?? b.updated_at ?? "");
  return Number.isFinite(t) ? t : null;
}

/** True for a closed bead that was closed in the last {@link RECENTLY_COMPLETED_DAYS} days (archived ones are put away). */
export function completedRecently(b: Bead, now: number = Date.now()): boolean {
  const t = closedAtMs(b);
  // No upper bound on `t`: a bead closed after the page's cached `now` was read (it ticks once a minute) still counts.
  return t !== null && now - t <= RECENTLY_COMPLETED_MS && !(b.labels ?? []).includes("archived");
}

/**
 * A recently completed bead of the kind the Needs You pages list while it is open: an approved human
 * gate, a bead an agent flagged with `bd human` (the label stays after it is closed), or one assigned
 * to the current user.
 */
export function completedForYou(b: Bead, actor: string | undefined, now: number = Date.now()): boolean {
  if (!completedRecently(b, now)) return false;
  const you = actor?.trim();
  return isHumanGate(b) || (b.labels ?? []).includes("human") || (!!you && b.assignee?.trim() === you);
}

/** Newest first. */
export function byClosedAtDesc(a: Bead, b: Bead): number {
  return (closedAtMs(b) ?? 0) - (closedAtMs(a) ?? 0) || a.id.localeCompare(b.id);
}

/**
 * How many beads are waiting on a human: agent-flagged beads (`bd human`), ready human gates, and,
 * when the current user is known, the other live beads assigned to them.
 */
export function countNeedsYou(beads: Bead[], actor?: string): number {
  const index = makeIndex(beads);
  return (
    beads.filter(needsHuman).length +
    beads.filter((b) => readyHumanGate(b, index)).length +
    beads.filter((b) => assignedToYou(b, actor)).length
  );
}

export function isBlocked(b: Bead, index: Map<string, Bead>): boolean {
  if (b.status === "blocked") return true;
  if (b.status !== "open") return false;
  return blockingDeps(b, index).length > 0;
}

/**
 * The unresolved things actually holding this bead up — for naming blockers on a
 * card, so it must not name something the user doesn't experience as a blocker.
 *
 * `parent-child` is excluded even though bd counts it in BLOCKING_DEP_TYPES for
 * ready-queue purposes: the edge points from a child to its epic, so including
 * it makes every blocked child report its own parent epic alongside the real
 * blocker ("blocked by <the epic it lives in>"), which is noise at best and
 * misdirection at worst. Hierarchy is shown as hierarchy elsewhere.
 *
 * Shared by isBlocked so the badge, Focus column, and blocker names agree.
 */
export function blockingDeps(b: Bead, index: Map<string, Bead>): string[] {
  return (b.dependencies ?? [])
    .filter(
      (d) =>
        d.type !== "parent-child" &&
        BLOCKING_DEP_TYPES.includes(d.type as never) &&
        (index.get(d.depends_on_id)?.status ?? "open") !== "closed",
    )
    .map((d) => d.depends_on_id);
}

/**
 * The bead's parent, whatever its type. Resolved from the parent-child
 * dependency EDGE — never `bead.parent`, which `bd export --json` omits, so an
 * edge lookup is the only one correct on board/list data as well as in the
 * drawer.
 *
 * Replaces the former `epicOf`, which returned the same thing but was named as
 * though the parent were always an epic — so a task-parented bead rendered a
 * chip labelled "epic" and clicked through to the Epics screen, which renders
 * epics only. Callers now branch on `parent.issue_type` themselves.
 */
export function parentOf(b: Bead, index: Map<string, Bead>): Bead | null {
  const d = (b.dependencies ?? []).find((x) => x.type === "parent-child");
  return d ? index.get(d.depends_on_id) ?? null : null;
}

/**
 * Children per parent id, built in ONE pass over all beads. Callers render
 * per-card counts from this rather than calling childrenOf() per card, which
 * would be an O(n²) scan on a large board.
 */
export function childrenCountMap(beads: Bead[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of beads) {
    for (const d of b.dependencies ?? []) {
      if (d.type === "parent-child") m.set(d.depends_on_id, (m.get(d.depends_on_id) ?? 0) + 1);
    }
  }
  return m;
}

export function childrenOf(epicId: string, beads: Bead[]): Bead[] {
  return beads.filter((b) =>
    (b.dependencies ?? []).some(
      (d) => d.type === "parent-child" && d.depends_on_id === epicId,
    ),
  );
}

/**
 * Beads the Epics screen would otherwise never show: not epics themselves, not
 * archived, and with no parent-child edge to an epic that exists in `beads`.
 * A bead whose parent is a plain task still counts as epic-less, because the
 * Epics screen lists only the direct children of an epic.
 */
export function beadsWithoutEpic(beads: Bead[]): Bead[] {
  const epicIds = new Set(beads.filter((b) => b.issue_type === "epic").map((b) => b.id));
  return beads.filter(
    (b) =>
      b.issue_type !== "epic" &&
      !(b.labels ?? []).includes("archived") &&
      !(b.dependencies ?? []).some((d) => d.type === "parent-child" && epicIds.has(d.depends_on_id)),
  );
}

export function epicProgress(
  epicId: string,
  beads: Bead[],
): { closed: number; total: number; pct: number } {
  const kids = childrenOf(epicId, beads);
  const total = kids.length;
  const closed = kids.filter((k) => k.status === "closed").length;
  return { closed, total, pct: total ? Math.round((closed / total) * 100) : 0 };
}

// ---- relative time ----

export function relTime(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const d = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 2592000) return `${Math.floor(d / 86400)}d ago`;
  return `${Math.floor(d / 2592000)}mo ago`;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** A bead's due time in ms, or null when it has none (or an unreadable one). */
export function dueMs(bead: Pick<Bead, "due_at">): number | null {
  if (!bead.due_at) return null;
  const t = Date.parse(bead.due_at);
  return Number.isFinite(t) ? t : null;
}

/** True when the bead is not closed and its due time has passed. */
export function isOverdue(bead: Pick<Bead, "due_at" | "status">, now: Date = new Date()): boolean {
  const due = dueMs(bead);
  return due !== null && bead.status !== "closed" && due < now.getTime();
}

/** Due date and time for display, e.g. "Dec 1, 2026, 3:30 PM"; "" when there is none. */
export function fmtDue(bead: Pick<Bead, "due_at">): string {
  return dueMs(bead) === null ? "" : fmtDateTime(bead.due_at);
}

/** A bead's defer time in ms, or null when it has none (or an unreadable one). */
export function deferMs(bead: Pick<Bead, "defer_until">): number | null {
  if (!bead.defer_until) return null;
  const t = Date.parse(bead.defer_until);
  return Number.isFinite(t) ? t : null;
}

/** True while the bead is not closed and its defer time is still ahead: bd keeps it out of ready work until then. */
export function isDeferredUntilLater(bead: Pick<Bead, "defer_until" | "status">, now: Date = new Date()): boolean {
  const until = deferMs(bead);
  return until !== null && bead.status !== "closed" && until > now.getTime();
}

/** Defer date and time for display, e.g. "Dec 1, 2026, 3:30 PM"; "" when there is none. */
export function fmtDefer(bead: Pick<Bead, "defer_until">): string {
  return deferMs(bead) === null ? "" : fmtDateTime(bead.defer_until);
}

/** Full absolute timestamp, e.g. "Jun 24, 2026, 2:15 PM" — used as the hover
 *  title behind relative times like "3d ago" (bead hl2). */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
