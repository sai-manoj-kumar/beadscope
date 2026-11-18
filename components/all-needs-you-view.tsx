"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppProvider } from "@/components/app-context";
import { SelectField } from "@/components/controls";
import { GateCard, NeedsYouCard } from "@/components/needs-you-view";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { beadsKey } from "@/hooks/use-beads";
import { useProjects } from "@/hooks/use-projects";
import { useUrlState } from "@/hooks/use-url-state";
import { useViewerMode } from "@/hooks/use-viewer-mode";
import { api, type BeadsResponse, type ProjectInfo } from "@/lib/api-client";
import { makeIndex, needsHuman, readyHumanGate } from "@/lib/beads-view";

/** `?repo=` value meaning "every repo" (the param is simply absent). */
const ALL = "";

/**
 * "Needs You" across every registered repo: the same inbox as the per-project view (beads an agent
 * flagged with `bd human`, and human-approval gates that are ready to approve), gathered from all
 * projects, with a repo filter. Each repo's cards render inside that repo's own app scope, so
 * Respond, Dismiss and Approve act on the right project exactly as they do in the project view.
 */
export function AllNeedsYouView() {
  const { data: projectData, isLoading: loadingProjects } = useProjects();
  const projects = React.useMemo(() => projectData?.projects ?? [], [projectData]);
  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: beadsKey(p.id),
      queryFn: () => api.list(p.id),
      refetchInterval: (q: { state: { data?: BeadsResponse } }) => q.state.data?.meta.pollIntervalMs ?? 5000,
    })),
  });
  const viewerMode = useViewerMode();
  const readOnly = viewerMode.data?.readOnly ?? true;
  const { searchParams, updateUrl } = useUrlState();
  const requested = searchParams.get("repo") ?? ALL;
  // An unknown repo (a stale link, a removed project) falls back to All rather than an empty page.
  const repo = projects.some((p) => p.id === requested) ? requested : ALL;
  const setRepo = (next: string) =>
    updateUrl((params) => {
      if (next === ALL) params.delete("repo");
      else params.set("repo", next);
    });

  const sections = projects.map((project, i) => ({ project, query: results[i] }));
  const shown = sections.filter(({ project }) => repo === ALL || project.id === repo);
  const settled = !loadingProjects && sections.every(({ query }) => !query.isLoading);
  const failed = shown.filter(({ query }) => query.isError);

  // Counts per repo are always the whole picture, so the filter labels stay honest.
  const counts = new Map<string, number>();
  for (const { project, query } of sections) {
    const beads = query.data?.beads ?? [];
    const index = makeIndex(beads);
    counts.set(
      project.id,
      beads.filter(needsHuman).length + beads.filter((b) => readyHumanGate(b, index)).length,
    );
  }
  const total = shown.reduce((sum, { project }) => sum + (counts.get(project.id) ?? 0), 0);
  const withItems = shown.filter(({ project }) => (counts.get(project.id) ?? 0) > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground text-body">
      <PageHeader
        title="Needs You"
        subtitle={
          !settled ? "Loading…" : total === 0 ? "nothing waiting" : `${total} waiting on you · ${repo === ALL ? "all repos" : "1 repo"}`
        }
        controls={
          <>
            <Link
              href="/"
              className="tap-target inline-flex items-center gap-1.5 text-label text-[var(--text-3)] hover:text-[var(--text)]"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Projects
            </Link>
            <label className="flex items-center gap-2 text-label text-[var(--text-3)]">
              Repo
              <SelectField
                size="sm"
                aria-label="Filter by repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
              >
                <option value={ALL}>All repos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {(counts.get(p.id) ?? 0) > 0 ? ` (${counts.get(p.id)})` : ""}
                  </option>
                ))}
              </SelectField>
            </label>
          </>
        }
        actions={<ThemeToggle />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!settled ? (
          <div className="p-10 text-center text-body text-[var(--text-3)]">Loading…</div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {failed.map(({ project }) => (
              <p
                key={project.id}
                role="status"
                className="rounded-[10px] border border-border bg-[var(--surface)] p-3 text-label text-[var(--text-2)]"
              >
                Couldn’t read {project.name}, so anything waiting there is not listed.
              </p>
            ))}
            {total === 0 ? (
              <div className="p-10 text-center text-body text-[var(--text-3)]">
                🎉 Nothing needs you right now
                {repo === ALL ? " in any repo" : " in this repo"}. Agents flag beads here with{" "}
                <span className="font-mono">bd human</span>, and human-approval gates (
                <span className="font-mono">bd gate create --type human</span>) show up once their
                blockers clear.
              </div>
            ) : (
              withItems.map(({ project, query }) => (
                <RepoSection
                  key={project.id}
                  project={project}
                  data={query.data}
                  readOnly={readOnly}
                  showHeading={repo === ALL}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One repo's cards, inside that repo's own app scope. */
function RepoSection({
  project,
  data,
  readOnly,
  showHeading,
}: {
  project: ProjectInfo;
  data: BeadsResponse | undefined;
  readOnly: boolean;
  showHeading: boolean;
}) {
  const router = useRouter();
  const [selectedBeadId, selectBead] = React.useState<string | null>(null);
  const beads = React.useMemo(() => data?.beads ?? [], [data]);
  const index = React.useMemo(() => makeIndex(beads), [beads]);
  const gates = React.useMemo(() => beads.filter((b) => readyHumanGate(b, index)), [beads, index]);
  const inbox = React.useMemo(() => beads.filter(needsHuman), [beads]);
  const projectId = project.id;
  // Opening a bead leaves this page for the repo, where the drawer opens on it.
  const openDetail = React.useCallback(
    (id: string) => router.push(`/p/${encodeURIComponent(projectId)}?bead=${encodeURIComponent(id)}`),
    [router, projectId],
  );
  const noop = React.useCallback(() => {}, []);

  return (
    <AppProvider
      value={{
        projectId,
        beads,
        index,
        meta: data?.meta,
        humanAllowlist: data?.meta?.humanAllowlist ?? [],
        readOnly,
        loading: false,
        selectedBeadId,
        selectBead,
        openDetail,
        pushDetail: openDetail,
        openCreate: noop,
        openEpic: noop,
      }}
    >
      <section data-repo-section={projectId} aria-label={project.name} className="flex flex-col gap-3">
        {showHeading && (
          <h2 className="flex items-baseline gap-2 text-body font-semibold text-[var(--text)]">
            <Link href={`/p/${encodeURIComponent(projectId)}`} className="hover:underline">
              {project.name}
            </Link>
            <span className="text-meta font-normal text-[var(--text-3)]">{gates.length + inbox.length} waiting</span>
          </h2>
        )}
        {gates.map((g) => (
          <GateCard key={g.id} gate={g} />
        ))}
        {inbox.map((b) => (
          <NeedsYouCard key={b.id} bead={b} />
        ))}
      </section>
    </AppProvider>
  );
}
