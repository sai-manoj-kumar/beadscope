"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Folder, FolderOpen, Home, ArrowUp, Check, Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { BrandButton } from "@/components/brand-button";
import { Button, IconButton, TextInput } from "@/components/controls";

export function FolderBrowserModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[580px] max-w-[100%] gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]"
      >
        {open && <Browser onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Browser({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  // undefined → let the server default to the home directory
  const [path, setPath] = React.useState<string | undefined>(undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fs", path ?? "~home"],
    queryFn: () => api.fs.browse(path),
  });

  const go = (p: string) => {
    const trimmed = p.trim();
    if (trimmed) setPath(trimmed);
  };

  const add = useMutation({
    mutationFn: (p: string) => api.projects.add(p),
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Added ${entry.name}`);
      onClose();
      router.push(`/p/${entry.id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const errMsg = error ? (error as Error).message : undefined;

  return (
    <>
      <div className="flex items-center gap-[10px] border-b border-border p-[17px_20px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <FolderOpen size={16} />
        </div>
        <div className="flex-1">
          <DialogTitle className="text-section font-semibold">Add a project</DialogTitle>
          <DialogDescription className="text-meta text-[var(--text-3)]">
            Pick a folder that contains a <span className="font-mono">.beads</span> directory
          </DialogDescription>
        </div>
      </div>

      {/* Path bar */}
      <div className="flex items-center gap-2 border-b border-border bg-[var(--surface-2)] p-[10px_16px]">
        <IconButton label="Home" title="Home" onClick={() => setPath(undefined)}>
          <Home size={14} />
        </IconButton>
        <IconButton label="Up one level" title="Up one level" onClick={() => data?.parent && setPath(data.parent)} disabled={!data?.parent}>
          <ArrowUp size={14} />
        </IconButton>
        <TextInput
          size="sm"
          mono
          // Re-mount on navigation so the field shows where we landed, while
          // still letting the user freely type/paste a path in between.
          key={data?.path ?? "home"}
          defaultValue={data?.path ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go((e.target as HTMLInputElement).value);
            }
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Type or paste a path, then press Enter"
          aria-label="Folder path"
          className={`w-0 flex-1 bg-[var(--surface)] ${errMsg ? "border-[#d97706]" : ""}`}
        />
      </div>

      {/* Entries */}
      <div className="bd-scroll max-h-[340px] min-h-[200px] overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-[180px] items-center justify-center text-[var(--text-3)]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : errMsg ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertTriangle size={20} className="text-[#d97706]" />
            <p className="text-label text-[var(--text-2)]">{errMsg}</p>
            <Button variant="outline" size="sm" onClick={() => setPath(undefined)}>
              Go home
            </Button>
          </div>
        ) : data && data.entries.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-label text-[var(--text-3)]">
            No subfolders here
          </div>
        ) : (
          data?.entries.map((entry) => (
            <button
              key={entry.path}
              onDoubleClick={() => setPath(entry.path)}
              onClick={() => setPath(entry.path)}
              className="flex w-full items-center gap-[10px] rounded-[9px] px-[10px] py-2 text-left tap-target hover:bg-[var(--surface-2)]"
            >
              <Folder
                size={16}
                className={entry.hasBeads ? "text-[var(--brand)]" : "text-[var(--text-3)]"}
              />
              <span className="min-w-0 flex-1 truncate text-body text-[var(--text)]">
                {entry.name}
              </span>
              {entry.hasBeads && (
                <span className="rounded-full bg-[var(--brand-weak)] px-2 py-0.5 font-mono text-meta font-medium text-[var(--brand)]">
                  beads
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-[10px] border-t border-border p-[14px_18px]">
        <div className="min-w-[8rem] flex-1 text-meta text-[var(--text-3)] max-md:basis-full">
          {data?.hasBeads ? (
            <span className="flex items-center gap-1.5 text-[var(--text-2)]">
              <Check size={13} className="flex-shrink-0 text-[#22c55e]" />
              <span>This folder has a <span className="font-mono">.beads</span> repo</span>
            </span>
          ) : (
            "Navigate into a folder that contains a .beads directory"
          )}
        </div>
        <Button size="lg" className="max-md:flex-1" onClick={onClose}>
          Cancel
        </Button>
        <BrandButton
          className="max-md:flex-[2]"
          onClick={() => data?.path && add.mutate(data.path)}
          disabled={!data?.hasBeads || add.isPending}
        >
          {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
          Add this folder
        </BrandButton>
      </div>
    </>
  );
}
