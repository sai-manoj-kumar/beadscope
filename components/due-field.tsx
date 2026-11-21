"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Chip } from "@/components/chip";
import { Button, TextInput } from "@/components/controls";
import { useUpdateBead } from "@/hooks/use-beads";
import { fmtDue, isOverdue } from "@/lib/beads-view";
import { dueToInputValue, inputValueToDue } from "@/lib/due-input";
import type { Bead } from "@/lib/schema";

/**
 * A bead's due date and time: set, change or clear it. Times are read and written in the browser's
 * time zone and saved as an instant (`bd update --due`). The change is saved when the field loses
 * focus or on Enter, not on each keystroke: the field passes through several valid dates while
 * someone types a year. An incomplete value goes back to the saved one; Clear removes the date.
 */
export function DueField({ bead }: { bead: Bead }) {
  // Keyed by the saved value so the draft starts over when the bead changes underneath it (another save, a refresh).
  return <DueEditor key={dueToInputValue(bead.due_at)} bead={bead} />;
}

function DueEditor({ bead }: { bead: Bead }) {
  const { readOnly } = useApp();
  const update = useUpdateBead();
  const saved = dueToInputValue(bead.due_at);
  const [draft, setDraft] = React.useState(saved);
  const dueText = fmtDue(bead);
  // Nothing to show on a read-only server when no due date is set.
  if (readOnly && !dueText) return null;

  const commit = () => {
    if (readOnly || update.isPending) return;
    const due = inputValueToDue(draft);
    if (due === null || draft === saved) {
      setDraft(saved); // incomplete or unchanged: keep what is saved
      return;
    }
    update.mutate({ id: bead.id, patch: { due } }, { onError: () => setDraft(saved) });
  };
  const clear = () => {
    if (readOnly || update.isPending) return;
    setDraft("");
    update.mutate({ id: bead.id, patch: { due: "" } }, { onError: () => setDraft(saved) });
  };

  return (
    <div data-testid="due-field" className="col-span-2 flex flex-col gap-[5px]">
      <label htmlFor={`due-${bead.id}`} className="text-meta font-medium uppercase tracking-[.03em] text-[var(--text-3)]">
        Due
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          id={`due-${bead.id}`}
          type="datetime-local"
          className="min-w-0 flex-1"
          value={draft}
          disabled={readOnly || update.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        {saved && !readOnly && (
          <Button variant="outline" aria-label="Clear due date" disabled={update.isPending} onClick={clear}>
            Clear
          </Button>
        )}
        {isOverdue(bead) && <Chip color="#ef4444">Overdue</Chip>}
      </div>
    </div>
  );
}
