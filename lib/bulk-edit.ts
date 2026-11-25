import type { UpdateInput } from "@/lib/schema";

/**
 * Statuses a bulk edit may set to something other than closed. Pinned and hooked are internal
 * states that the board does not offer either.
 */
export const BULK_STATUSES = ["open", "in_progress", "blocked", "deferred"] as const;

/**
 * What the Bulk edit dialog can change. A field that is `undefined` (or an empty list) is "leave
 * as it is": every bead keeps its own value for it. `assignee: ""` means unassign, as in
 * `UpdateInput`. `status: "closed"` closes the bead through the status route, not the update
 * route, because a close takes a reason and bd only lets a claimed bead's assignee close it (the
 * server picks the actor, see `closeActor`).
 */
export interface BulkChanges {
  priority?: number;
  assignee?: string;
  status?: (typeof BULK_STATUSES)[number] | "closed";
  addLabels?: string[];
  removeLabels?: string[];
  /** Why the beads are closed; only used when `status` is `closed`. Optional, as for a single bead. */
  closeReason?: string;
}

/** Split what was typed into labels: commas or whitespace separate them, duplicates and blanks drop out. */
export function parseLabels(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter(Boolean))];
}

export function hasBulkChanges(c: BulkChanges): boolean {
  return (
    c.priority !== undefined ||
    c.assignee !== undefined ||
    c.status !== undefined ||
    !!c.addLabels?.length ||
    !!c.removeLabels?.length
  );
}

/**
 * The PATCH body for one bead: only the fields the user chose to change. A close is not part of it
 * (see `bulkCloses`).
 */
export function bulkPatch(c: BulkChanges): UpdateInput {
  const patch: UpdateInput = {};
  if (c.priority !== undefined) patch.priority = c.priority;
  // Reassigning to someone else and then closing would make bd refuse the close (only the assignee may
  // close a claimed bead), leaving the bead reassigned and open, so a close never changes the assignee.
  if (c.assignee !== undefined && !bulkCloses(c)) patch.assignee = c.assignee;
  if (c.status !== undefined && c.status !== "closed") patch.status = c.status;
  if (c.addLabels?.length) patch.addLabels = c.addLabels;
  if (c.removeLabels?.length) patch.removeLabels = c.removeLabels;
  return patch;
}

/** True when the edit closes the beads. The close runs after the update, so the other fields land first. */
export function bulkCloses(c: BulkChanges): boolean {
  return c.status === "closed";
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
