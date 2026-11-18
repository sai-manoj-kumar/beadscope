"use client";
import * as React from "react";
import { isDesktopOnly, isView, type View } from "@/lib/views";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useDefaultFocus } from "@/hooks/use-default-view";
import { useUrlState } from "@/hooks/use-url-state";

/** Explicit view links win; ordinary project links use the user's default. */
export function useLastView(): [View, (v: View) => void] {
  const { enabled } = useDefaultFocus();
  const { searchParams, updateUrl } = useUrlState();
  const requested = searchParams.get("view");
  const mobile = useIsMobile();
  const fallback: View = enabled ? "focus" : "board";
  // A phone has no layout for desktop-only views (Graph). A link, saved view or shortcut that
  // asks for one lands on the default view instead, and so does a window resized across the
  // breakpoint while on it.
  const view = isView(requested) && !(mobile && isDesktopOnly(requested)) ? requested : fallback;
  const setView = React.useCallback((next: View) => {
    updateUrl(params => params.set("view", next));
  }, [updateUrl]);
  return [view, setView];
}
