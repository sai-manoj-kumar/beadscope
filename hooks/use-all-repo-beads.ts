"use client";
import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { beadsKey } from "@/hooks/use-beads";
import { useProjects } from "@/hooks/use-projects";
import { api, type BeadsResponse, type ProjectInfo } from "@/lib/api-client";
import { countNeedsYou } from "@/lib/beads-view";

/**
 * The bead list of every registered repo that has a `.beads` folder (a folder that lost it cannot be
 * read, and the launcher already flags it). The query is the one the project view uses, so every
 * screen shares one cache, and a repo's change stream (see `useBeadsStreams`) refreshes all of them.
 */
export function useAllRepoBeads() {
  const { data, isLoading: loadingProjects } = useProjects();
  const projects: ProjectInfo[] = React.useMemo(() => (data?.projects ?? []).filter((p) => p.hasBeads), [data]);
  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: beadsKey(p.id),
      queryFn: () => api.list(p.id),
      retry: 1,
      refetchInterval: (q: { state: { data?: BeadsResponse } }) => q.state.data?.meta.pollIntervalMs ?? 5000,
    })),
  });
  return { projects, results, loadingProjects };
}

/**
 * Items waiting on you across all repos (the number on the Needs You links in the launcher and the
 * sidebar). A repo that cannot be read counts as zero; the Needs You page itself reports it.
 */
export function useNeedsYouTotal(): number {
  const { results } = useAllRepoBeads();
  return results.reduce((sum, q) => sum + (q.data ? countNeedsYou(q.data.beads) : 0), 0);
}
