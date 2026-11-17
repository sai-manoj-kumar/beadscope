"use client";
import { APP_VERSION, BUILD_NUMBER, BUILD_SHA, commitUrl } from "@/lib/build-info";

/**
 * Build indicator for the sidebar footer: "Build <n> · <sha>". The number is the
 * git commit count and the hash links to that commit's comments on GitHub, so a
 * user can report exactly which build they're on. Always includes the app version;
 * Git metadata is optional for packaged installations. See bead wxu.
 */
export function BuildBadge() {
  return (
    <div className="flex items-center gap-1 px-1 text-meta leading-none text-[var(--text-3)] max-md:min-h-11">
      <span>v{APP_VERSION}</span>
      {BUILD_SHA && <><span>
        Build {BUILD_NUMBER || "—"} <span className="text-[var(--text-3)]">·</span>
      </span>
      <a
        href={commitUrl(BUILD_SHA)}
        target="_blank"
        rel="noopener noreferrer"
        title="View this commit’s comments on GitHub"
        className="flex items-center font-mono text-[var(--text-3)] underline-offset-2 hover:text-[var(--text)] hover:underline max-md:min-h-11 max-md:min-w-11"
      >
        {BUILD_SHA}
      </a></>}
    </div>
  );
}
