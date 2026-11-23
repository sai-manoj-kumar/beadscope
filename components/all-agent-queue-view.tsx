"use client";
import * as React from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AgentIcon } from "@/components/agent-icon";
import { PriorityChip } from "@/components/board/bead-card";
import { StatusChip } from "@/components/chip";
import { CompletedHeading, CompletedToggle, DONE_PARAM } from "@/components/completed-toggle";
import { SelectField } from "@/components/controls";
import { PageHeader } from "@/components/page-header";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { RepoBeadDrawer, useRepoDrawer } from "@/components/repo-bead-drawer";
import { ThemeToggle } from "@/components/theme-toggle";
import { beadsKey } from "@/hooks/use-beads";
import { useDefaultPage } from "@/hooks/use-default-view";
import { projectHref } from "@/lib/default-page";
import { useNow } from "@/hooks/use-now";
import { useProjects } from "@/hooks/use-projects";
import { useUrlState } from "@/hooks/use-url-state";
import { useViewerMode } from "@/hooks/use-viewer-mode";
import { api, type BeadsResponse, type ProjectInfo } from "@/lib/api-client";
import { agentByName, type AgentIdentity } from "@/lib/agents";
import { blockingDeps, byClosedAtDesc, completedRecently, isBlocked, makeIndex, relTime } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/** `?repo=` / `?agent=` value meaning "everything" (the param is simply absent). */
const ALL = "";
/** Work still to do, as Focus counts it: closed beads are history, deferred and pinned ones are parked, archived ones are put away. */
const QUEUED_STATUSES = ["open", "in_progress", "hooked", "blocked"];
const isQueued = (b: Bead) => QUEUED_STATUSES.includes(b.status) && !(b.labels ?? []).includes("archived");
/** In flight first, then blocked, then ready. */
const rank = (b: Bead, blocked: boolean) => (b.status === "in_progress" || b.status === "hooked" ? 0 : blocked ? 1 : 2);

type Item = { bead: Bead; blocked: boolean; blockers: string[] };

/**
 * The Agent Queue across every registered repo: each open bead assigned to an agent identity
 * (Settings → Agents), gathered from all projects, with a repo filter and an agent filter. It is the
 * all-repos form of the Agent filter on a project's Focus view. Opening a bead shows its drawer over the page.
 */
