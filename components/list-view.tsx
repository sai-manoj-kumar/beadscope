"use client";
import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { AssigneeAvatar } from "@/components/assignee-picker";
import { PriorityChip, OriginBadge } from "@/components/board/bead-card";
import { CopyableId } from "@/components/copyable-id";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { BrandButton } from "@/components/brand-button";
import { BulkEditDialog } from "@/components/bulk-edit-dialog";
import { Button, CheckInput } from "@/components/controls";
import { Chip } from "@/components/chip";
import { useBulkSelect } from "@/hooks/use-bulk-select";
import { useOrder, useSetOrder } from "@/hooks/use-order";
import { useSetStatus } from "@/hooks/use-beads";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { matchesFilters, labelOptionsFrom, assigneeOptionsFrom } from "@/lib/filters";
import { BOARD_COLUMNS, COLUMN_ORDER, colOf } from "@/lib/board-columns";
import { beadOrigin, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  typeColor,
  isBlocked,
  parentOf,
  childrenCountMap,
  relTime,
  fmtDateTime,
  fmtDue,
  isOverdue,
} from "@/lib/beads-view";
import { type Bead } from "@/lib/schema";

/**
 * Priority assumed for a bead with no parent epic when breaking ties. Medium, so
 * an orphan sorts among the children of medium epics rather than being shoved to
 * either extreme — a judgement call, hence a named constant.
 */
const DEFAULT_EPIC_PRIORITY = 2;

