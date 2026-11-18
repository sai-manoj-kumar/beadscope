"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/controls";
import { MultiSelectFilter, type FilterOption } from "@/components/multi-select-filter";
import { typeLabel, statusLabel, prioLabel } from "@/lib/beads-view";
import { BEAD_TYPES, BEAD_STATUSES } from "@/lib/schema";
import { type Filters, emptyFilters, toggleStr, toggleNum } from "@/lib/filters";

/**
 * Search + multi-select facet filters, shared by the Board and List views so
 * both expose the same controls (status, type, priority, labels, assignee,
 * origin) + archived. Purely presentational: `labelOptions` and
 * `assigneeOptions` are the data-derived facets (the rest come from static
 * enums) and are passed in rather than read from context here.
 */
export function FilterBar({
  filters,
  onChange,
  labelOptions,
  assigneeOptions,
  showArchived,
  onShowArchived,
  onClearAllAction,
  stackFacets = false,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  labelOptions: FilterOption[];
  assigneeOptions: FilterOption[];
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
  onClearAllAction?: () => void;
  /**
   * For a header that carries more controls than the facets (the Board's Sort): below 1440px the
   * facets drop to their own row under the title, search and actions, instead of wrapping Sort and
   * New away from the search. Wider screens keep one row, and phones have their own layout.
   */
  stackFacets?: boolean;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const [facetsOpen, setFacetsOpen] = React.useState(false);
  const facetsId = React.useId();

  // Count active filters (each non-empty facet + a non-empty search + archived)
  // so we can offer a one-click reset (bead 3it).
  const active =
    (filters.status.length ? 1 : 0) +
    (filters.type.length ? 1 : 0) +
    (filters.priority.length ? 1 : 0) +
    (filters.origin.length ? 1 : 0) +
    (filters.labels.length ? 1 : 0) +
    (filters.assignee.length ? 1 : 0) +
    (filters.search.trim() ? 1 : 0) +
    (showArchived ? 1 : 0);
  const clearAll = () => {
    if (onClearAllAction) {
      onClearAllAction();
      return;
    }
    onChange(emptyFilters);
    onShowArchived(false);
  };

  return (
    <>
      <div className="relative h-9 min-w-9 max-w-[280px] flex-1 max-md:order-1 max-md:h-11 max-md:max-w-none max-md:basis-full">
        <label className="absolute inset-y-0 left-0 z-10 flex w-full cursor-text items-center gap-[7px] overflow-hidden rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] transition-[width] duration-150 focus-within:z-30 focus-within:w-[280px] focus-within:shadow-lg max-md:focus-within:w-full">
          <Icon
            name="search"
            size={15}
            className={`flex-shrink-0 ${filters.search.trim() ? "text-[var(--brand)]" : "text-[var(--text-3)]"}`}
          />
          <input
            data-search
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search beads…  (/)"
            className="w-full min-w-0 border-none bg-transparent text-body text-[var(--text)] outline-none"
          />
        </label>
      </div>

      {/* Phones: the facets sit behind one Filters button instead of a row wider than the screen. */}
      <Button
        aria-expanded={facetsOpen}
        aria-controls={facetsId}
        onClick={() => setFacetsOpen((o) => !o)}
        className="max-md:order-2 md:hidden"
        style={active > 0 ? { borderColor: "var(--brand)", color: "var(--brand)" } : undefined}
      >
        <Icon name="settings" size={14} />
        <span>{active > 0 ? `Filters · ${active}` : "Filters"}</span>
        <Icon name="chevron" size={13} className={`opacity-60 transition-transform ${facetsOpen ? "rotate-180" : ""}`} />
      </Button>

      <div
        id={facetsId}
        className={`${facetsOpen ? "flex" : "max-md:hidden md:flex"} flex-wrap items-center gap-[7px] max-md:order-4 max-md:basis-full ${stackFacets ? "md:max-[1439px]:order-last md:max-[1439px]:basis-full" : ""}`}
      >
        <MultiSelectFilter
          label="Status"
          options={BEAD_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
          selected={filters.status}
          onToggle={(v) => set({ status: toggleStr(filters.status, v) })}
          onClear={() => set({ status: [] })}
        />
        <MultiSelectFilter
          label="Type"
          options={BEAD_TYPES.filter((t) => t !== "epic").map((t) => ({ value: t, label: typeLabel(t) }))}
          selected={filters.type}
          onToggle={(v) => set({ type: toggleStr(filters.type, v) })}
          onClear={() => set({ type: [] })}
        />
        <MultiSelectFilter
          label="Priority"
          options={[0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: prioLabel(p) }))}
          selected={filters.priority.map(String)}
          onToggle={(v) => set({ priority: toggleNum(filters.priority, Number(v)) })}
          onClear={() => set({ priority: [] })}
        />
        {labelOptions.length > 0 && (
          <MultiSelectFilter
            label="Labels"
            options={labelOptions}
            selected={filters.labels}
            onToggle={(v) => set({ labels: toggleStr(filters.labels, v) })}
            onClear={() => set({ labels: [] })}
          />
        )}
        {assigneeOptions.length > 0 && (
          <MultiSelectFilter
            label="Assignee"
            options={assigneeOptions}
            selected={filters.assignee}
            onToggle={(v) => set({ assignee: toggleStr(filters.assignee, v) })}
            onClear={() => set({ assignee: [] })}
          />
        )}
        <MultiSelectFilter
          label="Origin"
          options={[
            { value: "human", label: "Human" },
            { value: "agent", label: "Agent" },
          ]}
          selected={filters.origin}
          onToggle={(v) => set({ origin: toggleStr(filters.origin, v) })}
          onClear={() => set({ origin: [] })}
        />
        <Button icon="archive" pressed={showArchived} title="Toggle archived" onClick={() => onShowArchived(!showArchived)}>
          Archived
        </Button>
        {active > 0 && (
          <Button icon="x" title="Clear all filters" onClick={clearAll}>
            Clear · {active}
          </Button>
        )}
      </div>
    </>
  );
}
