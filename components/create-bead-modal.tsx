"use client";
import * as React from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { BrandButton } from "@/components/brand-button";
import { Button, CheckInput, IconButton, SelectField, TextArea, TextInput } from "@/components/controls";
import { useApp } from "@/components/app-context";
import { useCreateBead, beadsKey } from "@/hooks/use-beads";
import { useImageDrop } from "@/hooks/use-image-drop";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { DescriptionContent, hasImageRef } from "@/components/description-content";
import { api } from "@/lib/api-client";
import { typeLabel } from "@/lib/beads-view";
import { attachmentFilesOf, repointAttachmentFiles, repointAttachmentRefs } from "@/lib/attachment-refs";
import { cloneDraft } from "@/lib/clone-bead";
import { inputValueToDue } from "@/lib/due-input";
import { isSubmitKey } from "@/lib/keyboard-shortcuts";
import { BEAD_TYPES, type BeadType } from "@/lib/schema";
import { AssigneeSelect, useAssigneeNames } from "@/components/assignee-picker";

const labelClass = "text-label font-medium text-[var(--text-2)]";

interface FormState {
  type: BeadType;
  priority: number;
  title: string;
  description: string;
  assignee: string;
  parent: string;
  labels: string;
  /** A datetime-local value in the browser's time zone; "" when no due date is set. */
  due: string;
  backlog: boolean;
}

