"use client";
import * as React from "react";

/** The current time in ms, read once on mount and refreshed every `everyMs`, so a page left open keeps its time windows honest. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
