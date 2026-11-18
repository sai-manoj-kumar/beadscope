"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AgentIcon } from "@/components/agent-icon";
import { PriorityChip } from "@/components/board/bead-card";
import { StatusChip } from "@/components/chip";
import { SelectField } from "@/components/controls";
import { PageHeader } from "@/components/page-header";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { beadsKey } from "@/hooks/use-beads";
import { useProjects } from "@/hooks/use-projects";
import { useUrlState } from "@/hooks/use-url-state";
import { api, type BeadsResponse, type ProjectInfo } from "@/lib/api-client";
import { agentByName, type AgentIdentity } from "@/lib/agents";
import { blockingDeps, isBlocked, makeIndex, relTime } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/** `?repo=` / `?agent=` value meaning "everything" (the param is simply absent). */
const ALL = "";
/** Work still to do: closed beads are history, deferred ones are parked, archived ones are put away. */
const isQueued = (b: Bead) => b.status !== "closed" && b.status !== "deferred" && !(b.labels ?? []).includes("archived");
/** In flight first, then blocked, then ready. */
const rank = (b: Bead, blocked: boolean) => (b.status === "in_progress" || b.status === "hooked" ? 0 : blocked ? 1 : 2);

type Item = { bead: Bead; blocked: boolean; blockers: string[] };

/**
 * The Agent Queue across every registered repo: each open bead assigned to an agent identity
 * (Settings → Agents), gathered from all projects, with a repo filter and an agent filter. It is the
 * all-repos form of the Agent filter on a project's Focus view. Opening a bead goes to its repo.
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
    return { project, query, queued, items };
  });
  const shown = sections.filter(({ project }) => repo === ALL || project.id === repo);
  const settled = !loadingProjects && shown.every(({ query }) => !query.isLoading);
  const failed = shown.filter(({ query }) => query.isError);
  const total = shown.reduce((sum, s) => sum + s.items.length, 0);
  const withItems = shown.filter((s) => s.items.length > 0);
  // Counts in the filter labels: per repo for the chosen agent, per agent for the chosen repo.
  const repoCount = (id: string) => sections.find((s) => s.project.id === id)?.items.length ?? 0;
  const agentCount = (a: AgentIdentity) =>
    shown.reduce((sum, s) => sum + s.queued.filter((q) => agentByName([a], q.bead.assignee)?.id === a.id).length, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground text-body">
      <ReadOnlyBanner />
      <PageHeader
        title="Agent Queue"
        subtitle={
          !settled
            ? "Loading…"
            : total === 0
              ? "nothing queued"
              : `${total} queued for agents · ${repo === ALL ? "all repos" : "1 repo"}`
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
            <label className="flex min-w-0 items-center gap-2 text-label text-[var(--text-3)]">
              Repo
              <SelectField
                size="sm"
                className="min-w-0 max-w-full"
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
            </label>
            <label className="flex min-w-0 items-center gap-2 text-label text-[var(--text-3)]">
              Agent
              <SelectField
                size="sm"
                className="min-w-0 max-w-full"
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
                Couldn’t read {project.name}, so anything queued there is not listed.
              </p>
            ))}
            {total === 0 ? (
              <div className="p-10 text-center text-body text-[var(--text-3)]">
                {failed.length > 0 ? "Nothing queued in the repos that could be read" : "Nothing is queued for an agent"}
                {failed.length > 0 ? "" : repo === ALL ? " in any repo" : " in this repo"}
                {agent ? ` for ${agent.name}` : ""}. Assign a bead to an agent (Settings → Agents lists the names) and it
                shows up here.
              </div>
            ) : (
              withItems.map(({ project, items }) => (
                <RepoSection
                  key={project.id}
                  project={project}
                  items={items}
                  agents={identities}
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

/** One repo's queued beads. */
function RepoSection({
  project,
  items,
  agents,
  showHeading,
}: {
  project: ProjectInfo;
  items: Item[];
  agents: AgentIdentity[];
  showHeading: boolean;
}) {
  return (
    <section data-repo-section={project.id} aria-label={project.name} className="flex flex-col gap-3">
      {showHeading && (
        <h2 className="flex items-baseline gap-2 text-body font-semibold text-[var(--text)]">
          <Link href={`/p/${encodeURIComponent(project.id)}`} className="hover:underline">
            {project.name}
          </Link>
          <span className="text-meta font-normal text-[var(--text-3)]">{items.length} queued</span>
        </h2>
      )}
      {items.map((item) => (
        <QueueCard key={item.bead.id} projectId={project.id} item={item} agents={agents} />
      ))}
    </section>
  );
}

function QueueCard({ projectId, item, agents }: { projectId: string; item: Item; agents: AgentIdentity[] }) {
  const router = useRouter();
  const { bead, blocked, blockers } = item;
  const agent = agentByName(agents, bead.assignee);
  // Opening a bead leaves this page for the repo, where the drawer opens on it.
  const open = () => router.push(`/p/${encodeURIComponent(projectId)}?bead=${encodeURIComponent(bead.id)}`);
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={bead.title}
      data-keyboard-bead-id={bead.id}
      data-agent={agent?.id}
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
        <span>{relTime(bead.updated_at)}</span>
        {blockers.length > 0 && (
          <span className="truncate font-mono" title={`blocked by ${blockers.join(", ")}`}>
            ⛔ {blockers.join(", ")}
          </span>
        )}
      </div>
    </article>
  );
}
