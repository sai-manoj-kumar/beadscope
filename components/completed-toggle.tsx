"use client";
import { Button } from "@/components/controls";
import { RECENTLY_COMPLETED_DAYS } from "@/lib/beads-view";

/** The `?done=1` URL param that carries the toggle, so a link or a reload keeps it. */
export const DONE_PARAM = "done";

/**
 * The same toggle inside a project's own view. `?done=` is taken there (the Board's Done-column window,
 * in days) and the project views share one URL, so the toggle uses `?completed=1` instead.
 */
export const PROJECT_DONE_PARAM = "completed";

/** On/off switch at the top of a queue page: also list what was completed in the last few days. */
export function CompletedToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      icon="check"
      pressed={on}
      data-completed-toggle
      onClick={() => onChange(!on)}
      title={`Also list beads completed in the last ${RECENTLY_COMPLETED_DAYS} days`}
    >
      Completed · {RECENTLY_COMPLETED_DAYS}d
    </Button>
  );
}
