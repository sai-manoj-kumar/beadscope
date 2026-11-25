"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useUpdateCheck } from "@/hooks/use-update-check";
import { api } from "@/lib/api-client";
import type { UpdateStatus } from "@/lib/update-types";
import { commitUrl } from "@/lib/build-info";
import { BrandButton } from "@/components/brand-button";
import { Button } from "@/components/controls";

export function UpdateIndicator() {
  const { data } = useUpdateCheck();
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<UpdateStatus | null>(null);
  const run = useMutation({
    mutationFn: () => {
      if (!selected?.target) throw new Error("Check for updates again.");
      return api.selfUpdate.run(selected.target);
    },
    onSuccess: () => {
      if (selected) qc.setQueryData<UpdateStatus>(["update-check", selected.channel], prev => prev ? { ...prev, updateAvailable: false } : prev);
    },
  });
  // After a restart the open page still runs the old code: reload once the server answers again.
  const restarting = !!run.data?.restarting;
  React.useEffect(() => {
    if (!restarting) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { if ((await fetch("/api/telemetry", { cache: "no-store" })).ok) { window.location.reload(); return; } } catch { /* still down */ }
      if (!stopped) timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [restarting]);
  if (!data?.updateAvailable && !selected) return null;
  const label = data?.channel === "stable" ? `Version ${data.latestVersion} available` : "Development update available";
  return <>
    {data?.updateAvailable && <Button size="sm" icon="rocket" onClick={() => { run.reset(); setSelected(data); }}
      className="border-[var(--brand)] bg-[var(--brand-weak)] font-semibold text-[var(--brand)] hover:bg-[var(--brand-weak)]">
      {label}
    </Button>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !run.isPending) setSelected(null); }}>
      {selected && <DialogContent className="max-w-[480px]">
        <DialogTitle>{selected.channel === "stable" ? `Version ${selected.latestVersion} available` : "Development update available"}</DialogTitle>
        <DialogDescription>
          {selected.channel === "stable" ? `You are running version ${selected.currentVersion}. This update installs version ${selected.latestVersion}.` :
            `There are ${selected.behind} newer commits on main. This update installs the selected development build.`}
        </DialogDescription>
        <a href={selected.releaseUrl || commitUrl(selected.remoteSha)} target="_blank" rel="noopener noreferrer"
          className="text-body text-[var(--brand)] underline">
          {selected.channel === "stable" ? "Release notes and update instructions" : "View selected development build"}
        </a>
        {!selected.canUpdate && <p className="text-body leading-relaxed">{selected.manualReason || "Follow the release instructions to update this installation."}</p>}
        {selected.canUpdate && !run.data && <p className="text-label leading-relaxed text-[var(--text-3)]">
          {selected.installKind === "npm" ? `Update now runs npm install -g beadscope@${selected.latestVersion} for you, in the folder this copy is installed in.`
            : "Update now installs the selected source version, restores its dependencies, and builds the app."}
          {selected.supervised ? " The server then restarts automatically." : " Restart the server manually afterward to load the new version."}
        </p>}
        {run.isError && <p role="alert" className="rounded-lg border border-red-400 p-3 text-label">{run.error.message}</p>}
        {run.data && <div className="space-y-2 text-label">
          {run.data.steps.map(step => <div key={step.name}>✓ {step.name}</div>)}
          <p>{run.data.restarting ? "The server is restarting. This page will reconnect shortly." : "Update built successfully. Restart the server to load the new version."}</p>
        </div>}
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" disabled={run.isPending} onClick={() => setSelected(null)}>{run.data ? "Close" : "Not now"}</Button>
          {selected.canUpdate && selected.target && !run.data && <BrandButton size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Updating…" : "Update now"}
          </BrandButton>}
        </div>
      </DialogContent>}
    </Dialog>
  </>;
}
