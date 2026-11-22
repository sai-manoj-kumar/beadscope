import type { Bead, BeadType } from "./schema";
import { BEAD_TYPES } from "./schema";
import { dueToInputValue } from "./due-input";
import { ARCHIVED_LABEL } from "./filters";

/**
 * The create form's starting values when a bead is cloned. Only what `bd create` takes is copied;
 * the new bead starts fresh, so comments, activity, dependencies, status and close reason are left
 * behind. The status maps to the form's one choice: a Backlog (deferred) bead clones into the
 * Backlog, anything else starts Ready. The `archived` label is state, not a tag, so it is dropped.
 */
export interface CloneDraft {
  type: BeadType;
  priority: number;
  title: string;
  description: string;
  assignee: string;
  parent: string;
  labels: string;
  /** A datetime-local value in the browser's time zone; "" when none. */
  due: string;
  backlog: boolean;
}

export function cloneDraft(bead: Bead): CloneDraft {
  const type = (BEAD_TYPES as readonly string[]).includes(bead.issue_type)
    ? (bead.issue_type as BeadType)
    : "task";
  return {
    type,
    priority: bead.priority,
    title: bead.title,
    description: bead.description ?? "",
    assignee: bead.assignee ?? "",
    // From the parent-child edge: list data has no `bead.parent` (see parentOf in beads-view.ts).
    parent: (bead.dependencies ?? []).find((d) => d.type === "parent-child")?.depends_on_id ?? bead.parent ?? "",
    labels: (bead.labels ?? []).filter((l) => l !== ARCHIVED_LABEL).join(", "),
    due: dueToInputValue(bead.due_at),
    backlog: bead.status === "deferred",
  };
}
