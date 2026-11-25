"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BrandButton } from "@/components/brand-button";
import { Button, SelectField, TextArea, TextInput } from "@/components/controls";
import { useApp } from "@/components/app-context";
import { useAssigneeNames } from "@/components/assignee-picker";
import { beadsKey } from "@/hooks/use-beads";
import { api } from "@/lib/api-client";
import {
  BULK_STATUSES,
  bulkCloses,
  bulkPatch,
  hasBulkChanges,
  parseLabels,
  type BulkChanges,
  type BulkTarget,
} from "@/lib/bulk-edit";
import { prioLabel, statusLabel } from "@/lib/beads-view";

const NO_CHANGE = "__keep__";
const UNASSIGNED = "__unassigned__";
const CLOSED = "closed";
const labelClass = "text-label font-medium text-[var(--text-2)]";

/**
 * Change a few common fields on every selected bead at once. A field left on "No change" is not
 * written, so each bead keeps its own value. Applying runs one update per bead, one after another
 * (bd serialises writes anyway), and reports how many landed; beads that failed stay selected.
 */
export function BulkEditDialog({
  ids,
  onClose,
  onDone,
}: {
  /** The beads to edit, fixed by the caller when the dialog opens; the dialog is open while this is set. */
  ids: string[] | null;
  onClose: () => void;
  /** Called with the ids that were updated, so the caller can drop them from the selection. */
  onDone: (updated: string[]) => void;
}) {
  const { projectId } = useApp();
  const assigneeNames = useAssigneeNames();
  const targets = React.useMemo(() => ids && ids.map((id) => ({ projectId, id })), [ids, projectId]);
  return (
    <BulkEditTargetsDialog
      targets={targets}
      assigneeNames={assigneeNames}
      onClose={onClose}
      onDone={(updated) => onDone(updated.map((t) => t.id))}
    />
  );
}

/**
 * The dialog for beads that may belong to different repos (the all-repos Agent Queue), so it does
 * not read the current project from the app context: every target names its own repo, and the
 * caller supplies the assignee choices.
 */
export function BulkEditTargetsDialog({
  targets,
  assigneeNames,
  onClose,
  onDone,
}: {
  targets: BulkTarget[] | null;
  assigneeNames: string[];
  onClose: () => void;
  onDone: (updated: BulkTarget[]) => void;
}) {
  // Lifted here so Esc, an outside click and the close button can all be refused while writes are in flight.
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog
      open={targets !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="w-[440px] max-w-[100%] gap-0 rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]"
      >
        {targets && (
          <BulkEditForm ids={targets} names={assigneeNames} busy={busy} onBusy={setBusy} onClose={onClose} onDone={onDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkEditForm({
  ids,
  names,
  busy,
  onBusy,
  onClose,
  onDone,
}: {
  ids: BulkTarget[];
  names: string[];
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onDone: (updated: BulkTarget[]) => void;
}) {
  const qc = useQueryClient();
  const [priority, setPriority] = React.useState(NO_CHANGE);
  const [assignee, setAssignee] = React.useState(NO_CHANGE);
  const [status, setStatus] = React.useState(NO_CHANGE);
  const [addLabels, setAddLabels] = React.useState("");
  const [removeLabels, setRemoveLabels] = React.useState("");
  const [closeReason, setCloseReason] = React.useState("");
  // Beads still to do: all of them, then only the ones that failed, so a retry does not redo the rest.
  const [todo, setTodo] = React.useState(ids);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const changes: BulkChanges = {
    priority: priority === NO_CHANGE ? undefined : Number(priority),
    assignee: assignee === NO_CHANGE ? undefined : assignee === UNASSIGNED ? "" : assignee,
    status: status === NO_CHANGE ? undefined : (status as BulkChanges["status"]),
    addLabels: parseLabels(addLabels),
    removeLabels: parseLabels(removeLabels),
    closeReason: closeReason.trim() || undefined,
  };
  const closing = bulkCloses(changes);
  const count = `${todo.length} bead${todo.length === 1 ? "" : "s"}`;

  const apply = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !hasBulkChanges(changes)) return;
    const patch = bulkPatch(changes);
    const updated: BulkTarget[] = [];
    const failed: { target: BulkTarget; message: string }[] = [];
    setError(null);
    onBusy(true);
    for (const target of todo) {
      setProgress(updated.length + failed.length);
      try {
        // Other fields first, then the close, so the bead is closed with them already in place.
        if (Object.keys(patch).length) await api.update(target.projectId, target.id, patch);
        if (closing) await api.setStatus(target.projectId, target.id, "closed", changes.closeReason);
        updated.push(target);
      } catch (err) {
        failed.push({ target, message: (err as Error).message });
      }
    }
    onBusy(false);
    for (const projectId of new Set(todo.map((t) => t.projectId))) {
      qc.invalidateQueries({ queryKey: beadsKey(projectId) });
    }
    if (updated.length) onDone(updated);
    if (failed.length === 0) {
      toast.success(
        `${closing ? "Closed" : "Updated"} ${updated.length} bead${updated.length === 1 ? "" : "s"} · ${closing ? "bd close" : "bd update"}`,
      );
      onClose();
    } else {
      setTodo(failed.map((f) => f.target));
      setError(
        `${failed.length} of ${todo.length} could not be updated (${failed.map((f) => f.target.id).join(", ")}): ${failed[0].message}. ` +
          (updated.length ? `${updated.length} were updated. ` : "") +
          "Update again to retry the rest.",
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
          <SelectField value={closing ? NO_CHANGE : assignee} disabled={busy || closing} onChange={(e) => setAssignee(e.target.value)}>
            <option value={NO_CHANGE}>No change</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectField>
          {closing && (
            <span className="text-meta text-[var(--text-3)]">Not changed when closing: bd only lets the assignee close a bead.</span>
          )}
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
            <option value={CLOSED}>{statusLabel(CLOSED)}</option>
          </SelectField>
        </label>
        {closing && (
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Close reason — optional</span>
            <TextArea
              rows={2}
              value={closeReason}
              disabled={busy}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder="Why these beads are closed"
            />
          </label>
        )}
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Add labels</span>
          <TextInput
            value={addLabels}
            disabled={busy}
            onChange={(e) => setAddLabels(e.target.value)}
            placeholder="No change · separate with commas"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Remove labels</span>
          <TextInput
            value={removeLabels}
            disabled={busy}
            onChange={(e) => setRemoveLabels(e.target.value)}
            placeholder="No change · separate with commas"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
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
          {busy ? `Updating ${progress + 1} of ${todo.length}…` : `Update ${count}`}
        </BrandButton>
      </div>
    </form>
  );
}
