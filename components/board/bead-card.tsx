"use client";
import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Bead } from "@/lib/schema";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { CopyableId } from "@/components/copyable-id";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { beadOrigin, originTitle } from "@/lib/attribution";
import { readableColor, tintStyle } from "@/components/chip";
import {
  catColor,
  statusLabel,
  prioColor,
  prioLabel,
  typeColor,
  typeLabel,
  avatarColor,
  initials,
  isBlocked,
  parentOf,
  checklistProgress,
} from "@/lib/beads-view";

export function BeadCard({ bead, childCount = 0 }: { bead: Bead; childCount?: number }) {
  const { openDetail, readOnly, selectedBeadId, selectBead } = useApp();
  // Phones do not drag: status changes in the drawer, and a draggable card would swallow the
  // touch that should scroll the page.
  const mobile = useIsMobile();
  const noDrag = readOnly || mobile;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bead.id,
    disabled: noDrag,
  });

  return (
    <article
      ref={setNodeRef}
      {...(mobile ? {} : listeners)}
      {...(noDrag ? { role: "button", tabIndex: 0 } : attributes)}
      {...(noDrag ? { onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(bead.id); }
      } } : {})}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onClick={() => {
        selectBead(bead.id);
        openDetail(bead.id);
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`flex cursor-pointer flex-col md:touch-none gap-[9px] rounded-[11px] border bg-[var(--surface)] p-[12px_13px] shadow-[var(--shadow)] transition-[border-color] hover:border-2 hover:p-[11px_12px] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] hover:border-[var(--text-3)] ring-2 ring-[var(--brand)]/30"
          : "border-border hover:border-[var(--text-3)]"
      }`}
    >
      <BeadCardFace bead={bead} childCount={childCount} />
    </article>
  );
}

/**
 * The copy that follows the pointer while a card is dragged. It has no sortable or
 * keyboard wiring (and no data-keyboard-bead-id), so it never competes with the real
 * card for drops, focus, or selection.
 */
export function BeadCardOverlay({ bead, childCount = 0 }: { bead: Bead; childCount?: number }) {
  return (
    <article
      aria-hidden="true"
      className="flex cursor-grabbing flex-col gap-[9px] rounded-[11px] border-2 border-[var(--text-3)] bg-[var(--surface)] p-[11px_12px] shadow-[var(--shadow)]"
    >
      <BeadCardFace bead={bead} childCount={childCount} preview />
    </article>
  );
}

