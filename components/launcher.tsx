"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, FlaskConical, FolderGit2, Loader2 } from "lucide-react";
import { Icon } from "@/components/icons";
import { BrandButton } from "@/components/brand-button";
import { NeedsYouBadge } from "@/components/needs-you-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconButton } from "@/components/controls";
import { useProjects } from "@/hooks/use-projects";
import { FolderBrowserModal } from "@/components/folder-browser-modal";
import { api, type ProjectInfo } from "@/lib/api-client";

export function Launcher() {
  const { data, isLoading } = useProjects();
  const [addOpen, setAddOpen] = React.useState(false);

  const projects = data?.projects ?? [];
  const demo = projects.find((p) => p.id === "demo");
  const real = projects.filter((p) => p.id !== "demo");

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <header className="flex items-center gap-[12px] border-b border-border p-[20px_28px]">
        <div
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-white"
          style={{ background: "var(--brand-solid)", boxShadow: "0 2px 8px -2px var(--brand)" }}
        >
          <Icon name="logo" size={19} />
        </div>
        <div className="flex-1 leading-[1.15]">
          <div className="text-page-title font-semibold tracking-[-.01em]">Beadscope</div>
          <div className="text-label text-[var(--text-3)]">
            Choose a beads project to view and manage
          </div>
        </div>
        <Link
          href="/needs-you"
          className="tap-target inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-[var(--surface-2)] px-3 py-1.5 text-label font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
        >
          <Icon name="user" size={15} />
          Needs You
          <NeedsYouBadge />
        </Link>
        <Link
          href="/agent-queue"
          className="tap-target inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-[var(--surface-2)] px-3 py-1.5 text-label font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
        >
          <Icon name="bot" size={15} />
          Agent Queue
        </Link>
        <ThemeToggle size="lg" />
      </header>

      <div className="mx-auto w-full max-w-[860px] flex-1 p-[28px] max-md:p-4">
        <div className="mb-[14px] flex items-center justify-between">
          <h2 className="text-body font-semibold uppercase tracking-[.03em] text-[var(--text-3)]">
            Projects
          </h2>
          <BrandButton icon="plus" onClick={() => setAddOpen(true)}>Add project</BrandButton>
        </div>

        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center text-[var(--text-3)]">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-[14px]">
            {demo && <DemoCard />}
            {real.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
            {real.length === 0 && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-[var(--border-strong)] p-5 text-[var(--text-3)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <Plus size={20} />
                <span className="text-label font-medium">Add your first project</span>
              </button>
            )}
          </div>
        )}
      </div>

      <FolderBrowserModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function CardShell({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className="group relative flex cursor-pointer md:min-h-[112px] flex-col gap-[10px] rounded-[13px] border border-border bg-[var(--surface)] p-[16px_18px] transition-colors hover:border-[var(--brand)] hover:bg-[var(--surface-2)]"
    >
      {children}
    </div>
  );
}

function DemoCard() {
  const router = useRouter();
  return (
    <CardShell onClick={() => router.push("/p/demo")}>
      <div className="flex items-center gap-[10px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#d9770618] text-[#d97706]">
          <FlaskConical size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-section font-semibold">Demo</div>
          <div className="text-meta text-[var(--text-3)]">built-in</div>
        </div>
      </div>
      <div className="text-label text-[var(--text-3)]">
        Seeded sample data — explore every view without bd installed.
      </div>
    </CardShell>
  );
}

function ProjectCard({ project }: { project: ProjectInfo }) {
  const router = useRouter();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.projects.remove(project.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Removed ${project.name}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <CardShell onClick={() => router.push(`/p/${project.id}`)}>
      <div className="flex items-center gap-[10px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <FolderGit2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-section font-semibold">{project.name}</div>
          <div className="flex items-center gap-1.5 text-meta text-[var(--text-3)]">
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{ background: project.hasBeads ? "#22c55e" : "#ef4444" }}
            />
            {project.hasBeads ? "bd repo" : "no .beads found"}
          </div>
        </div>
        {/* Always visible where there is no hover (phones, tablets): a control that only appears on
            hover cannot be found by touch. The confirm below guards a stray tap. */}
        <IconButton
          variant="ghost"
          danger
          label={`Remove ${project.name} from list`}
          title="Remove from list"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Remove "${project.name}" from the list? This does not delete any files.`)) {
              remove.mutate();
            }
          }}
          className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
      <div className="truncate text-left font-mono text-meta text-[var(--text-3)]" dir="rtl" title={project.path ?? ""}>
        {project.path}
      </div>
    </CardShell>
  );
}
