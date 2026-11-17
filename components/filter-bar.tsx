"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
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
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  labelOptions: FilterOption[];
  assigneeOptions: FilterOption[];
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
  onClearAllAction?: () => void;
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
      <button
        type="button"
        aria-expanded={facetsOpen}
        aria-controls={facetsId}
        onClick={() => setFacetsOpen((o) => !o)}
        className="flex h-11 flex-shrink-0 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[12px] text-label font-medium text-[var(--text-2)] max-md:order-2 md:hidden"
        style={active > 0 ? { borderColor: "var(--brand)", color: "var(--brand)" } : undefined}
      >
        <Icon name="settings" size={14} />
        <span>{active > 0 ? `Filters · ${active}` : "Filters"}</span>
        <Icon name="chevron" size={13} className={`opacity-60 transition-transform ${facetsOpen ? "rotate-180" : ""}`} />
      </button>

      <div
        id={facetsId}
        className={`${facetsOpen ? "flex" : "max-md:hidden md:flex"} flex-wrap items-center gap-[7px] max-md:order-4 max-md:basis-full`}
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
        <button
          onClick={() => onShowArchived(!showArchived)}
          title="Toggle archived"
          className="flex h-9 items-center gap-[6px] rounded-[9px] px-[11px] text-label font-medium tap-target"
          style={{
            border: `1px solid ${showArchived ? "var(--brand)" : "var(--border)"}`,
            background: showArchived ? "var(--brand-weak)" : "var(--surface-2)",
            color: showArchived ? "var(--brand)" : "var(--text-2)",
          }}
        >
          <Icon name="archive" size={14} />
          <span>Archived</span>
        </button>
        {active > 0 && (
          <button
            onClick={clearAll}
            title="Clear all filters"
            className="flex h-9 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] text-label font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] tap-target"
          >
            <Icon name="x" size={14} />
            <span>Clear · {active}</span>
          </button>
        )}
      </div>
    </>
  );
}
