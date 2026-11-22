"use client";
import * as React from "react";

/**
 * Which beads are ticked for a bulk edit. `visibleIds` is what the view shows right now: a bead
 * that is filtered out, closed or deleted drops out of the selection, so the Bulk edit button never
 * acts on a bead the user cannot see.
 *
 * `selecting` is the phone's Select mode (checkboxes on every row). On desktop the checkboxes appear
 * as soon as one bead is ticked with Cmd or Ctrl held, so `active` covers both.
 */
export function useBulkSelect(visibleIds: string[]) {
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = React.useState(false);

  const selected = React.useMemo(() => {
    const visible = new Set(visibleIds);
    return new Set([...picked].filter((id) => visible.has(id)));
  }, [picked, visibleIds]);

  const toggle = React.useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clear = React.useCallback(() => {
    setPicked(new Set());
    setSelecting(false);
  }, []);
  const deselect = React.useCallback((ids: string[]) => {
    setPicked((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
  }, []);
  const selectAll = React.useCallback(() => setPicked(new Set(visibleIds)), [visibleIds]);

  return {
    selected,
    /** Checkboxes are showing: Select mode is on, or at least one bead is ticked. */
    active: selecting || selected.size > 0,
    selecting,
    setSelecting,
    toggle,
    clear,
    deselect,
    selectAll,
  };
}
