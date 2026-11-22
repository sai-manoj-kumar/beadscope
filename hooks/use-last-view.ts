"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { isDesktopOnly, isView, type View } from "@/lib/views";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useDefaultPage } from "@/hooks/use-default-view";
import { AGENT_QUEUE_PATH, DEFAULT_PAGE, defaultPageView } from "@/lib/default-page";
import { useUrlState } from "@/hooks/use-url-state";

/**
 * Explicit view links win; ordinary project links use the user's default page. The third value is
 * true while a project link is being sent to the Agent Queue page (a default page that is not a
 * view of the project), so the caller can skip drawing a view that is about to go away.
 */
export function useLastView(): [View, (v: View) => void, boolean] {
  const { page } = useDefaultPage();
  const { searchParams, updateUrl } = useUrlState();
  const router = useRouter();
  const requested = searchParams.get("view");
  const mobile = useIsMobile();
  const fallback: View = defaultPageView(page) ?? defaultPageView(DEFAULT_PAGE) ?? "epics";
  // A phone has no layout for desktop-only views (Graph). A link, saved view or shortcut that
  // asks for one lands on the default view instead, and so does a window resized across the
  // breakpoint while on it.
  const view = isView(requested) && !(mobile && isDesktopOnly(requested)) ? requested : fallback;
  // A link that names a view or a bead is a request for that project; only a bare project link
  // follows the default page out of the project.
  const toAgentQueue = page === "agent-queue" && requested === null && !searchParams.has("bead");
  React.useEffect(() => {
    if (toAgentQueue) router.replace(AGENT_QUEUE_PATH);
  }, [toAgentQueue, router]);
  const setView = React.useCallback((next: View) => {
    updateUrl(params => params.set("view", next));
  }, [updateUrl]);
  return [view, setView, toAgentQueue];
}
