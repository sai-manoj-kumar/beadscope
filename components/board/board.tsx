"use client";
import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  DragOverlay,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useApp } from "@/components/app-context";
import { useSetStatus } from "@/hooks/use-beads";
import { useOrder, useSetOrder } from "@/hooks/use-order";
import { useBoardPrefs } from "@/hooks/use-board-prefs";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useUrlState } from "@/hooks/use-url-state";
import { isBlocked, childrenCountMap } from "@/lib/beads-view";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { BrandButton } from "@/components/brand-button";
import { BulkBar, SelectButton } from "@/components/bulk-bar";
import { BulkEditDialog } from "@/components/bulk-edit-dialog";
import { useBulkSelect } from "@/hooks/use-bulk-select";
import { useLaneFold } from "@/hooks/use-lane-fold";
import { matchesFilters, labelOptionsFrom, assigneeOptionsFrom } from "@/lib/filters";
import {
  BOARD_COLUMNS as COLUMNS,
  sortBoardCards,
  type BoardSortMode,
} from "@/lib/board-columns";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { BeadCardOverlay } from "./bead-card";
import { Column } from "./column";
import type { Bead } from "@/lib/schema";

// Whatever is under the pointer wins. pointerWithin sorts its hits by the average distance
// from the pointer to each rect's corners, so a card beats the much taller column that
// contains it, and empty space low in a short column stays a valid target. closestCorners
// alone can prefer a card in a long neighboring column whose corners sit nearer the
// dragged card's. It remains the fallback when the pointer is between columns.
const pointerFirstCollision: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCorners(args);
};

// On phones each column folds; the long Done column starts folded.
const startsFolded = (id: string) => id === "done";