function BeadCardFace({ bead, childCount, preview = false }: { bead: Bead; childCount: number; preview?: boolean }) {
  const mobile = useIsMobile();
  const { index, humanAllowlist } = useApp();
  const o = beadOrigin(bead, humanAllowlist);
  const parent = parentOf(bead, index);
  const blocked = isBlocked(bead, index);
  const visLabels = (bead.labels ?? []).filter((l) => l !== "archived").slice(0, 2);
  const depCount = (bead.dependencies ?? []).filter((d) => d.type !== "parent-child").length;
  const commentCount = (bead.comments ?? []).length;
  const checklist = checklistProgress(bead.description);

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: catColor(bead.status) }}
          title={statusLabel(bead.status)}
        />
        {preview || mobile ? (
          <span className="font-mono text-meta tracking-[-.01em] text-[var(--text-3)]">{bead.id}</span>
        ) : (
          <CopyableId
            id={bead.id}
            className="font-mono text-meta tracking-[-.01em] text-[var(--text-3)]"
          />
        )}
        <span className="flex-1" />
        <PriorityChip p={bead.priority} />
        <OriginBadge origin={o} title={originTitle(bead.created_by, o)} />
      </div>

      <div className="text-body font-medium leading-[1.35] tracking-[-.006em] text-[var(--text)] [text-wrap:pretty]">
        {bead.title}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-[5px] text-meta text-[var(--text-2)]">
          <Icon
            name={typeIconName(bead.issue_type)}
            size={13}
            style={{ color: typeColor(bead.issue_type) }}
          />
          <span>{typeLabel(bead.issue_type)}</span>
        </span>
        {visLabels.map((l) => (
          <span
            key={l}
            className="rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-meta text-[var(--text-3)]"
          >
            {l}
          </span>
        ))}
      </div>

      <div className="mt-px flex items-center gap-[10px] border-t border-border pt-[9px]">
        <span className="inline-flex min-w-0 items-center gap-[6px]">
          <span
            className="flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full text-meta font-semibold text-white"
            style={{ background: avatarColor(bead.assignee ?? "") }}
          >
            {initials(bead.assignee ?? "")}
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-meta text-[var(--text-2)]">
            {bead.assignee || "Unassigned"}
          </span>
        </span>
        <span className="flex-1" />
        {depCount > 0 && (
          <span
            title="dependencies"
            className="inline-flex items-center gap-[3px] font-mono text-meta"
            style={{ color: blocked ? readableColor("#ef4444") : "var(--text-3)" }}
          >
            <Icon name="link" size={13} />
            {depCount}
          </span>
        )}
        {commentCount > 0 && (
          <span
            title="comments"
            className="inline-flex items-center gap-[3px] font-mono text-meta text-[var(--text-3)]"
          >
            <Icon name="comment" size={13} />
            {commentCount}
          </span>
        )}
        {checklist.total > 0 && (
          <span
            title="checklist progress"
            className="inline-flex items-center gap-[3px] font-mono text-meta"
            style={{ color: checklist.done === checklist.total ? readableColor("#16a34a") : "var(--text-3)" }}
          >
            <Icon name="check" size={13} />
            {checklist.done}/{checklist.total}
          </span>
        )}
        {/* Epic parents keep the brand-coloured chip; any other parent gets a
            neutral one with its own type icon. Previously every parent rendered
            as an "epic", which was already wrong and gets much more visible
            now that arbitrary subtasks exist. */}
        {parent && (
          <span
            title={`${parent.id} · ${parent.title}`}
            className={
              parent.issue_type === "epic"
                ? "inline-flex max-w-[96px] items-center gap-1 rounded-md bg-[var(--brand-weak)] px-[6px] py-px text-meta font-medium text-[var(--brand)]"
                : "inline-flex max-w-[96px] items-center gap-1 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-meta font-medium text-[var(--text-3)]"
            }
          >
            <Icon
              name={parent.issue_type === "epic" ? "target" : typeIconName(parent.issue_type)}
              size={11}
              className="flex-shrink-0"
            />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {parent.title.replace(/\s*\([^)]*\)\s*/, "")}
            </span>
          </span>
        )}
        {/* Subtask count — distinct from depCount, which deliberately excludes
            parent-child edges. Counted once per render by the board/list, not
            per card, to avoid an O(n^2) scan. */}
        {childCount > 0 && (
          <span
            title={`${childCount} subtask${childCount === 1 ? "" : "s"}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-meta font-medium text-[var(--text-3)]"
          >
            <Icon name="list" size={11} className="flex-shrink-0" />
            {childCount}
          </span>
        )}
      </div>
    </>
  );
}

export function PriorityChip({ p }: { p: number }) {
  const c = prioColor(p);
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded-md px-[7px] py-[3px] text-meta font-semibold leading-none tracking-[.01em]"
      style={tintStyle(c, "1f")}
    >
      {prioLabel(p)}
    </span>
  );
}

export function OriginBadge({
  origin,
  title,
  withLabel = false,
}: {
  origin: "human" | "agent";
  title: string;
  withLabel?: boolean;
}) {
  const human = origin === "human";
  return (
    <span
      title={title}
      className={`inline-flex flex-shrink-0 items-center justify-center gap-[5px] rounded-md `}
      style={
        withLabel
          ? {
              padding: "3px 9px",
              color: human ? "var(--text-2)" : "var(--brand)",
              background: human ? "var(--surface-2)" : "var(--brand-weak)",
              border: `1px solid ${human ? "var(--border)" : "transparent"}`,
            }
          : {
              width: 20,
              height: 20,
              color: human ? "var(--text-2)" : "var(--brand)",
              background: human ? "var(--surface-2)" : "var(--brand-weak)",
              border: `1px solid ${human ? "var(--border)" : "var(--brand-weak)"}`,
            }
      }
    >
      <Icon name={human ? "user" : "bot"} size={withLabel ? 13 : 12} />
      {withLabel && (human ? "Human" : "Agent")}
    </span>
  );
}
