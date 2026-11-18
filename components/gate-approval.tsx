"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/components/app-context";

import { toastError } from "@/components/error-toast";
import { api } from "@/lib/api-client";
import { isSubmitKey } from "@/lib/keyboard-shortcuts";
import { beadsKey, activityKey } from "@/hooks/use-beads";
import { BrandButton } from "@/components/brand-button";
import { LinkButton, TextArea } from "@/components/controls";

/** Shared by both human-gate surfaces; approval records an explicit decision. */
export function GateApproval({ id }: { id: string }) {
  const { projectId, meta, readOnly } = useApp();
  const qc = useQueryClient();
  const [showNote, setShowNote] = React.useState(false);
  const [note, setNote] = React.useState("");
  const submitting = React.useRef(false);
  const noteId = React.useId();
  const approval = useMutation({
    mutationFn: (reason: string) => api.setStatus(projectId, id, "closed", reason),
    // Keep the gate mounted until success so a failed request preserves its note.
    onSuccess: async () => {
      setNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: beadsKey(projectId) }),
        qc.invalidateQueries({ queryKey: activityKey(projectId) }),
      ]);
    },
    onError: toastError,
    onSettled: () => { submitting.current = false; },
  });
  const approve = () => {
    if (readOnly || submitting.current) return;
    submitting.current = true;
    const actor = meta?.humanActor?.trim() || "human reviewer";
    const decision = `Approved by ${actor} via Beadscope at ${new Date().toISOString()}`;
    approval.mutate(note.trim() ? `${decision}\n\n${note.trim()}` : decision);
  };
  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <LinkButton
          className="text-meta"
          disabled={readOnly || approval.isPending}
          aria-expanded={showNote}
          aria-controls={noteId}
          onClick={() => setShowNote(!showNote)}
        >
          {showNote ? "Hide approval note" : "Add approval note"}
        </LinkButton>
        <BrandButton size="sm" icon="check" disabled={readOnly || approval.isPending} onClick={approve}>
          Approve
        </BrandButton>
      </div>
      {showNote && (
        <TextArea
  size="sm"
          id={noteId}
          aria-label="Approval note"
          placeholder="Optional approval note"
          value={note}
          onChange={event => setNote(event.target.value)}
          onKeyDown={event => {
            if (!isSubmitKey(event)) return;
            event.preventDefault();
            approve();
          }}
          disabled={readOnly || approval.isPending}
          maxLength={8000}
          rows={2}
          className="min-w-[180px]"
        />
      )}
    </div>
  );
}