function rankOf(order: string[] | undefined, id: string): number {
  if (!order) return Number.POSITIVE_INFINITY;
  const i = order.indexOf(id);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

export function ListView() {
  const { beads, index, humanAllowlist, openDetail, openCreate, openEpic, loading, projectId, readOnly } =
    useApp();
  const setStatus = useSetStatus();
  const { data: orderData } = useOrder(projectId);
  const setOrder = useSetOrder(projectId);
  const orders = React.useMemo(() => orderData?.orders ?? {}, [orderData]);

  const { filters, setFilters, showArchived, setShowArchived, clearFilters } =
    useUrlFilters();
  // Derived from ALL beads (not the filtered set) so selecting one label
  // doesn't make the remaining options vanish from the dropdown.
  const labelOptions = React.useMemo(() => labelOptionsFrom(beads), [beads]);
  const assigneeOptions = React.useMemo(() => assigneeOptionsFrom(beads), [beads]);
  // One pass, not childrenOf() per row (that would be O(n^2)).
  const childCounts = React.useMemo(() => childrenCountMap(beads), [beads]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Which board column each bead belongs to (shared with the Board view).
  const colById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beads) {
      const c = colOf(b, index);
      if (c) m.set(b.id, c);
    }
    return m;
  }, [beads, index]);

  // Sort: by board column order, then the column's shared manual rank, then priority.
  const rows = React.useMemo(() => {
    return beads
      .filter((b) => {
        if (b.issue_type === "epic") return false;
        if (!showArchived && (b.labels ?? []).includes("archived")) return false;
        return matchesFilters(b, filters, humanAllowlist);
      })
      .sort((a, b) => {
        const ca = COLUMN_ORDER.indexOf(colById.get(a.id) ?? "");
        const cb = COLUMN_ORDER.indexOf(colById.get(b.id) ?? "");
        if (ca !== cb) return ca - cb;
        const col = colById.get(a.id);
        const order = col ? orders[col] : undefined;
        const ra = rankOf(order, a.id);
        const rb = rankOf(order, b.id);
        if (ra !== rb) return ra - rb;
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Tie-break on the parent epic's priority (gh-18): a medium task under a
        // high epic outranks a medium task under a low one. Own priority always
        // wins first, and manual drag rank above still wins over both.
        const ea = parentOf(a, index)?.priority ?? DEFAULT_EPIC_PRIORITY;
        const eb = parentOf(b, index)?.priority ?? DEFAULT_EPIC_PRIORITY;
        if (ea !== eb) return ea - eb;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      });
  }, [beads, filters, showArchived, humanAllowlist, colById, orders, index]);

  // Bulk edit: Cmd/Ctrl-click a row (or Select, on phones) to tick beads, then change them together.
  const rowIds = React.useMemo(() => rows.map((b) => b.id), [rows]);
  const bulk = useBulkSelect(rowIds);
  // The beads the dialog works on, fixed when Bulk edit is clicked: the view may refresh (or a filter
  // may drop a bead that was just edited) while the edit runs, and the dialog must not follow that.
  const [bulkIds, setBulkIds] = React.useState<string[] | null>(null);
  const selectedIds = rowIds.filter((id) => bulk.selected.has(id));

  // Per-column counts for the group headers. Derived from `rows` (not `beads`)
  // so the count always matches what is rendered beneath the header once the
  // filters and the archived toggle have been applied.
  const countByCol = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const b of rows) {
      const c = colById.get(b.id);
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [rows, colById]);

  function onDragEnd(e: DragEndEvent) {
    if (readOnly) return;
    const activeId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;
    const activeCol = colById.get(activeId);
    const overCol = colById.get(overId);
    if (!activeCol || !overCol) return;

    if (overCol === activeCol) {
      // Reorder within a column → write that column's shared order (Board sees it too).
      const ids = rows.filter((b) => colById.get(b.id) === activeCol).map((b) => b.id);
      const oldI = ids.indexOf(activeId);
      const newI = ids.indexOf(overId);
      if (oldI === -1 || newI === -1 || oldI === newI) return;
      setOrder.mutate({ columnId: activeCol, ids: arrayMove(ids, oldI, newI) });
    } else {
      // Across columns → status change (cross-column = status, like the Board).
      const target = BOARD_COLUMNS.find((c) => c.id === overCol);
      if (!target || !target.droppable || !target.status) return;
      const bead = index.get(activeId);
      if (!bead || bead.status === target.status) return;
      setStatus.mutate({ id: activeId, status: target.status });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="List"
        subtitle={loading && beads.length === 0 ? "Loading…" : <>{rows.length} beads<span className="max-md:hidden"> · drag to set run-order</span></>}
        actions={
          !readOnly && (
            <>
              {/* Phones and touch screens (a tablet has no Cmd key). With a mouse, Cmd/Ctrl-click starts a selection, and the header row is full. */}
              <Button
                icon="check"
                pressed={bulk.active}
                className="hidden max-md:inline-flex pointer-coarse:inline-flex"
                onClick={() => (bulk.active ? bulk.clear() : bulk.setSelecting(true))}
              >
                Select
              </Button>
              <BrandButton icon="plus" onClick={() => openCreate()}>New</BrandButton>
            </>
          )
        }
        controls={
          <FilterBar
            filters={filters}
            onChange={setFilters}
            labelOptions={labelOptions}
            assigneeOptions={assigneeOptions}
            showArchived={showArchived}
            onShowArchived={setShowArchived}
            onClearAllAction={clearFilters}
          />
        }
      />

      {!readOnly && bulk.active && (
        <div
          data-testid="bulk-bar"
          className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-[var(--surface-2)] p-[8px_22px] max-md:p-[8px_16px]"
        >
          <span aria-live="polite" className="text-label font-medium text-[var(--text)]">
            {selectedIds.length === 0 ? "Tick beads to edit them together" : `${selectedIds.length} selected`}
          </span>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            {selectedIds.length < rowIds.length && (
              <Button variant="outline" size="sm" onClick={bulk.selectAll}>
                Select all {rowIds.length}
              </Button>
            )}
            <BrandButton size="sm" icon="pencil" disabled={selectedIds.length === 0} onClick={() => setBulkIds(selectedIds)}>
              Bulk edit
            </BrandButton>
            <Button variant="outline" size="sm" onClick={bulk.clear}>
              Clear
            </Button>
          </div>
        </div>
      )}
      <BulkEditDialog ids={bulkIds} onClose={() => setBulkIds(null)} onDone={bulk.deselect} />

      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[12px_22px]">
        {loading && beads.length === 0 ? (
          <div className="text-body text-[var(--text-3)]">Loading beads…</div>
        ) : rows.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-body text-[var(--text-3)]">
            No beads match.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-[6px]">
                {rows.map((b, i) => {
                  const col = colById.get(b.id);
                  const prevCol = i > 0 ? colById.get(rows[i - 1].id) : undefined;
                  const showGroup = col && col !== prevCol;
                  const meta = BOARD_COLUMNS.find((c) => c.id === col);
                  return (
                    <React.Fragment key={b.id}>
                      {showGroup && meta && (
                        <div className="flex items-center gap-2 px-1 pb-px pt-3 first:pt-0">
                          <span
                            className="h-[7px] w-[7px] rounded-[2px]"
                            style={{ background: meta.color }}
                          />
                          <span className="text-meta font-semibold uppercase tracking-[.04em] text-[var(--text-3)]">
                            {meta.name}
                          </span>
                          <Chip mono>{countByCol.get(col) ?? 0}</Chip>
                        </div>
                      )}
                      <Row
                        bead={b}
                        blocked={isBlocked(b, index)}
                        onOpen={() => openDetail(b.id)}
                        parent={parentOf(b, index)}
                        onOpenParent={openEpic}
                        onOpenDetail={openDetail}
                        childCount={childCounts.get(b.id) ?? 0}
                        humanAllowlist={humanAllowlist}
                        selectMode={!readOnly && bulk.active}
                        checked={bulk.selected.has(b.id)}
                        onToggle={() => bulk.toggle(b.id)}
                      />
                    </React.Fragment>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function Row({
  bead,
  blocked,
  onOpen,
  parent,
  onOpenParent,
  onOpenDetail,
  childCount,
  humanAllowlist,
  selectMode,
  checked,
  onToggle,
}: {
  /** Bulk edit is on: checkboxes show and a click ticks the row instead of opening it. */
  selectMode: boolean;
  checked: boolean;
  onToggle: () => void;
  bead: Bead;
  blocked: boolean;
  onOpen: () => void;
  parent: Bead | null;
  onOpenParent: (id: string) => void;
  onOpenDetail: (id: string) => void;
  childCount: number;
  humanAllowlist: string[];
}) {
  const { readOnly, selectedBeadId, selectBead } = useApp();
  // Phones: no reordering by drag. It needs touch-action: none on every row, which stops the list scrolling.
  const mobile = useIsMobile();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bead.id,
    disabled: readOnly || mobile,
  });
  const o = beadOrigin(bead, humanAllowlist);
  const labels = (bead.labels ?? []).filter((l) => l !== "archived").slice(0, 2);
  const due = fmtDue(bead);
  const overdue = isOverdue(bead);
  const openFromKeyboard = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      // Cmd/Ctrl+Enter or Space ticks, the keyboard twin of Cmd/Ctrl-click.
      if (!readOnly && (selectMode || e.metaKey || e.ctrlKey)) onToggle();
      else onOpen();
    }
  };
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...(readOnly || mobile ? {} : attributes)}
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      aria-pressed={selectMode ? checked : undefined}
      onFocus={() => selectBead(bead.id)}
      onClick={(e) => {
        selectBead(bead.id);
        // Cmd (Mac) or Ctrl (Windows) starts a selection; once one is going, a plain click ticks too.
        if (!readOnly && (selectMode || e.metaKey || e.ctrlKey)) onToggle();
        else onOpen();
      }}
      onKeyDown={openFromKeyboard}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-[10px] border bg-[var(--surface)] px-[13px] py-[9px] text-left md:touch-none max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-1 max-md:py-3 transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      {selectMode && (
        // The whole 44px square is the target on phones; the row's own click is not triggered by it.
        <label
          className="tap-target -my-[10px] -ml-2 flex flex-shrink-0 cursor-pointer items-center justify-center max-md:-order-3 md:min-h-[32px] md:min-w-[32px]"
          onClick={(e) => e.stopPropagation()}
        >
          <CheckInput aria-label={`Select ${bead.id}`} checked={checked} onChange={onToggle} />
        </label>
      )}
      <span
        className="h-[9px] w-[9px] flex-shrink-0 rounded-full max-md:-order-2"
        style={{ background: blocked ? "#ef4444" : catColor(bead.status) }}
        title={blocked ? "Blocked" : statusLabel(bead.status)}
      />
      <Icon
        name={typeIconName(bead.issue_type)}
        size={15}
        className="flex-shrink-0 max-md:-order-2"
        style={{ color: typeColor(bead.issue_type) }}
      />
      {/* Phones: the title takes the first line (two at most) and the id, priority and
          assignee sit on a second line, so the title is never squeezed by them. */}
      {mobile ? (
        <span className={`${selectMode ? "ml-[93px]" : "ml-[41px]"} flex-shrink-0 truncate font-mono text-meta text-[var(--text-3)]`}>{bead.id}</span>
      ) : (
        <CopyableId
          id={bead.id}
          className="w-[150px] flex-shrink-0 truncate font-mono text-meta text-[var(--text-3)]"
        />
      )}
      <span className={`min-w-0 flex-1 truncate text-body font-medium text-[var(--text)] max-md:-order-1 ${selectMode ? "max-md:flex-[1_1_calc(100%-100px)]" : "max-md:flex-[1_1_calc(100%-48px)]"} max-md:whitespace-normal max-md:line-clamp-2`}>
        {bead.title}
      </span>
      {labels.map((l) => (
        <span
          key={l}
          className="hidden flex-shrink-0 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-meta text-[var(--text-3)] lg:inline"
        >
          {l}
        </span>
      ))}
      {/* The epic is shown because it now INFLUENCES the sort order (gh-18):
          a ranking whose reason isn't on screen reads as a bug. */}
      {childCount > 0 && (
        <span
          title={`${childCount} subtask${childCount === 1 ? "" : "s"}`}
          className="hidden flex-shrink-0 items-center gap-[4px] rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-meta text-[var(--text-3)] lg:flex"
        >
          <Icon name="list" size={10} className="flex-shrink-0" />
          {childCount}
        </span>
      )}
      {/* Shown because the parent now INFLUENCES the sort order (gh-18): a
          ranking whose reason isn't on screen reads as a bug. Epics route to
          the Epics screen; any other parent opens its drawer, since the Epics
          screen renders epics only. */}
      {parent && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (parent.issue_type === "epic") onOpenParent(parent.id);
            else onOpenDetail(parent.id);
          }}
          title={`${parent.id} · ${parent.title} · P${parent.priority}`}
          className="hidden max-w-[150px] flex-shrink-0 items-center gap-[4px] rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-meta text-[var(--text-3)] hover:border-[var(--brand)] hover:text-[var(--brand)] lg:flex"
        >
          <Icon
            name={parent.issue_type === "epic" ? "target" : typeIconName(parent.issue_type)}
            size={10}
            className="flex-shrink-0"
          />
          <span className="truncate">{parent.title}</span>
        </button>
      )}
      <span className="flex-shrink-0">
        <PriorityChip p={bead.priority} />
      </span>
      {due && (
        <Chip
          data-testid="due-chip"
          data-overdue={overdue ? "true" : undefined}
          color={overdue ? "#ef4444" : undefined}
          className="flex-shrink-0 whitespace-nowrap"
        >
          {overdue ? "Overdue" : "Due"} {due}
        </Chip>
      )}
      <span className="hidden w-[26px] flex-shrink-0 justify-center sm:flex">
        <OriginBadge origin={o} title={originTitle(bead.created_by, o)} />
      </span>
      <span className="flex min-w-0 max-w-[130px] flex-shrink-0 items-center gap-[6px]">
        <AssigneeAvatar name={bead.assignee ?? ""} size={19} />
        <span className="truncate text-meta text-[var(--text-2)]">
          {bead.assignee || "Unassigned"}
        </span>
      </span>
      <span
        title={fmtDateTime(bead.updated_at)}
        className="hidden w-[64px] flex-shrink-0 text-right font-mono text-meta text-[var(--text-3)] xl:inline"
      >
        {relTime(bead.updated_at)}
      </span>
    </div>
  );
}
