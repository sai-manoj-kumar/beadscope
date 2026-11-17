"use client";
import * as React from "react";
import { MOBILE_QUERY } from "@/lib/breakpoints";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True at phone width. The server and the first client render say false, so desktop
 * markup is what hydrates; phones switch right after. Prefer CSS (`md:`) where
 * only styling changes; use this when behaviour changes (no drag, hidden views).
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
