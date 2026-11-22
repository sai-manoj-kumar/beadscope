"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppProvider } from "@/components/app-context";
import { RepoBeadDrawer, useRepoDrawer } from "@/components/repo-bead-drawer";
import { CompletedToggle, DONE_PARAM } from "@/components/completed-toggle";
import { SelectField } from "@/components/controls";
import { AssignedCard, GateCard, NeedsYouCard } from "@/components/needs-you-view";
import { PageHeader } from "@/components/page-header";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAllRepoBeads } from "@/hooks/use-all-repo-beads";
import { useBeadsStreams } from "@/hooks/use-beads-stream";
import { useDefaultPage } from "@/hooks/use-default-view";
import { projectHref } from "@/lib/default-page";
import { useUrlState } from "@/hooks/use-url-state";
import { useNow } from "@/hooks/use-now";
import { useViewerMode } from "@/hooks/use-viewer-mode";
import type { BeadsResponse, ProjectInfo } from "@/lib/api-client";
import type { Bead } from "@/lib/schema";
import {
  assignedToYou,
  byClosedAtDesc,
  completedForYou,
  countNeedsYou,
  makeIndex,
  needsHuman,
  readyHumanGate,
  RECENTLY_COMPLETED_DAYS,
} from "@/lib/beads-view";

/** `?repo=` value meaning "every repo" (the param is simply absent). */
const ALL = "";

/** The one selected card on the page: a bead id is only unique within its repo. */
type Selection = { projectId: string; beadId: string };

/**
 * "Needs You" across every registered repo: the same inbox as the per-project view (beads an agent
 * flagged with `bd human`, human-approval gates that are ready to approve, and beads assigned to
 * you), gathered from all projects, with a repo filter. Each repo's cards render inside that repo's own app scope, so
 * Respond, Dismiss and Approve act on the right project exactly as they do in the project view.
 */
export function AllNeedsYouView() {
  // A folder that lost its .beads cannot be read; the launcher already flags it, so it is left out here.
  const { projects, results, loadingProjects } = useAllRepoBeads();
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

  // The toggle at the top: also list what was completed in the last few days (off by default).
  const showDone = searchParams.get(DONE_PARAM) === "1";
  const setShowDone = (next: boolean) =>
    updateUrl((params) => {
      if (next) params.set(DONE_PARAM, "1");
      else params.delete(DONE_PARAM);
    });

  const sections = projects.map((project, i) => ({ project, query: results[i] }));
  const shown = sections.filter(({ project }) => repo === ALL || project.id === repo);
  const settled = !loadingProjects && shown.every(({ query }) => !query.isLoading);
  const failed = shown.filter(({ query }) => query.isError);
  // New flags land as soon as a repo's .beads changes, as in the project view; the poll is the fallback.
  useBeadsStreams(shown.map(({ project }) => project.id));
  // One selection for the whole page, so only one card carries the ring whichever repo it is in.
  const [selected, setSelected] = React.useState<Selection | null>(null);
  // Opening a bead shows its drawer over this page, as the Epics page does.
  const drawer = useRepoDrawer();
  const openBead = drawer.openBead;
  const dataFor = React.useCallback(
    (id: string) => results[projects.findIndex((p) => p.id === id)]?.data,
    [results, projects],
  );
  const selectIn = React.useCallback(
    (projectId: string, id: string | null) => setSelected(id ? { projectId, beadId: id } : null),
    [],
  );
  const openIn = React.useCallback(
    (projectId: string, id: string) => {
      selectIn(projectId, id);
      openBead(projectId, id);
    },
    [selectIn, openBead],
  );

  // Counts per repo are always the whole picture, so the filter labels stay honest.
  const counts = new Map<string, number>();
  for (const { project, query } of sections) {
    counts.set(project.id, countNeedsYou(query.data?.beads ?? [], query.data?.meta?.humanActor));
  }
  const total = shown.reduce((sum, { project }) => sum + (counts.get(project.id) ?? 0), 0);
  // Recently completed beads, per repo, newest first; empty while the toggle is off.
  const now = useNow();
  const completed = new Map<string, Bead[]>();
  if (showDone) {
    for (const { project, query } of sections) {
      const actor = query.data?.meta?.humanActor;
      completed.set(project.id, (query.data?.beads ?? []).filter((b) => completedForYou(b, actor, now)).sort(byClosedAtDesc));
    }
  }
  const doneCount = (id: string) => completed.get(id)?.length ?? 0;
  const doneTotal = shown.reduce((sum, { project }) => sum + doneCount(project.id), 0);
  const withItems = shown.filter(({ project }) => (counts.get(project.id) ?? 0) + doneCount(project.id) > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground text-body">
      <ReadOnlyBanner />
      <PageHeader
        title="Needs You"
        standalone
        subtitle={
          !settled
            ? "Loading…"
            : (total === 0 ? "nothing waiting" : `${total} waiting on you`) +
              (showDone ? ` · ${doneTotal} completed` : "") +
              (total === 0 ? "" : ` · ${repo === ALL ? "all repos" : "1 repo"}`)
        }
        controls={
          <>
            <Link
              href="/"
              className="tap-target inline-flex items-center justify-center gap-1.5 text-label text-[var(--text-3)] hover:text-[var(--text)] max-md:-ml-2 max-md:px-2"
            >
              <ArrowLeft size={14} aria-hidden="true" className="max-md:size-5" />
              {/* The arrow stands alone (a 44px target on phones); the name stays for screen readers. */}
              <span className="sr-only">Projects</span>
            </Link>
            <label className="flex min-w-0 items-center gap-2 text-label text-[var(--text-3)]">
              <span className="max-md:sr-only">Repo</span>
              <SelectField
                size="sm"
                className="min-w-0 max-w-full"
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
            <CompletedToggle on={showDone} onChange={setShowDone} />
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
            {total === 0 && doneTotal === 0 ? (
              <div className="p-10 text-center text-body text-[var(--text-3)]">
                {failed.length > 0 ? "Nothing waiting in the repos that could be read" : "🎉 Nothing needs you right now"}
                {failed.length > 0 ? "" : repo === ALL ? " in any repo" : " in this repo"}. Agents flag beads here with{" "}
                <span className="font-mono">bd human</span>, human-approval gates (
                <span className="font-mono">bd gate create --type human</span>) show up once their
                blockers clear, and beads assigned to you are listed too.
              </div>
            ) : (
              withItems.map(({ project, query }) => (
                <RepoSection
                  key={project.id}
                  project={project}
                  data={query.data}
                  completed={completed.get(project.id) ?? []}
                  readOnly={readOnly}
                  showHeading={repo === ALL}
                  selectedBeadId={selected?.projectId === project.id ? selected.beadId : null}
                  onSelect={setSelected}
                  onOpen={openIn}
                />
              ))
            )}
          </div>
        )}
      </div>
      <RepoBeadDrawer drawer={drawer} dataFor={dataFor} readOnly={readOnly} onSelect={selectIn} />
    </div>
  );
}

