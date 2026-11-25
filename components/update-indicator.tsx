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
  // When the server's updater does the install, this server is stopped a moment after the click. Until it has been
  // seen going away, an answer is the old version still running, not the new one: do not reload into it.
  const restarting = !!run.data?.restarting;
  const queued = !!run.data?.queued;
  const [stalled, setStalled] = React.useState(false);
  React.useEffect(() => {
    if (!restarting) return;
    let stopped = false;
    let sawDown = !queued;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if ((await fetch("/api/telemetry", { cache: "no-store" })).ok) { if (sawDown) { window.location.reload(); return; } }
        else sawDown = true;
      } catch { sawDown = true; }
      if (!sawDown && Date.now() - started > 60_000) setStalled(true);
      if (!stopped) timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [restarting, queued]);
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
          {selected.installKind === "npm" && selected.viaUpdater ? `Update now asks this server's updater to install beadscope@${selected.latestVersion}. Beadscope is unavailable for a few minutes while it installs.`
            : selected.installKind === "npm" ? `Update now runs npm install -g beadscope@${selected.latestVersion} for you, in the folder this copy is installed in.`
            : "Update now installs the selected source version, restores its dependencies, and builds the app."}
          {selected.supervised ? " The server then restarts automatically." : " Restart the server manually afterward to load the new version."}
        </p>}
        {selected.updaterError && !run.data && <p role="alert" className="rounded-lg border border-red-400 p-3 text-label">{selected.updaterError}</p>}
        {run.isError && <p role="alert" className="rounded-lg border border-red-400 p-3 text-label">{run.error.message}</p>}
        {run.data && <div className="space-y-2 text-label">
          {run.data.steps.map(step => <div key={step.name}>✓ {step.name}</div>)}
          <p>{queued ? "The updater is installing the new version. Beadscope is unavailable for a few minutes; this page reloads when it is back." : run.data.restarting ? "The server is restarting. This page will reconnect shortly." : "Update built successfully. Restart the server to load the new version."}</p>
          {stalled && <p role="alert" className="rounded-lg border border-red-400 p-3">The updater has not started. On the server, check <code className="font-mono">systemctl status beadscope-updater.path</code>.</p>}
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