export function CreateBeadModal({
  open,
  parent,
  type,
  cloneOf,
  onOpenChange,
}: {
  open: boolean;
  parent: string;
  /** Preselected issue type, e.g. "epic" from the Epics screen. A default, not a lock. */
  type?: BeadType;
  /** Id of a bead to start from a copy of (the form is prefilled and every field stays editable). */
  cloneOf?: string;
  onOpenChange: (o: boolean) => void;
}) {
  // ~50% wider than the old 540px default; drag the right edge to resize (persisted).
  const { width, startResize } = useResizableWidth({
    storageKey: "beadscope.width.create",
    defaultWidth: 810,
    min: 480,
    max: 1200,
    deltaFactor: 2,
  });
  // Set by the form while it holds typed text. A stray click on the backdrop
  // must not discard a half-written bead; Esc, Cancel and × still close it.
  const dirtyRef = React.useRef(false);
  const mobile = useIsMobile();
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "outside-press" && dirtyRef.current) {
          details.cancel();
          toast("Your new bead isn't saved yet", {
            id: "create-unsaved",
            description: "Press Esc or Cancel to discard it.",
          });
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        style={{ width: mobile ? "100vw" : width, maxWidth: mobile ? "100vw" : "96vw" }}
        // Phones: the whole screen, so the form scrolls inside it and Create stays reachable.
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)] max-md:h-dvh max-md:max-h-dvh max-md:rounded-none"
      >
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-ew-resize hover:bg-[var(--brand)]/40 max-md:hidden"
        />
        {/* Conditionally mounted, so the form remounts on every open and the
            preset below is picked up fresh — no useEffect sync needed. */}
        {open && (
          <CreateForm parent={parent} type={type} cloneOf={cloneOf} dirtyRef={dirtyRef} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({
  parent,
  type: presetType,
  cloneOf,
  dirtyRef,
  onClose,
}: {
  parent: string;
  type?: BeadType;
  cloneOf?: string;
  dirtyRef: React.RefObject<boolean>;
  onClose: () => void;
}) {
  const { beads, meta, projectId } = useApp();
  const create = useCreateBead();
  const qc = useQueryClient();
  const actor = meta?.humanActor ?? "you";
  const isDemo = meta?.kind === "demo";

  // A clone starts from the source bead's copyable fields (lib/clone-bead.ts); the form is
  // remounted on every open, so this is read once. If the source has vanished, it is a plain create.
  const source = cloneOf ? beads.find((b) => b.id === cloneOf) : undefined;
  const [form, setForm] = React.useState<FormState>(() => {
    if (source) return cloneDraft(source);
    return {
      type: presetType ?? "task",
      priority: 2,
      title: "",
      description: "",
      assignee: "",
      parent,
      labels: "",
      due: "",
      backlog: false,
    };
  });

  // Display text for the parent picker. Seeded from an incoming preset (e.g.
  // "Add subtask" / "Add child to this epic") so the field shows what it holds.
  const parentListId = `parents-${React.useId()}`;
  const [parentDraft, setParentDraft] = React.useState(() => {
    const initial = form.parent;
    if (!initial) return "";
    const b = beads.find((x) => x.id === initial);
    return b ? `${b.id} · ${b.title}` : initial;
  });

  // Resolve type-preset (gh-16) and parent into ONE title rather than nested
  // ternaries, so the two features compose: "New epic", "New child bug", etc.
  const dialogTitle = source
    ? `Clone ${source.id}`
    : presetType
      ? `New ${form.parent ? "child " : ""}${typeLabel(presetType).toLowerCase()}`
      : form.parent
        ? "New child bead"
        : "New bead";

  // A datetime-local input reads "" until every part is filled, so a half-filled date looks empty in
  // `form.due`. `validity.badInput` is the browser saying there is something in it. A complete value
  // that is out of range (a year before 1900) is just as unusable. Either blocks Create and counts as
  // typed text for the outside-press guard.
  const [dueIncomplete, setDueIncomplete] = React.useState(false);
  const dueUnusable = dueIncomplete || (form.due !== "" && inputValueToDue(form.due) === null);
  const hasText =
    dueUnusable || [form.title, form.description, form.assignee, form.labels, form.due].some((v) => v.trim() !== "");
  React.useEffect(() => {
    dirtyRef.current = hasText;
    return () => {
      dirtyRef.current = false;
    };
  }, [dirtyRef, hasText]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Images dropped before the bead exists go to a draft folder; on create we
  // rename that folder to the real id and rewrite the refs in the description.
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const uid = React.useId();
  const draftId = React.useMemo(() => "draft-" + uid.replace(/[^a-zA-Z0-9]/g, ""), [uid]);

  // Auto-grow a textarea to fit its content (used by the title field).
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const drop = useImageDrop({
    projectId,
    beadId: draftId,
    disabled: isDemo,
    disabledMessage: "Attachments aren't available for the Demo project.",
    textareaRef: taRef,
    value: form.description,
    onChange: (v) => set("description", v),
  });

  // Any open bead can parent another (bd allows it and createInputSchema/
  // `bd create --parent` already accept any id) — epics first, since
  // epic-as-parent stays the common case and must not get harder to reach.
  const parentOptions = React.useMemo(
    () =>
      beads
        .filter((b) => b.status !== "closed")
        .sort(
          (a, b) =>
            Number(a.issue_type !== "epic") - Number(b.issue_type !== "epic") ||
            a.priority - b.priority ||
            a.id.localeCompare(b.id),
        ),
    [beads],
  );
  const assignees = useAssigneeNames();

  function submit() {
    if (!form.title.trim() || dueUnusable || create.isPending) return;
    create.mutate(
      {
        title: form.title.trim(),
        issue_type: form.type,
        priority: form.priority,
        description: form.description,
        assignee: form.assignee,
        labels: form.labels.split(",").map((s) => s.trim()).filter(Boolean),
        parent: form.parent,
        // submit() has already refused an unfinished date; "" here means no due date was set.
        due: inputValueToDue(form.due) ?? "",
        backlog: form.backlog,
      },
      {
        onSuccess: async (newBead) => {
          // Images added in this dialog sit under a draft folder, and a clone's images under the
          // source bead's. Both are moved or copied under the new bead's id so its description no
          // longer depends on either folder.
          const draftRef = form.description.includes(`attachment://${draftId}/`);
          const cloneFiles = source ? attachmentFilesOf(form.description, source.id) : [];
          if (draftRef || cloneFiles.length > 0) {
            try {
              let rewritten = form.description;
              // The copy goes first and the two steps fail apart: one failing must not strand the other.
              let failure: unknown;
              if (source && cloneFiles.length > 0) {
                try {
                  const { copied } = await api.attachments.copy(projectId, source.id, newBead.id, cloneFiles);
                  // Only refs whose file was copied are repointed; a missing source image stays as written.
                  rewritten = repointAttachmentFiles(rewritten, source.id, newBead.id, copied);
                } catch (e) {
                  failure = e;
                }
              }
              if (draftRef) {
                try {
                  await api.attachments.finalize(projectId, draftId, newBead.id);
                  rewritten = repointAttachmentRefs(rewritten, draftId, newBead.id);
                } catch (e) {
                  failure ??= e;
                }
              }
              if (rewritten !== form.description) {
                await api.update(projectId, newBead.id, { description: rewritten });
                qc.invalidateQueries({ queryKey: beadsKey(projectId) });
              }
              if (failure) throw failure;
            } catch (e) {
              toast.error((e as Error).message);
            }
          }
          onClose();
        },
      },
    );
  }

  // Cmd/Ctrl+Enter creates the bead from anywhere in the modal. A ref keeps the
  // listener pointed at the latest closure without re-binding on every keystroke.
  const submitRef = React.useRef(submit);
  React.useEffect(() => {
    submitRef.current = submit;
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSubmitKey(e)) {
        e.preventDefault();
        submitRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex shrink-0 items-center gap-[10px] border-b border-border p-[17px_20px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <Icon name="plus" size={16} />
        </div>
        <div className="flex-1">
          <DialogTitle className="text-section font-semibold">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="font-mono text-meta text-[var(--text-3)]">
            bd create … --json
          </DialogDescription>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <Icon name="x" size={14} />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-5">
        {source && (
          <p className="text-label text-[var(--text-2)]">
            Starts as a copy of <span className="font-mono">{source.id}</span>. Change anything below. Comments,
            activity and dependencies are not copied.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Type</span>
            <SelectField value={form.type} onChange={(e) => set("type", e.target.value as BeadType)}>
              {BEAD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </SelectField>
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Priority</span>
            <SelectField
              value={String(form.priority)}
              onChange={(e) => set("priority", Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4].map((p) => (
                <option key={p} value={String(p)}>
                  {p} · {["Critical", "High", "Medium", "Low", "Backlog"][p]}
                </option>
              ))}
            </SelectField>
          </label>
        </div>

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Title</span>
          <TextArea
            autoFocus
            ref={autosize}
            rows={1}
            className="min-h-[38px] resize-none overflow-hidden leading-[1.4]"
            value={form.title}
            onChange={(e) => {
              set("title", e.target.value);
              autosize(e.currentTarget);
            }}
            placeholder="What needs doing?"
            onKeyDown={(e) => {
              // Enter submits (titles are single-line); the box still grows as text wraps.
              // Cmd/Ctrl+Enter is owned by the modal-wide listener — skip it here so it
              // doesn't submit twice.
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>
            Description{" "}
            {!isDemo && (
              <span className="font-normal text-[var(--text-3)]">· drop or paste images</span>
            )}
          </span>
          <div
            className="relative"
            onDrop={drop.onDrop}
            onDragOver={drop.onDragOver}
            onDragLeave={drop.onDragLeave}
          >
            <TextArea
              ref={taRef}
              className={drop.dragOver ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : ""}
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              onPaste={drop.onPaste}
              placeholder={
                isDemo
                  ? "Optional details, acceptance criteria…"
                  : "Optional details, acceptance criteria… drag and drop screenshots and images here too!"
              }
            />
            {drop.uploading && (
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-meta text-[var(--text-3)]">
                <Icon name="image" size={12} /> Uploading…
              </span>
            )}
          </div>
          {!isDemo && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={drop.pickFiles}
              />
              <Button
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Icon name="image" size={14} /> Attach image
              </Button>
            </div>
          )}
          {hasImageRef(form.description) && (
            <DescriptionContent
              text={form.description}
              projectId={projectId}
              className="mt-1 rounded-[8px] border border-border bg-[var(--surface-2)] p-2 text-label text-[var(--text-2)]"
            />
          )}
        </label>

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {/* A div, not a label: a label would forward a click on an option back to the button and reopen the list. */}
          <div className="flex flex-col gap-[6px]">
            <span className={labelClass}>Assignee</span>
            <AssigneeSelect value={form.assignee} onChange={(a) => set("assignee", a)} names={assignees} />
          </div>
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Parent</span>
            {/* A datalist-backed input rather than a bare <select>: the option
                list is now every open bead, which is far too long to scan. The
                visible text is "<id> · <title> (<type>)" and the id is parsed
                back out on change, so similar titles stay distinguishable. */}
            <TextInput
              list={parentListId}
              value={parentDraft}
              onChange={(e) => {
                const v = e.target.value;
                setParentDraft(v);
                const id = v.split(" · ")[0].trim();
                set("parent", parentOptions.some((b) => b.id === id) ? id : "");
              }}
              placeholder="No parent — type to search…"
              className="cursor-text"
            />
            <datalist id={parentListId}>
              {parentOptions.map((b) => (
                <option key={b.id} value={`${b.id} · ${b.title}`}>
                  {typeLabel(b.issue_type)}
                </option>
              ))}
            </datalist>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>
              Labels <span className="font-normal text-[var(--text-3)]">· comma separated</span>
            </span>
            <TextInput
              mono
              value={form.labels}
              onChange={(e) => set("labels", e.target.value)}
              placeholder="ui, dnd, m3"
            />
          </label>
          {/* A div around the label, so the error text is not part of the field's accessible name. */}
          <div className="flex flex-col gap-[6px]">
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>
              Due <span className="font-normal text-[var(--text-3)]">· optional</span>
            </span>
            {/* Local time zone in, ISO UTC out (lib/due-input.ts), the same as the drawer's Due field. */}
            <TextInput
              type="datetime-local"
              className="min-w-0"
              value={form.due}
              aria-invalid={dueUnusable ? true : undefined}
              aria-describedby={dueUnusable ? "create-due-error" : undefined}
              onChange={(e) => set("due", e.target.value)}
              // The value stays "" while the date is half filled, so the browser fires no input or change
              // event for it (and React would drop a change event that leaves "" as ""). Read
              // `validity.badInput` after each key and on blur as well as on input (picker, Clear).
              onInput={(e) => setDueIncomplete(e.currentTarget.validity.badInput)}
              onKeyUp={(e) => setDueIncomplete(e.currentTarget.validity.badInput)}
              onBlur={(e) => setDueIncomplete(e.currentTarget.validity.badInput)}
            />
          </label>
            {dueUnusable && (
              // --text-2 is AA on every surface; the red --destructive is not for small text.
              <span id="create-due-error" role="alert" className="text-label font-medium text-[var(--text-2)]">
                Finish the due date and time, or clear it. As it is, the bead would be created with no due date.
              </span>
            )}
          </div>
        </div>

        <label className="flex cursor-pointer select-none items-center gap-[9px] max-md:min-h-11">
          <CheckInput checked={form.backlog} onChange={(e) => set("backlog", e.target.checked)} />
          <span className="text-body text-[var(--text-2)]">
            Start in Backlog (<span className="font-mono">deferred</span>) instead of Ready
          </span>
        </label>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-[10px] border-t border-border p-[15px_20px] max-md:p-[12px_16px]">
        <div className="flex flex-1 items-center gap-[7px] text-meta text-[var(--text-3)] max-md:order-first max-md:basis-full">
          <Icon name="user" size={13} className="text-[var(--text-2)]" />
          <span>
            Stamped <span className="font-mono text-[var(--text-2)]">created_by={actor}</span>
          </span>
        </div>
        <Button size="lg" className="max-md:flex-1" onClick={onClose}>
          Cancel
        </Button>
        <BrandButton
          icon="check"
          onClick={submit}
          disabled={!form.title.trim() || dueUnusable || create.isPending}
          className="max-md:flex-[2]"
        >
          Create bead
        </BrandButton>
      </div>
    </>
  );
}
