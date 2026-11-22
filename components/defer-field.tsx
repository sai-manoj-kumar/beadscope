"use client";
import { DateTimeField } from "@/components/date-time-field";
import type { Bead } from "@/lib/schema";

/**
 * A bead's defer date and time (`bd update --defer`): until then the bead stays out of `bd ready`.
 * Most beads have none, so an unset field says "No defer date" and Clear removes a set one.
 */
export function DeferField({ bead }: { bead: Bead }) {
  return (
    <DateTimeField
      beadId={bead.id}
      savedAt={bead.defer_until}
      label="Defer until"
      patchKey="defer"
      testId="defer-field"
      clearLabel="Clear defer date"
      hint="No defer date. Pick one to keep this bead out of ready work until then."
    />
  );
}
