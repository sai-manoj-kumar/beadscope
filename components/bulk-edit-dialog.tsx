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
  BULK_CLOSED,
  BULK_STATUSES,
  bulkPatch,
  hasBulkChanges,
  isBulkClose,
  labelConflicts,
  parseLabels,
  type BulkChanges,
  type BulkTarget,
} from "@/lib/bulk-edit";
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
        className="max-h-[92dvh] w-[440px] max-w-[100%] gap-0 overflow-y-auto rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]"
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
  const [closeReason, setCloseReason] = React.useState("");
  const [addLabels, setAddLabels] = React.useState("");
  const [removeLabels, setRemoveLabels] = React.useState("");
  // Beads still to do: all of them, then only the ones that failed, so a retry does not redo the rest.
  const [todo, setTodo] = React.useState(ids);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const changes: BulkChanges = {
    priority: priority === NO_CHANGE ? undefined : Number(priority),
    assignee: assignee === NO_CHANGE ? undefined : assignee === UNASSIGNED ? "" : assignee,
    status: status === NO_CHANGE ? undefined : (status as BulkChanges["status"]),
    closeReason: closeReason.trim() || undefined,
    addLabels: parseLabels(addLabels),
    removeLabels: parseLabels(removeLabels),
  };
  const closing = isBulkClose(changes);
  const conflicts = labelConflicts(changes);
  const count = `${todo.length} bead${todo.length === 1 ? "" : "s"}`;

  const apply = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !hasBulkChanges(changes) || conflicts.length) return;
    const patch = bulkPatch(changes);
    const hasPatch = Object.keys(patch).length > 0;
    const updated: BulkTarget[] = [];
    const failed: { target: BulkTarget; message: string }[] = [];
    setError(null);
    onBusy(true);
    for (const target of todo) {
      setProgress(updated.length + failed.length);
      try {
        // Closing is its own call: it records the reason, and the server picks the actor bd accepts from
        // the bead's assignee. It goes first, so a refused close changes nothing and a new assignee
        // from the same edit cannot make bd refuse it.
        if (closing) await api.setStatus(target.projectId, target.id, BULK_CLOSED, changes.closeReason);
        if (hasPatch) await api.update(target.projectId, target.id, patch);
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
      toast.success(`${closing ? "Closed" : "Updated"} ${updated.length} bead${updated.length === 1 ? "" : "s"} · bd ${closing ? "close" : "update"}`);
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
            {[...BULK_STATUSES, BULK_CLOSED].map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </SelectField>
        </label>
        {closing && (
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Close reason (optional)</span>
            <TextArea
              size="sm"
              rows={2}
              value={closeReason}
              disabled={busy}
              maxLength={10_000}
              placeholder="Why are these closed? Recorded on every bead."
              onChange={(e) => setCloseReason(e.target.value)}
            />
          </label>
        )}
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Add labels</span>
          <TextInput
            value={addLabels}
            disabled={busy}
            placeholder="Comma separated, e.g. urgent"
            onChange={(e) => setAddLabels(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Remove labels</span>
          <TextInput
            value={removeLabels}
            disabled={busy}
            placeholder="Comma separated, e.g. wip"
            onChange={(e) => setRemoveLabels(e.target.value)}
          />
        </label>
        {conflicts.length > 0 && (
          <p role="alert" className="rounded-lg border border-red-400 p-[8px_10px] text-label text-[var(--text)]">
            {conflicts.join(", ")} {conflicts.length === 1 ? "is" : "are"} in both Add and Remove.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-400 p-[8px_10px] text-label text-[var(--text)]">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-[12px_20px]">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <BrandButton type="submit" disabled={busy || !hasBulkChanges(changes) || conflicts.length > 0}>
          {busy ? `${closing ? "Closing" : "Updating"} ${progress + 1} of ${todo.length}…` : `${closing ? "Close" : "Update"} ${count}`}
        </BrandButton>
      </div>
    </form>
  );
}
