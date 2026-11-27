import type { UpdateInput } from "@/lib/schema";

/**
 * Statuses a bulk edit sets with a plain update. Pinned and hooked are internal states that the
 * board does not offer either. Closing is a separate step (see `BULK_CLOSED`).
 */
export const BULK_STATUSES = ["open", "in_progress", "blocked", "deferred"] as const;

/**
 * Closing is not a plain update: it goes through `bd close`, which takes a reason and only lets a
 * claimed bead's assignee close it (the server picks that actor, see `closeActor`).
 */
export const BULK_CLOSED = "closed";

/** The label that marks a bead archived. It is state, not a tag, so a bulk edit never adds or removes it. */
const ARCHIVED = "archived";

/**
 * What the Bulk edit dialog can change. A field that is `undefined` is "leave as it is": every
 * bead keeps its own value for it. `assignee: ""` means unassign, as in `UpdateInput`.
 */
export interface BulkChanges {
  priority?: number;
  assignee?: string;
  status?: (typeof BULK_STATUSES)[number] | typeof BULK_CLOSED;
  /** Why the beads are closed; only used when `status` is closed. */
  closeReason?: string;
  /** Labels each bead gains, and labels each bead loses. Beads keep every other label they have. */
  addLabels?: string[];
  removeLabels?: string[];
  /** Due and defer date and time as ISO timestamps with a zone; `""` clears it, as in `UpdateInput`. */
  due?: string;
  defer?: string;
}

/**
 * Turns what a person typed ("frontend, urgent") into a clean label list: comma separated,
 * trimmed, without blanks, repeats, the archive flag, a leading dash (it would read as a flag) or a
 * double quote (bd reads the list as CSV). These match what the server accepts.
 */
export function parseLabels(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(",")) {
    const label = part.trim();
    if (label && label !== ARCHIVED && !label.startsWith("-") && !label.includes('"') && !out.includes(label)) out.push(label);
  }
  return out;
}

/** Labels asked to be both added and removed, which has no sensible meaning. */
export function labelConflicts(c: BulkChanges): string[] {
  return (c.addLabels ?? []).filter((l) => (c.removeLabels ?? []).includes(l));
}

export function hasBulkChanges(c: BulkChanges): boolean {
  return (
    c.priority !== undefined ||
    c.assignee !== undefined ||
    c.status !== undefined ||
    !!c.addLabels?.length ||
    !!c.removeLabels?.length ||
    c.due !== undefined ||
    c.defer !== undefined
  );
}

/** True when the edit closes the beads. */
export function isBulkClose(c: BulkChanges): boolean {
  return c.status === BULK_CLOSED;
}

/**
 * The PATCH body for one bead: only the fields the user chose to change. A close is not part of it
 * (it is a second call, `api.setStatus`), so the body can be empty.
 */
export function bulkPatch(c: BulkChanges): UpdateInput {
  const patch: UpdateInput = {};
  if (c.priority !== undefined) patch.priority = c.priority;
  if (c.assignee !== undefined) patch.assignee = c.assignee;
  if (c.status !== undefined && c.status !== BULK_CLOSED) patch.status = c.status;
  if (c.addLabels?.length) patch.add_labels = c.addLabels;
  if (c.removeLabels?.length) patch.remove_labels = c.removeLabels;
  if (c.due !== undefined) patch.due = c.due;
  if (c.defer !== undefined) patch.defer = c.defer;
  return patch;
}

/** A bead in one repo. Bead ids are only unique within a repo, so the all-repos Agent Queue names both. */
export interface BulkTarget {
  projectId: string;
  id: string;
}

const KEY_SEPARATOR = "\u001f";

/** One string per bead across repos, for `useBulkSelect`, which tracks plain strings. */
export function targetKey(t: BulkTarget): string {
  return `${t.projectId}${KEY_SEPARATOR}${t.id}`;
}

export function parseTargetKey(key: string): BulkTarget {
  const i = key.indexOf(KEY_SEPARATOR);
  return { projectId: key.slice(0, i), id: key.slice(i + 1) };
}
