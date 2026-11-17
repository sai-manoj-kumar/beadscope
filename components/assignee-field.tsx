"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { AssigneeAvatar, AssigneeSuggestions, filterSuggestions, useAssigneeNames } from "@/components/assignee-picker";
import { Icon } from "@/components/icons";
import { useUpdateBead } from "@/hooks/use-beads";
import type { Bead } from "@/lib/schema";

/** Assignment is independent of the drawer's description and comment drafts. */
export function AssigneeField({ bead }: { bead: Bead }) {
  const { readOnly } = useApp();
  const update = useUpdateBead();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  // Index of the suggestion picked with the arrow keys; -1 means none, so Enter saves the typed text.
  const [active, setActive] = React.useState(-1);
  const submitting = React.useRef(false);
  const listId = React.useId();
  const names = useAssigneeNames();
  const suggestions = filterSuggestions(names, draft);
  const save = (value = draft) => {
    if (readOnly || submitting.current) return;
    const assignee = value.trim();
    if (assignee === (bead.assignee ?? "")) {
      setEditing(false);
      return;
    }
    submitting.current = true;
    update.mutate({ id: bead.id, patch: { assignee } }, {
      onSuccess: () => setEditing(false),
      onSettled: () => { submitting.current = false; },
    });
  };
  const showList = focused && suggestions.length > 0;
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <span className="text-meta font-medium uppercase tracking-[.03em] text-[var(--text-3)]">Assignee</span>
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            role="combobox"
            aria-label="Assignee"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            placeholder="Unassigned"
            value={draft}
            disabled={readOnly || update.isPending}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={event => { setDraft(event.target.value); setActive(-1); }}
            onKeyDown={event => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setFocused(true);
                const n = suggestions.length;
                if (n) setActive(a => event.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                // A suggestion highlighted with the arrows is taken; otherwise whatever was typed.
                if (showList && active >= 0) save(suggestions[active]);
                else save();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                // First Escape closes the suggestions; the next cancels the edit.
                if (showList) setFocused(false);
                else setEditing(false);
              }
            }}
            className="h-9 w-full min-w-0 rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-body outline-none focus:border-[var(--brand)]"
          />
          {showList && (
            <AssigneeSuggestions
              id={listId}
              names={suggestions}
              typed={draft}
              active={active}
              onPick={name => { setDraft(name); setActive(-1); }}
            />
          )}
          <span className="text-meta text-[var(--text-3)]">Choose or type a name. Leave blank to unassign.</span>
          <div className="flex gap-2">
            <button type="button" aria-label="Save assignee" disabled={readOnly || update.isPending} onClick={() => save()} className="rounded-lg bg-[var(--brand)] px-3 py-1 text-label text-white">Save</button>
            <button type="button" aria-label="Cancel assignee edit" disabled={readOnly || update.isPending} onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-1 text-label">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label="Change assignee"
          title="Change assignee"
          disabled={readOnly || update.isPending}
          onClick={() => { setDraft(bead.assignee ?? ""); setActive(-1); setEditing(true); }}
          className="flex h-9 min-w-0 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-left hover:border-[var(--brand)]"
        >
          {/* An identity that is switched off keeps its icon, so older beads still read as an agent's. */}
          <AssigneeAvatar name={bead.assignee ?? ""} />
          <span className="min-w-0 flex-1 truncate text-body">{bead.assignee || "Unassigned"}</span>
          <Icon name="pencil" size={12} className="shrink-0 text-[var(--text-3)]" />
        </button>
      )}
    </div>
  );
}
