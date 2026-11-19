"use client";
import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { beadsKey } from "@/hooks/use-beads";
import { useProjects } from "@/hooks/use-projects";
import { api, type BeadsResponse, type ProjectInfo } from "@/lib/api-client";
import { countNeedsYou } from "@/lib/beads-view";

/** How often a repo whose list keeps failing is asked again (a healthy repo uses the server's interval). */
const FAILING_POLL_MS = 60_000;

/**
 * The bead list of every registered repo that has a `.beads` folder (a folder that lost it cannot be
 * read, and the launcher already flags it). The query is the one the project view uses, so every
 * screen shares one cache, and a repo's change stream (see `useBeadsStreams`) refreshes all of them.
 *
 * The built-in Demo project is left out while real repos exist: its sample beads would put waiting
 * items on every install that has nothing waiting, and the badge, the page count and the page list
 * must agree. When Demo is the only project it stays, so the page is not empty.
 */
export function useAllRepoBeads() {
  const { data, isLoading: loadingProjects } = useProjects();
  const projects: ProjectInfo[] = React.useMemo(() => {
    const all = data?.projects ?? [];
    const readable = all.filter((p) => p.hasBeads);
    // Demo stays only when it is the only registered project (not when the real ones are unreadable).
    return all.some((p) => p.id !== "demo") ? readable.filter((p) => p.id !== "demo") : readable;
  }, [data]);
  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: beadsKey(p.id),
      queryFn: () => api.list(p.id),
      retry: 1,
      refetchInterval: (q: { state: { data?: BeadsResponse; status: string } }) =>
        q.state.status === "error" ? FAILING_POLL_MS : (q.state.data?.meta.pollIntervalMs ?? 5000),
    })),
  });
  return { projects, results, loadingProjects };
}

/**
 * Items waiting on you across all repos (the number on the Needs You links in the launcher and the
 * sidebar). A repo that cannot be read counts as zero; the Needs You page itself reports it. The
 * built-in Demo project is never counted, even when it is the only project: a number on a fresh
 * install that has nothing waiting would be wrong.
 */
export function useNeedsYouTotal(): number {
  const { projects, results } = useAllRepoBeads();
  return results.reduce(
    (sum, q, i) => sum + (q.data && projects[i].id !== "demo" ? countNeedsYou(q.data.beads) : 0),
    0,
  );
}
