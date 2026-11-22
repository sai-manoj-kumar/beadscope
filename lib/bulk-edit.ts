import type { UpdateInput } from "@/lib/schema";

/**
 * Statuses a bulk edit may set. Closing is left out: bd only lets the assignee close a claimed bead
 * and a close takes a reason, so it stays a per-bead action in the drawer. Pinned and hooked are
 * internal states that the board does not offer either.
 */
export const BULK_STATUSES = ["open", "in_progress", "blocked", "deferred"] as const;

/**
 * What the Bulk edit dialog can change. A field that is `undefined` is "leave as it is": every
 * bead keeps its own value for it. `assignee: ""` means unassign, as in `UpdateInput`.
 */
export interface BulkChanges {
  priority?: number;
  assignee?: string;
  status?: (typeof BULK_STATUSES)[number];
}

export function hasBulkChanges(c: BulkChanges): boolean {
  return c.priority !== undefined || c.assignee !== undefined || c.status !== undefined;
}

/** The PATCH body for one bead: only the fields the user chose to change. */
export function bulkPatch(c: BulkChanges): UpdateInput {
  const patch: UpdateInput = {};
  if (c.priority !== undefined) patch.priority = c.priority;
  if (c.assignee !== undefined) patch.assignee = c.assignee;
  if (c.status !== undefined) patch.status = c.status;
  return patch;
}