export function AllAgentQueueView() {
  const { data: projectData, isLoading: loadingProjects } = useProjects();
  // A folder that lost its .beads cannot be read; the launcher already flags it, so it is left out here.
  const projects = React.useMemo(() => (projectData?.projects ?? []).filter((p) => p.hasBeads), [projectData]);
  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: beadsKey(p.id),
      queryFn: () => api.list(p.id),
      retry: 1,
      refetchInterval: (q: { state: { data?: BeadsResponse } }) => q.state.data?.meta.pollIntervalMs ?? 5000,
    })),
  });
  const { searchParams, updateUrl } = useUrlState();
  // Opening a bead shows its drawer over this page, as the Epics page does.
  const drawer = useRepoDrawer();
  const viewerMode = useViewerMode();
  const readOnly = viewerMode.data?.readOnly ?? true;
  const dataFor = React.useCallback(
    (id: string) => results[projects.findIndex((p) => p.id === id)]?.data,
    [results, projects],
  );

  // Agent identities are one app-wide setting, so any repo's response carries them.
  const identities: AgentIdentity[] = React.useMemo(
    () => results.find((r) => r.data?.meta.agents)?.data?.meta.agents ?? [],
    [results],
  );
  // The filter offers the enabled identities; a switched-off agent's beads still show under All.
  const enabledAgents = identities.filter((a) => a.enabled);

  const requestedRepo = searchParams.get("repo") ?? ALL;
  const requestedAgent = searchParams.get("agent") ?? ALL;
  // An unknown repo or agent (a stale link, a removed project, a switched-off identity) falls back to
  // All rather than an empty page.
  const repo = projects.some((p) => p.id === requestedRepo) ? requestedRepo : ALL;
  const agent = enabledAgents.find((a) => a.id === requestedAgent) ?? null;
  const setParam = (key: "repo" | "agent", next: string) =>
    updateUrl((params) => {
      if (next === ALL) params.delete(key);
      else params.set(key, next);
    });

  // The toggle at the top: also list what agents completed in the last few days (off by default).
  const showDone = searchParams.get(DONE_PARAM) === "1";
  const setShowDone = (next: boolean) =>
    updateUrl((params) => {
      if (next) params.set(DONE_PARAM, "1");
      else params.delete(DONE_PARAM);
    });
  const now = useNow();

  const sections = projects.map((project, i) => {
    const query = results[i];
    const beads = query.data?.beads ?? [];
    const index = makeIndex(beads);
    // This repo's beads that belong to an agent (any identity, so old work keeps its icon).
    const queued: Item[] = beads
      .filter((b) => isQueued(b) && agentByName(identities, b.assignee))
      .map((bead) => ({ bead, blocked: isBlocked(bead, index), blockers: blockingDeps(bead, index) }));
    const items = queued
      .filter((q) => !agent || agentByName([agent], q.bead.assignee)?.id === agent.id)
      .sort(
        (a, b) =>
          rank(a.bead, a.blocked) - rank(b.bead, b.blocked) ||
          a.bead.priority - b.bead.priority ||
          a.bead.id.localeCompare(b.bead.id),
      );
    // Closed in the last few days by (assigned to) an agent, newest first; empty while the toggle is off.
    const done: Bead[] = showDone
      ? beads
          .filter(
            (b) =>
              completedRecently(b, now) &&
              agentByName(identities, b.assignee) &&
              (!agent || agentByName([agent], b.assignee)?.id === agent.id),
          )
          .sort(byClosedAtDesc)
      : [];
    return { project, query, queued, items, done };
  });
  const shown = sections.filter(({ project }) => repo === ALL || project.id === repo);
  const settled = !loadingProjects && shown.every(({ query }) => !query.isLoading);
  const failed = shown.filter(({ query }) => query.isError);
  const total = shown.reduce((sum, s) => sum + s.items.length, 0);
  const doneTotal = shown.reduce((sum, s) => sum + s.done.length, 0);
  const withItems = shown.filter((s) => s.items.length + s.done.length > 0);
  // Counts in the filter labels: per repo for the chosen agent, per agent for the chosen repo.
  const repoCount = (id: string) => sections.find((s) => s.project.id === id)?.items.length ?? 0;
  const agentCount = (a: AgentIdentity) =>
    shown.reduce((sum, s) => sum + s.queued.filter((q) => agentByName([a], q.bead.assignee)?.id === a.id).length, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground text-body">
      <ReadOnlyBanner />
      <PageHeader
        title="Agent Queue"
        standalone
        subtitle={
          !settled
            ? "Loading…"
            : (total === 0 ? "nothing queued" : `${total} queued for agents`) +
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
          </>
        }
        center={
          // Both dropdowns sit together, the pair centred in the bar. On phones they share the row, each taking half; on desktop their width is capped so a long repo name cannot squeeze the Completed and theme buttons at the right.
          <div className="flex min-w-0 items-center justify-center gap-2 max-md:w-full md:gap-3">
            {/* No visible labels: the first options ("All repos", "All agents") say what the dropdowns are, and a label would push the pair off the centre. */}
            <SelectField
              size="sm"
              className="min-w-0 max-w-full max-md:flex-1 max-md:basis-0 md:max-w-[10.5rem] lg:max-w-[16rem]"
              aria-label="Filter by repo"
              value={repo}
              onChange={(e) => setParam("repo", e.target.value)}
            >
              <option value={ALL}>All repos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {repoCount(p.id) > 0 ? ` (${repoCount(p.id)})` : ""}
                </option>
              ))}
            </SelectField>
            <SelectField
              size="sm"
              className="min-w-0 max-w-full max-md:flex-1 max-md:basis-0 md:max-w-[10.5rem] lg:max-w-[16rem]"
              aria-label="Filter by agent"
              value={agent?.id ?? ALL}
              onChange={(e) => setParam("agent", e.target.value)}
            >
              <option value={ALL}>All agents</option>
              {enabledAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {agentCount(a) > 0 ? ` (${agentCount(a)})` : ""}
                </option>
              ))}
            </SelectField>
          </div>
        }
        extra={<CompletedToggle on={showDone} onChange={setShowDone} />}
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
                Couldn’t read {project.name}, so anything queued there is not listed.
              </p>
            ))}
            {total === 0 && doneTotal === 0 ? (
              <div className="p-10 text-center text-body text-[var(--text-3)]">
                {failed.length > 0 ? "Nothing queued in the repos that could be read" : "Nothing is queued for an agent"}
                {failed.length > 0 ? "" : repo === ALL ? " in any repo" : " in this repo"}
                {agent ? ` for ${agent.name}` : ""}. Assign a bead to an agent (Settings → Agents lists the names) and it
                shows up here.
              </div>
            ) : (
              withItems.map(({ project, items, done }) => (
                <RepoSection
                  key={project.id}
                  project={project}
                  items={items}
                  done={done}
                  agents={identities}
                  showHeading={repo === ALL}
                  onOpen={drawer.openBead}
                />
              ))
            )}
          </div>
        )}
      </div>
      <RepoBeadDrawer drawer={drawer} dataFor={dataFor} readOnly={readOnly} />
    </div>
  );
}

