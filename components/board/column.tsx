"use client";
import * as React from "react";
import { Chip } from "@/components/chip";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Bead } from "@/lib/schema";
import { BeadCard } from "./bead-card";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { useIsMobile } from "@/hooks/use-is-mobile";

export interface ColumnDef {
  id: string;
  name: string;
  color: string;
  cmd: string;
  droppable: boolean;
}

export function Column({
  col,
  cards,
  childCounts,
  control,
  manualSort = true,
  dropTarget = false,
  bulk,
}: {
  col: ColumnDef;
  cards: Bead[];
  /** id -> number of parent-child children, computed once by the board. */
  childCounts?: Map<string, number>;
  control?: React.ReactNode;
  manualSort?: boolean;
  /**
   * True while dropping the dragged card here would move it into this column. The
   * board decides, so hovering one of this column's cards counts, not just empty space.
   */
  dropTarget?: boolean;
  /** Bulk edit state for the board; absent when it is read-only. */
  bulk?: { active: boolean; selected: ReadonlySet<string>; toggle: (id: string) => void };
}) {
  const { setNodeRef } = useDroppable({ id: col.id, disabled: !col.droppable });
  // Phones stack the columns and fold each one; the long Done column starts folded.
  const mobile = useIsMobile();
  const [folded, setFolded] = React.useState<boolean | null>(null);
  const isFolded = mobile && (folded ?? col.id === "done");
  const listId = React.useId();

  return (
    <section className="flex w-[296px] min-h-0 flex-shrink-0 flex-col max-md:w-full max-md:flex-shrink">
      <div className="flex flex-shrink-0 items-center gap-2 px-1 pb-3 max-md:pb-2">
        <button
          type="button"
          aria-expanded={!isFolded}
          aria-controls={listId}
          disabled={!mobile}
          onClick={() => setFolded(!isFolded)}
          className="flex min-w-0 items-center gap-2 text-left max-md:min-h-11 max-md:flex-1 md:cursor-default"
        >
          <span className="h-[9px] w-[9px] flex-shrink-0 rounded-[3px]" style={{ background: col.color }} />
          <span className="text-body font-semibold tracking-[-.005em]">{col.name}</span>
          <Chip mono>{cards.length}</Chip>
          <Icon
            name="chevron"
            size={14}
            className={`text-[var(--text-3)] transition-transform md:hidden ${isFolded ? "-rotate-90" : ""}`}
          />
        </button>
        <span className="flex-1 max-md:hidden" />
        {control ?? <span className="font-mono text-meta text-[var(--text-3)]">{col.cmd}</span>}
      </div>

      <div
        id={listId}
        ref={setNodeRef}
        hidden={isFolded}
        className={cn(
          "bd-scroll flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto overflow-x-hidden rounded-xl p-[4px_4px_14px] transition-[background,outline] max-md:overflow-visible max-md:p-[4px_0_14px]",
          isFolded && "hidden",
          dropTarget
            ? "bg-[var(--brand-weak)] outline-2 outline-dashed outline-[var(--brand)] -outline-offset-2"
            : "outline-2 outline-transparent",
        )}
      >
        <SortableContext items={cards.map((b) => b.id)} strategy={manualSort ? verticalListSortingStrategy : () => null}>
          {cards.map((b) => (
            <BeadCard
              key={b.id}
              bead={b}
              childCount={childCounts?.get(b.id) ?? 0}
              selection={
                bulk && { active: bulk.active, checked: bulk.selected.has(b.id), onToggle: () => bulk.toggle(b.id) }
              }
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="rounded-[11px] border-[1.5px] border-dashed border-border p-[22px_12px] text-center text-label text-[var(--text-3)]">
            No beads
          </div>
        )}
      </div>
    </section>
  );
}