/** One repo's cards, inside that repo's own app scope. */
function RepoSection({
  project,
  data,
  completed,
  readOnly,
  showHeading,
  selectedBeadId,
  onSelect,
  onOpen,
}: {
  project: ProjectInfo;
  data: BeadsResponse | undefined;
  /** Beads completed in the last few days; empty unless the page's toggle is on. */
  completed: Bead[];
  readOnly: boolean;
  showHeading: boolean;
  selectedBeadId: string | null;
  onSelect: (selection: Selection | null) => void;
  onOpen: (projectId: string, id: string) => void;
}) {
  const { page } = useDefaultPage();
  const beads = React.useMemo(() => data?.beads ?? [], [data]);
  const index = React.useMemo(() => makeIndex(beads), [beads]);
  const gates = React.useMemo(() => beads.filter((b) => readyHumanGate(b, index)), [beads, index]);
  const inbox = React.useMemo(() => beads.filter(needsHuman), [beads]);
  const actor = data?.meta?.humanActor;
  const mine = React.useMemo(() => beads.filter((b) => assignedToYou(b, actor)), [beads, actor]);
  const projectId = project.id;
  const selectBead = React.useCallback(
    (id: string | null) => onSelect(id ? { projectId, beadId: id } : null),
    [onSelect, projectId],
  );
  const openDetail = React.useCallback((id: string) => onOpen(projectId, id), [onOpen, projectId]);
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
            <Link href={projectHref(projectId, page)} className="hover:underline">
              {project.name}
            </Link>
            <span className="text-meta font-normal text-[var(--text-3)]">
              {gates.length + inbox.length + mine.length} waiting
              {completed.length > 0 ? ` · ${completed.length} completed` : ""}
            </span>
          </h2>
        )}
        {gates.map((g) => (
          <GateCard key={g.id} gate={g} />
        ))}
        {inbox.map((b) => (
          <NeedsYouCard key={b.id} bead={b} />
        ))}
        {mine.map((b) => (
          <AssignedCard key={b.id} bead={b} />
        ))}
        {completed.length > 0 && (
          <>
            <h3 className="text-meta font-medium text-[var(--text-3)]">Completed in the last {RECENTLY_COMPLETED_DAYS} days</h3>
            {completed.map((b) => (
              <AssignedCard key={b.id} bead={b} completed />
            ))}
          </>
        )}
      </section>
    </AppProvider>
  );
}