/** One repo's queued beads. */
function RepoSection({
  project,
  items,
  done,
  agents,
  showHeading,
  onOpen,
}: {
  project: ProjectInfo;
  items: Item[];
  /** Beads completed in the last few days; empty unless the page's toggle is on. */
  done: Bead[];
  agents: AgentIdentity[];
  showHeading: boolean;
  onOpen: (projectId: string, id: string) => void;
}) {
  const { page } = useDefaultPage();
  return (
    <section data-repo-section={project.id} aria-label={project.name} className="flex flex-col gap-3">
      {showHeading && (
        <h2 className="flex items-baseline gap-2 text-body font-semibold text-[var(--text)]">
          <Link href={projectHref(project.id, page)} className="hover:underline">
            {project.name}
          </Link>
          <span className="text-meta font-normal text-[var(--text-3)]">
            {items.length} queued
            {done.length > 0 ? ` · ${done.length} completed` : ""}
          </span>
        </h2>
      )}
      {items.map((item) => (
        <QueueCard key={item.bead.id} projectId={project.id} item={item} agents={agents} onOpen={onOpen} />
      ))}
      {done.length > 0 && (
        <>
          <CompletedHeading level={showHeading ? 3 : 2} />
          {done.map((bead) => (
            <QueueCard
              key={bead.id}
              projectId={project.id}
              item={{ bead, blocked: false, blockers: [] }}
              agents={agents}
              onOpen={onOpen}
              completed
            />
          ))}
        </>
      )}
    </section>
  );
}

function QueueCard({
  projectId,
  item,
  agents,
  onOpen,
  completed = false,
}: {
  projectId: string;
  item: Item;
  agents: AgentIdentity[];
  onOpen: (projectId: string, id: string) => void;
  /** A bead closed in the last few days: says when it was closed rather than when it was last touched. */
  completed?: boolean;
}) {
  const { bead, blocked, blockers } = item;
  const agent = agentByName(agents, bead.assignee);
  const open = () => onOpen(projectId, bead.id);
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={bead.title}
      data-keyboard-bead-id={bead.id}
      data-agent={agent?.id}
      data-completed-card={completed ? "" : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      onClick={open}
      className="cursor-pointer rounded-[11px] border border-border bg-[var(--surface)] p-[10px_12px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30"
    >
      <div className="mb-[5px] flex items-center gap-[7px]">
        <span className="font-mono text-meta text-[var(--text-3)]">{bead.id}</span>
        <StatusChip status={blocked && bead.status === "open" ? "blocked" : bead.status} />
        <span className="flex-1" />
        <PriorityChip p={bead.priority} />
      </div>
      <div className="text-label font-medium leading-[1.35] text-[var(--text)] [text-wrap:pretty]">{bead.title}</div>
      <div className="mt-[6px] flex flex-wrap items-center gap-x-[8px] gap-y-1 text-meta text-[var(--text-3)]">
        {agent && (
          <span className="inline-flex items-center gap-[5px]">
            <AgentIcon agent={agent} size={14} />
            {agent.name}
          </span>
        )}
        <span>
          {completed ? "closed " : ""}
          {relTime(completed ? (bead.closed_at ?? bead.updated_at) : bead.updated_at)}
        </span>
        {blockers.length > 0 && (
          <span className="truncate font-mono" title={`blocked by ${blockers.join(", ")}`}>
            ⛔ {blockers.join(", ")}
          </span>
        )}
      </div>
    </article>
  );
}
