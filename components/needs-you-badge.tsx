"use client";
import { useNeedsYouTotal } from "@/hooks/use-all-repo-beads";

/** The number of items waiting on you across all repos, on a link to /needs-you. Nothing when zero. */
export function NeedsYouBadge() {
  const total = useNeedsYouTotal();
  if (total === 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        data-needs-you-total
        className="min-w-[18px] rounded-full px-[6px] py-px text-center text-meta font-semibold text-white"
        style={{ background: "var(--brand-solid)" }}
      >
        {total}
      </span>
      <span className="sr-only">, {total} waiting</span>
    </>
  );
}
