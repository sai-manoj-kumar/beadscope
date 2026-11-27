"use client";
import * as React from "react";

/**
 * Which lanes are folded on a phone. Phones stack the Board and Focus columns and fold each one; the
 * state lives in the view (not in each column) so bulk edit can leave out the cards in a folded lane:
 * "Select all" must not tick beads the user cannot see.
 *
 * `folded` is true only while `enabled` (phone layout, no grouping). A lane the user has not touched
 * follows `byDefault(id)`; one they have toggled keeps their choice. The returned object changes
 * whenever any answer could change, so it can be a dependency of a `useMemo`; pass a `byDefault`
 * that is stable (or memoised) for that to hold.
 */
export function useLaneFold(enabled: boolean, byDefault: (id: string) => boolean) {
  const [chosen, setChosen] = React.useState<ReadonlyMap<string, boolean>>(new Map());
  return React.useMemo(() => {
    const folded = (id: string) => enabled && (chosen.get(id) ?? byDefault(id));
    const toggle = (id: string) => setChosen((prev) => new Map(prev).set(id, !folded(id)));
    return { folded, toggle };
  }, [enabled, chosen, byDefault]);
}
