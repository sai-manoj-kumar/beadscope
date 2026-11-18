import type { Metadata } from "next";
import * as React from "react";
import { AllAgentQueueView } from "@/components/all-agent-queue-view";
import { projectTitle } from "@/lib/app-title";

export const metadata: Metadata = { title: projectTitle("Agent Queue") };

export default function AgentQueuePage() {
  // The repo and agent filters live in the URL (?repo=, ?agent=), which reads useSearchParams.
  return (
    <React.Suspense fallback={null}>
      <AllAgentQueueView />
    </React.Suspense>
  );
}
