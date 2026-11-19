"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { beadsKey, activityKey } from "@/hooks/use-beads";

/**
 * Subscribe to the server's SSE change stream for a project and refetch the
 * beads query whenever the project's `.beads/` directory mutates. This is the
 * fast path; `useBeads`'s interval is just a fallback.
 *
 * Returns whether the stream is currently connected (for an optional "Live"
 * indicator). The demo project has no filesystem to watch, so it never connects.
 */
export function useBeadsStream(projectId: string): { live: boolean } {
  const qc = useQueryClient();
  const [live, setLive] = React.useState(false);

  React.useEffect(() => {
    if (projectId === "demo") return; // demo has no .beads to watch

    const es = new EventSource(
      `/api/p/${encodeURIComponent(projectId)}/beads/stream`,
    );
    es.addEventListener("open", () => setLive(true));
    es.addEventListener("error", () => setLive(false)); // EventSource auto-reconnects
    es.addEventListener("change", () => {
      qc.invalidateQueries({ queryKey: beadsKey(projectId) });
      qc.invalidateQueries({ queryKey: activityKey(projectId) });
    });

    return () => {
      setLive(false);
      es.close();
    };
  }, [projectId, qc]);

  return { live };
}

/**
 * Browsers allow about six connections per host over plain HTTP/1.1, and every open stream holds
 * one, so an all-repos page streams only this many repos and leaves room for ordinary requests.
 */
export const MAX_PAGE_STREAMS = 4;

/**
 * Like `useBeadsStream`, for a page that shows several projects at once: refetch each project's
 * beads query when its `.beads/` changes. Only the first `max` projects are streamed; the rest
 * keep to their polling interval.
 */
export function useBeadsStreams(projectIds: string[], max: number = MAX_PAGE_STREAMS): void {
  const qc = useQueryClient();
  // A stable key, so a new array with the same ids does not reopen the connections.
  const key = projectIds.filter((id) => id !== "demo").slice(0, max).join("\n");

  React.useEffect(() => {
    if (!key) return;
    const sources = key.split("\n").map((projectId) => {
      const es = new EventSource(`/api/p/${encodeURIComponent(projectId)}/beads/stream`);
      es.addEventListener("change", () => {
        qc.invalidateQueries({ queryKey: beadsKey(projectId) });
        qc.invalidateQueries({ queryKey: activityKey(projectId) });
      });
      return es;
    });
    return () => sources.forEach((es) => es.close());
  }, [key, qc]);
}
