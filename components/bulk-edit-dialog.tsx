"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BrandButton } from "@/components/brand-button";
import { Button, SelectField } from "@/components/controls";
import { useApp } from "@/components/app-context";
import { useAssigneeNames } from "@/components/assignee-picker";
import { beadsKey } from "@/hooks/use-beads";
import { api } from "@/lib/api-client";
import { BULK_STATUSES, bulkPatch, hasBulkChanges, type BulkChanges } from "@/lib/bulk-edit";
import { prioLabel, statusLabel } from "@/lib/beads-view";

const NO_CHANGE = "__keep__";
const UNASSIGNED = "__unassigned__";
const labelClass = "text-label font-medium text-[var(--text-2)]";

/**
 * Change a few common fields on every selected bead at once. A field left on "No change" is not
 * written, so each bead keeps its own value. Applying runs one update per bead, one after another
 * (bd serialises writes anyway), and reports how many landed; beads that failed stay selected.
 */
export function BulkEditDialog({
  open,
  ids,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  ids: string[];
  onOpenChange: (open: boolean) => void;
  /** Called with the ids that were updated, so the caller can drop them from the selection. */
  onDone: (updated: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[440px] max-w-[100%] gap-0 rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]">
        {open && <BulkEditForm ids={ids} onClose={() => onOpenChange(false)} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function BulkEditForm({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: (updated: string[]) => void;
}) {
  const { projectId } = useApp();
  const qc = useQueryClient();
  const names = useAssigneeNames();
  const [priority, setPriority] = React.useState(NO_CHANGE);
  const [assignee, setAssignee] = React.useState(NO_CHANGE);
  const [status, setStatus] = React.useState(NO_CHANGE);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const changes: BulkChanges = {
    priority: priority === NO_CHANGE ? undefined : Number(priority),
    assignee: assignee === NO_CHANGE ? undefined : assignee === UNASSIGNED ? "" : assignee,
    status: status === NO_CHANGE ? undefined : (status as BulkChanges["status"]),
  };
  const busy = progress !== null;
  const count = `${ids.length} bead${ids.length === 1 ? "" : "s"}`;

  const apply = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !hasBulkChanges(changes)) return;
    const patch = bulkPatch(changes);
    const updated: string[] = [];
    const failed: { id: string; message: string }[] = [];
    setError(null);
    for (const id of ids) {
      setProgress(updated.length + failed.length);
      try {
        await api.update(projectId, id, patch);
        updated.push(id);
      } catch (err) {
        failed.push({ id, message: (err as Error).message });
      }
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: beadsKey(projectId) });
    if (updated.length) onDone(updated);
    if (failed.length === 0) {
      toast.success(`Updated ${updated.length} bead${updated.length === 1 ? "" : "s"} · bd update`);
      onClose();
    } else {
      setError(
        `${failed.length} of ${ids.length} could not be updated (${failed.map((f) => f.id).join(", ")}): ${failed[0].message}`,
      );
    }
  };

  return (
    <form onSubmit={apply} noValidate className="flex flex-col">
      <div className="border-b border-border p-[17px_20px]">
        <DialogTitle className="text-section font-semibold">Bulk edit</DialogTitle>
        <DialogDescription className="text-meta text-[var(--text-3)]">
          Changes {count}. Fields left on &quot;No change&quot; keep each bead&apos;s own value.
        </DialogDescription>
      </div>
      <div className="flex flex-col gap-4 p-[16px_20px]">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Priority</span>
          <SelectField value={priority} disabled={busy} onChange={(e) => setPriority(e.target.value)}>
            <option value={NO_CHANGE}>No change</option>
            {[0, 1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                P{p} · {prioLabel(p)}
              </option>
            ))}
          </SelectField>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Assignee</span>
          <SelectField value={assignee} disabled={busy} onChange={(e) => setAssignee(e.target.value)}>
            <option value={NO_CHANGE}>No change</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectField>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Status</span>
          <SelectField value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
            <option value={NO_CHANGE}>No change</option>
            {BULK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </SelectField>
        </label>
        {error && (
          <p role="alert" className="text-label text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-[12px_20px]">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <BrandButton type="submit" disabled={busy || !hasBulkChanges(changes)}>
          {busy ? `Updating ${progress! + 1} of ${ids.length}…` : `Update ${count}`}
        </BrandButton>
      </div>
    </form>
  );
}
