"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Button, TextInput } from "@/components/controls";
import { useUpdateBead } from "@/hooks/use-beads";
import { dueToInputValue, inputValueToDue } from "@/lib/due-input";
import type { UpdateInput } from "@/lib/schema";

/**
 * A bead's date and time field (Due, Defer until): set, change or clear it. Times are read and
 * written in the browser's time zone and saved as an instant. The change is saved when the field
 * loses focus or on Enter, not on each keystroke: the field passes through several valid dates
 * while someone types a year. An incomplete value goes back to the last saved one; Clear removes
 * the date.
 */
export function DateTimeField({
  beadId,
  savedAt,
  label,
  patchKey,
  testId,
  clearLabel,
  hint,
  children,
}: {
  beadId: string;
  /** The stored instant (ISO), or empty when none is set. */
  savedAt?: string | null;
  label: string;
  /** The update field this field writes. */
  patchKey: "due" | "defer";
  testId: string;
  clearLabel: string;
  /** A short line under the field while no date is set, e.g. what that means. */
  hint?: string;
  /** Extra content next to the Clear button (a status chip). */
  children?: React.ReactNode;
}) {
  const { readOnly } = useApp();
  const update = useUpdateBead();
  const saved = dueToInputValue(savedAt);
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
  // Nothing to show on a read-only server when no date is set.
  if (readOnly && !saved) return null;

  const save = (value: string, iso: string) => {
    const previous = sent;
    setSent(value);
    const patch: UpdateInput = patchKey === "due" ? { due: iso } : { defer: iso };
    update.mutate(
      { id: beadId, patch },
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
    const iso = inputValueToDue(draft);
    if (iso === null) {
      setDraft(sent); // incomplete or out of range: keep what is saved
      return;
    }
    if (draft !== sent) save(draft, iso);
  };
  const clear = () => {
    if (readOnly) return;
    setDraft("");
    save("", "");
  };

  return (
    <div data-testid={testId} className="col-span-2 flex flex-col gap-[5px]">
      <label htmlFor={`${testId}-${beadId}`} className="text-meta font-medium uppercase tracking-[.03em] text-[var(--text-3)]">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          id={`${testId}-${beadId}`}
          type="datetime-local"
          className="min-w-0 flex-1"
          value={draft}
          disabled={readOnly}
          aria-busy={update.isPending}
          onChange={(e) => setDraft(e.target.value)}
          // Pressing Clear blurs the field first; skip that save so it cannot race the clear.
          onBlur={(e) => {
            if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.dataset.dateClear === testId) return;
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
            aria-label={clearLabel}
            data-date-clear={testId}
            // Keeps focus in the field on mouse down, so the field does not blur and save before Clear runs.
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            Clear
          </Button>
        )}
        {children}
      </div>
      {hint && !saved && !sent && <p className="text-meta text-[var(--text-3)]">{hint}</p>}
    </div>
  );
}
