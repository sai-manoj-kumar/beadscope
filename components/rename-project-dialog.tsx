"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { projectTitle } from "@/lib/app-title";
import { BrandButton } from "@/components/brand-button";
import { Button, TextInput } from "@/components/controls";

/** Renames a project (the display name only; the id and URL stay the same). */
export function RenameProjectDialog({
  project,
  currentProjectId,
  onOpenChange,
}: {
  /** The project being renamed; the dialog is open while this is set. */
  project: { id: string; name: string } | null;
  /** The project on screen, whose browser tab title follows a rename. */
  currentProjectId: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!project} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[100%] gap-0 rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]">
        {project && (
          <RenameForm
            key={project.id}
            project={project}
            currentProjectId={currentProjectId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  project,
  currentProjectId,
  onClose,
}: {
  project: { id: string; name: string };
  currentProjectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = React.useState(project.name);
  const [error, setError] = React.useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (next: string) => api.projects.rename(project.id, next),
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      // The server renders the tab title; set it now so no reload is needed, then refresh so the
      // server-rendered metadata agrees.
      if (project.id === currentProjectId) {
        document.title = projectTitle(entry.name);
        router.refresh();
      }
      toast.success(`Renamed to ${entry.name}`);
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = name.trim();
    if (!next) {
      setError("Enter a name for the project.");
      return;
    }
    if (next === project.name) {
      onClose();
      return;
    }
    setError(null);
    rename.mutate(next);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col">
      <div className="border-b border-border p-[17px_20px]">
        <DialogTitle className="text-section font-semibold">Rename project</DialogTitle>
        <DialogDescription className="text-meta text-[var(--text-3)]">
          Only the name changes; the project&apos;s address stays the same.
        </DialogDescription>
      </div>
      <div className="flex flex-col gap-2 p-[16px_20px]">
        <TextInput
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          aria-label="Project name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "rename-project-error" : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {error && (
          <p id="rename-project-error" role="alert" className="text-label text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-[12px_20px]">
        <Button onClick={onClose}>Cancel</Button>
        <BrandButton type="submit" disabled={rename.isPending}>
          {rename.isPending ? "Saving…" : "Save"}
        </BrandButton>
      </div>
    </form>
  );
}