export function Board() {
  const { beads, index, humanAllowlist, openCreate, loading, projectId, readOnly } = useApp();
  const setStatus = useSetStatus();
  const { data: orderData } = useOrder(projectId);
  const setOrder = useSetOrder(projectId);
  const { prefs: boardPrefs, setPrefs: setBoardPrefs } = useBoardPrefs();
  const orders = React.useMemo(() => orderData?.orders ?? {}, [orderData]);
  const { filters, setFilters, showArchived, setShowArchived, clearFilters } =
    useUrlFilters();
  const { searchParams, updateUrl } = useUrlState();
  // Derived from ALL beads (not the filtered set) so selecting one label
  // doesn't make the remaining options vanish from the dropdown.
  const labelOptions = React.useMemo(() => labelOptionsFrom(beads), [beads]);
  const assigneeOptions = React.useMemo(() => assigneeOptionsFrom(beads), [beads]);
  // One pass over all beads, not childrenOf() per card — that would be O(n^2)
  // on a large board.
  const childCounts = React.useMemo(() => childrenCountMap(beads), [beads]);
  // Time-window filter for the Done column: null = all, else "closed within N days".
  const doneParam = Number(searchParams.get("done"));
  const doneWindow = [7, 28, 90, 365].includes(doneParam) ? doneParam : null;
  const setDoneWindow = React.useCallback(
    (days: number | null) => {
      updateUrl((params) => {
        if (days === null) params.delete("done");
        else params.set("done", String(days));
      });
    },
    [updateUrl],
  );
  // Mount-time "now" for the window cutoff — captured once (day-granular, so it
  // needn't tick) and kept out of render to satisfy the no-impure-call rule.
  const [now] = React.useState(() => Date.now());

  // No sensors on phones, so nothing can start a drag (status changes in the drawer).
  const mobile = useIsMobile();
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const sensors = useSensors(...(mobile ? [] : [pointerSensor]));

  // The card being dragged and the column under the pointer. The card renders in a
  // DragOverlay so it can travel across columns; in place it is confined to (and
  // clipped by) its own column's list.
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overColumnId, setOverColumnId] = React.useState<string | null>(null);

  const matchFilters = React.useCallback(
    (b: Bead) => {
      if (b.issue_type === "epic") return false;
      if (!showArchived && (b.labels ?? []).includes("archived")) return false;
      return matchesFilters(b, filters, humanAllowlist);
    },
    [filters, showArchived, humanAllowlist],
  );

  const visible = React.useMemo(() => beads.filter(matchFilters), [beads, matchFilters]);
  const columns = React.useMemo(
    () =>
      COLUMNS.map((c) => {
        let cards = visible.filter((b) => c.test(b, isBlocked(b, index)));
        // Done column: optionally keep only beads closed within the chosen window.
        if (c.id === "done" && doneWindow !== null) {
          const cutoff = now - doneWindow * 86_400_000;
          cards = cards.filter((b) => {
            const t = Date.parse(b.closed_at || b.updated_at || "");
            return Number.isFinite(t) && t >= cutoff;
          });
        }
        return {
          col: c,
          cards: sortBoardCards(cards, boardPrefs.sortMode, orders[c.id]),
        };
      }),
    [visible, index, orders, boardPrefs.sortMode, doneWindow, now],
  );

  // Hide the Blocked column when it's empty, unless the user pinned it to always
  // show (bead mo3). Drag logic below still uses the full `columns` set; a hidden
  // Blocked column has zero cards, so nothing is ever dropped into or out of it.
  const shownColumns = React.useMemo(
    () =>
      columns.filter(
        ({ col, cards }) =>
          col.id !== "blocked" || cards.length > 0 || boardPrefs.blockedColumn === "always",
      ),
    [columns, boardPrefs.blockedColumn],
  );

  // Bulk edit: Cmd/Ctrl-click a card (or Select, on phones) to tick cards, then change them together.
  // Only the cards on screen can be ticked: a hidden Blocked column or a Done window drops its cards.
  // On phones a folded column hides its cards too, so Select all leaves them out (a card ticked by hand
  // before its column was folded stays ticked and counts again on unfold, unless Select all replaced the ticks
  // meanwhile). The long Done column starts folded.
  const lanes = useLaneFold(mobile, startsFolded);
  const cardIds = React.useMemo(
    () => shownColumns.filter(({ col }) => !lanes.folded(col.id)).flatMap(({ cards }) => cards.map((b) => b.id)),
    [shownColumns, lanes],
  );
  const bulk = useBulkSelect(cardIds);
  // The beads the dialog works on, fixed when Bulk edit is clicked (see the List view).
  const [bulkIds, setBulkIds] = React.useState<string[] | null>(null);
  const selectedIds = cardIds.filter((id) => bulk.selected.has(id));

  // Which column each visible bead currently sits in (drag targets resolve here).
  const colOfBead = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const { col, cards } of columns) for (const b of cards) m.set(b.id, col.id);
    return m;
  }, [columns]);

  // `over` is a column id (pointer over empty column space) or a bead id (over a card).
  function columnUnder(overId: string | null): string | undefined {
    if (!overId) return undefined;
    return COLUMNS.some((c) => c.id === overId) ? overId : colOfBead.get(overId);
  }

  function endDrag() {
    setDraggingId(null);
    setOverColumnId(null);
  }

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    setOverColumnId(columnUnder(e.over?.id ? String(e.over.id) : null) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    endDrag();
    if (readOnly) return;
    const activeId = String(e.active.id);
    const overRaw = e.over?.id ? String(e.over.id) : null;
    if (!overRaw) return;

    const activeCol = colOfBead.get(activeId);
    if (!activeCol) return;

    const overCol = columnUnder(overRaw);
    if (!overCol) return;

    if (overCol !== activeCol) {
      // Cross-column → status change (existing behavior).
      const target = COLUMNS.find((c) => c.id === overCol);
      if (!target || !target.droppable || !target.status) return;
      const bead = index.get(activeId);
      if (!bead || bead.status === target.status) return;
      setStatus.mutate({ id: activeId, status: target.status });
      return;
    }

    if (boardPrefs.sortMode !== "manual") return;

    // Within-column → reorder + persist the manual order.
    const ids = (columns.find((c) => c.col.id === activeCol)?.cards ?? []).map((b) => b.id);
    const oldIndex = ids.indexOf(activeId);
    const newIndex = overRaw === activeCol ? ids.length - 1 : ids.indexOf(overRaw);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    setOrder.mutate({ columnId: activeCol, ids: arrayMove(ids, oldIndex, newIndex) });
  }

  const draggingBead = draggingId ? index.get(draggingId) : undefined;
  // Advertise only a column that a drop would actually move the card into.
  const sourceColumnId = draggingId ? colOfBead.get(draggingId) : undefined;
  const dropColumn = COLUMNS.find(
    (c) => c.id === overColumnId && c.id !== sourceColumnId && c.droppable && c.status &&
      draggingBead?.status !== c.status,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Board"
        subtitle={<>{visible.length} beads · live from <span className="font-mono">bd list</span></>}
        actions={
          !readOnly && (
            <>
              <SelectButton active={bulk.active} onToggle={() => (bulk.active ? bulk.clear() : bulk.setSelecting(true))} />
              <BrandButton icon="plus" onClick={() => openCreate()}>New</BrandButton>
            </>
          )
        }
        controls={<>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          labelOptions={labelOptions}
          assigneeOptions={assigneeOptions}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
          onClearAllAction={clearFilters}
          stackFacets
        />

        <label
          className="flex h-9 flex-shrink-0 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-label text-[var(--text-2)] tap-target max-md:order-3"
          title={
            boardPrefs.sortMode === "manual"
              ? "Drag to reorder cards or move them between status columns"
              : "Drag between status columns; choose Manual to reorder within a column"
          }
        >
          <span className="font-medium">Sort</span>
          <select
            aria-label="Sort board cards"
            value={boardPrefs.sortMode}
            onChange={(e) =>
              setBoardPrefs({
                ...boardPrefs,
                sortMode: e.target.value as BoardSortMode,
              })
            }
            className="cursor-pointer border-none bg-transparent text-label font-semibold text-[var(--text)] outline-none"
          >
            <option value="priority">Priority</option>
            <option value="updated">Recently updated</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        </>}
      />

      {!readOnly && bulk.active && (
        <BulkBar
          selected={selectedIds.length}
          total={cardIds.length}
          onSelectAll={bulk.selectAll}
          onEdit={() => setBulkIds(selectedIds)}
          onClear={bulk.clear}
        />
      )}
      <BulkEditDialog ids={bulkIds} onClose={() => setBulkIds(null)} onDone={bulk.deselect} />

      <div className="bd-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-[18px_22px] max-md:overflow-x-hidden max-md:overflow-y-auto max-md:p-[8px_16px_24px]">
        {loading && beads.length === 0 ? (
          <div className="text-body text-[var(--text-3)]">Loading beads…</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerFirstCollision}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={endDrag}
          >
            <div className="flex h-full min-h-0 gap-4 max-md:h-auto max-md:flex-col max-md:gap-1">
              {shownColumns.map(({ col, cards }) => (
                <Column
                  key={col.id}
                  col={col}
                  cards={cards}
                  childCounts={childCounts}
                  manualSort={boardPrefs.sortMode === "manual"}
                  dropTarget={dropColumn?.id === col.id}
                  folded={lanes.folded(col.id)}
                  onToggleFold={() => lanes.toggle(col.id)}
                  bulk={readOnly ? undefined : { active: bulk.active, selected: bulk.selected, toggle: bulk.toggle }}
                  control={
                    col.id === "done" ? (
                      <select
                        value={doneWindow ?? ""}
                        onChange={(e) =>
                          setDoneWindow(e.target.value === "" ? null : Number(e.target.value))
                        }
                        title="Show only beads closed within this window"
                        className="tap-target cursor-pointer rounded-[7px] border border-border bg-[var(--surface-2)] px-[7px] py-[3px] text-meta text-[var(--text-2)] outline-none"
                      >
                        <option value="">All time</option>
                        <option value="7">Last 7 days</option>
                        <option value="28">Last 4 weeks</option>
                        <option value="90">Last 3 months</option>
                        <option value="365">Last 12 months</option>
                      </select>
                    ) : undefined
                  }
                />
              ))}
            </div>
            {/* No drop animation: a cross-column drop has already moved the card, so
                animating the preview toward its old slot would read as a failed move. */}
            <DragOverlay dropAnimation={null}>
              {draggingBead ? (
                <BeadCardOverlay bead={draggingBead} childCount={childCounts.get(draggingBead.id) ?? 0} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
