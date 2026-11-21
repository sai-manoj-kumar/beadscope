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
 * someone types a year. An incomplete value goes back to the last saved one; Clear removes the date.
 */
export function DueField({ bead }: { bead: Bead }) {
  const { readOnly } = useApp();
  const update = useUpdateBead();
  const saved = dueToInputValue(bead.due_at);
  const [draft, setDraft] = React.useState(saved);
  // The value last sent to bd. Comparing against it, not `saved`, stops a second blur from sending
  // the same value again while the list is still refreshing.
  const [sent, setSent] = React.useState(saved);
  const [seen, setSeen] = React.useState(saved);
  // The bead changed underneath us (our own save landing, another save, a refresh): follow it,
  // unless the user has typed something new since the last save.
  if (saved !== seen) {
    setSeen(saved);
    setSent(saved);
    if (draft === sent || draft === seen) setDraft(saved);
  }
  const dueText = fmtDue(bead);
  // Nothing to show on a read-only server when no due date is set.
  if (readOnly && !dueText) return null;

  const save = (value: string, due: string) => {
    const previous = sent;
    setSent(value);
    update.mutate(
      { id: bead.id, patch: { due } },
      {
        onError: () => {
          setSent(previous);
          setDraft(previous);
        },
      },
    );
  };
  const commit = () => {
    if (readOnly) return;
    const due = inputValueToDue(draft);
    if (due === null) {
      setDraft(sent); // incomplete or out of range: keep what is saved
      return;
    }
    if (draft !== sent) save(draft, due);
  };
  const clear = () => {
    if (readOnly) return;
    setDraft("");
    save("", "");
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
          disabled={readOnly}
          aria-busy={update.isPending}
          onChange={(e) => setDraft(e.target.value)}
          // Pressing Clear blurs the field first; skip that save so it cannot race the clear.
          onBlur={(e) => {
            if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.dataset.dueClear) return;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        {(saved || sent) && !readOnly && (
          <Button
            variant="outline"
            aria-label="Clear due date"
            data-due-clear="true"
            // Keeps focus in the field on mouse down, so the field does not blur and save before Clear runs.
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            Clear
          </Button>
        )}
        {isOverdue(bead) && <Chip color="#ef4444">Overdue</Chip>}
      </div>
    </div>
  );
}
