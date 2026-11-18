"use client";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SettingRow, ToggleButton } from "@/components/settings-card";

type Settings = { enabled: boolean; configured: boolean };

/** Visible app use only; background tabs and an idle server don't generate daily activity. */
export function UsageActivity() {
  useEffect(() => {
    let lastPing = 0;
    function ping() {
      if (document.visibilityState !== "visible" || Date.now() - lastPing < 60_000) return;
      lastPing = Date.now();
      void fetch("/api/telemetry", { method: "POST" }).catch(() => {});
    }
    ping();
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("pointerdown", ping);
    window.addEventListener("keydown", ping);
    return () => {
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("pointerdown", ping);
      window.removeEventListener("keydown", ping);
    };
  }, []);
  return null;
}

export function UsageStatisticsSetting() {
  const client = useQueryClient();
  const query = useQuery<Settings>({
    queryKey: ["usage-statistics"],
    queryFn: async () => {
      const res = await fetch("/api/telemetry");
      if (!res.ok) throw new Error("Could not load usage preference.");
      return res.json();
    },
  });
  const save = useMutation({
    mutationFn: async (enabled: boolean): Promise<Settings> => {
      const res = await fetch("/api/telemetry", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Could not save usage preference. Please try again.");
      return res.json();
    },
    onSuccess: (settings) => {
      client.setQueryData(["usage-statistics"], settings);
      toast.success("Usage preference saved");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <SettingRow
      titleId="usage-label"
      descriptionId="usage-description"
      title="Share basic usage statistics"
      description={<>
          Reports one daily activity event with a random installation ID and app version to PostHog
          in the US while you use the app. Failed deliveries may retry. No bead content, project paths,
          names, emails, or session recordings.
          Enabled by default. Turning this off stops future events for all projects and browsers
          using this installation, including after restarting.
      </>}
      control={
      <ToggleButton on={query.data?.enabled ?? false} role="switch" aria-checked={query.data?.enabled ?? false}
        aria-labelledby="usage-label" aria-describedby="usage-description"
        disabled={!query.data || save.isPending}
        onClick={() => save.mutate(!query.data?.enabled)}>
        {!query.data ? "Loading…" : save.isPending ? "Saving…" : query.data.enabled ? "Enabled" : "Disabled"}
      </ToggleButton>
      }
    >
        {query.data && !query.data.configured && <p className="mt-2 text-meta text-[var(--text-3)]">Usage reporting is not configured for this installation. No events are sent.</p>}
        {query.isError && <p role="alert" className="text-label">Could not load usage preference. <button className="tap-target" onClick={() => void query.refetch()}>Retry</button></p>}
    </SettingRow>
  );
}
