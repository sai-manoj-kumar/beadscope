"use client";
import * as React from "react";
import { BrandButton } from "@/components/brand-button";
import { Button, CheckInput } from "@/components/controls";
import { cn } from "@/lib/utils";

/**
 * The pieces of bulk edit that every view shares (List, Board, Focus, Agent Queue): the Select
 * button, the bar that counts the ticked beads, the checkbox on a row or card, and the gesture that
 * ticks one. The state lives in `useBulkSelect`; the dialog is `BulkEditDialog`.
 */

/** A click that ticks instead of opening: Cmd (Mac) or Ctrl (Windows) held. Once selecting, any click ticks. */
export function isSelectGesture(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.metaKey || e.ctrlKey;
}

/**
 * Starts and stops Select mode. It is for phones and touch screens (a tablet has no Cmd key); with a
 * mouse, Cmd/Ctrl-click starts a selection and the header row is already full.
 */
export function SelectButton({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      icon="check"
      pressed={active}
      className={cn("hidden max-md:inline-flex pointer-coarse:inline-flex", className)}
      onClick={onToggle}
    >
      Select
    </Button>
  );
}

/** Shows while beads are being ticked: how many, Select all, Bulk edit and Clear. */
export function BulkBar({
  selected,
  total,
  onSelectAll,
  onEdit,
  onClear,
  className,
}: {
  selected: number;
  /** How many beads the view shows, so "Select all" disappears once they are all ticked. */
  total: number;
  onSelectAll: () => void;
  onEdit: () => void;
  onClear: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="bulk-bar"
      className={cn(
        "flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-[var(--surface-2)] p-[8px_22px] max-md:p-[8px_16px]",
        className,
      )}
    >
      <span aria-live="polite" className="text-label font-medium text-[var(--text)]">
        {selected === 0 ? "Tick beads to edit them together" : `${selected} selected`}
      </span>
      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        {selected < total && (
          <Button variant="outline" size="sm" onClick={onSelectAll}>
            Select all {total}
          </Button>
        )}
        <BrandButton size="sm" icon="pencil" disabled={selected === 0} onClick={onEdit}>
          Bulk edit
        </BrandButton>
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

/**
 * The checkbox of a ticked-able row or card. The whole square (44px on phones) is the target, and a
 * click on it does not reach the row, which would tick it a second time. `className` places it.
 */
export function BulkCheck({
  id,
  checked,
  onToggle,
  className,
}: {
  id: string;
  checked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <label
      className={cn("tap-target flex flex-shrink-0 cursor-pointer items-center justify-center md:min-h-[32px] md:min-w-[32px]", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <CheckInput aria-label={`Select ${id}`} checked={checked} onChange={onToggle} />
    </label>
  );
}
