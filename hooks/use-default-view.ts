"use client";
import * as React from "react";
import { DEFAULT_PAGE, isDefaultPage, type DefaultPage } from "@/lib/default-page";

const KEY = "beadscope.default-page";
const EVENT = "beadscope:default-view";
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function snapshot(): DefaultPage {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return isDefaultPage(value) ? value : DEFAULT_PAGE;
  } catch { return DEFAULT_PAGE; }
}
function save(page: DefaultPage) {
  // Let the caller report storage failures instead of pretending it was saved.
  localStorage.setItem(KEY, page);
  window.dispatchEvent(new Event(EVENT));
}

/** Which page a project opens on when the link names no view. A preference for this browser, shared across projects. */
export function useDefaultPage() {
  const page = React.useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PAGE);
  return { page, save };
}
