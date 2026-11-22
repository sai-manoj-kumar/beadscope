"use client";
import { Chip } from "@/components/chip";
import { DateTimeField } from "@/components/date-time-field";
import { isOverdue } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/** A bead's due date and time (`bd update --due`): set, change or clear it. */
export function DueField({ bead }: { bead: Bead }) {
  return (
    <DateTimeField beadId={bead.id} savedAt={bead.due_at} label="Due" patchKey="due" testId="due-field" clearLabel="Clear due date">
      {isOverdue(bead) && <Chip color="#ef4444">Overdue</Chip>}
    </DateTimeField>
  );
}
