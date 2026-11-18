import type { Metadata } from "next";
import * as React from "react";
import { AllNeedsYouView } from "@/components/all-needs-you-view";
import { projectTitle } from "@/lib/app-title";

export const metadata: Metadata = { title: projectTitle("Needs You") };

export default function NeedsYouPage() {
  // The repo filter lives in the URL (?repo=), which reads useSearchParams.
  return (
    <React.Suspense fallback={null}>
      <AllNeedsYouView />
    </React.Suspense>
  );
}
