"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { readableColor } from "@/components/chip";
import { useTheme } from "@/components/theme-provider";
import { SYSTEM_CHOICE, THEMES } from "@/lib/themes";
import { useApp } from "@/components/app-context";
import { api, type DoctorResponse } from "@/lib/api-client";
import { useNotificationPrefs, type NotifPrefs } from "@/hooks/use-notifications";
import { useBoardPrefs } from "@/hooks/use-board-prefs";
import { useDefaultFocus } from "@/hooks/use-default-view";
import { ViewerModeSetting } from "@/components/read-only-banner";
import { KEYBOARD_SHORTCUT_GROUPS, isSubmitKey } from "@/lib/keyboard-shortcuts";
import { KeyboardHelpDialog, ShortcutKeys } from "@/components/keyboard-help-dialog";

import { UsageStatisticsSetting } from "@/components/usage-statistics";
import { Card, SettingRow, ToggleButton } from "@/components/settings-card";
import { PageHeader } from "@/components/page-header";
import { BrandButton } from "@/components/brand-button";
import { Button, CheckInput, LinkButton, SelectField, Segmented, TextInput } from "@/components/controls";
import { AgentsSettings } from "@/components/agents-settings";


export function SettingsView() {
  const { projectId } = useApp();
  const { data } = useQuery({
    queryKey: ["doctor", projectId],
    queryFn: () => api.doctor(projectId),
  });
  const key = data?.config
    ? `${data.repoPath}|${data.config.humanActor}|${data.config.humanAllowlist.join(",")}`
    : "loading";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Settings" subtitle="Local config · stored under the OS config dir, not in beads" />
      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[24px_22px] max-md:p-4">
        <div className="mx-auto mb-[18px] flex max-w-[620px] flex-col gap-[18px]"><ViewerModeSetting /><DefaultViewSetting /><Card title="Usage statistics"><UsageStatisticsSetting /></Card></div>
        {data ? (
          <SettingsForm key={key} data={data} />
        ) : (
          <div className="text-body text-[var(--text-3)]">Loading…</div>
        )}
      </div>
    </div>
  );
}

function DefaultViewSetting() {
  const { enabled, save } = useDefaultFocus();
  return (
    <Card title="Default view">
      <SettingRow
        titleId="default-focus-label"
        descriptionId="default-focus-description"
        title="Use Focus as the default view"
        description="Off opens projects in Board. Turn on to open in Focus instead, showing current work, blockers, and high-priority next steps. Links to a specific view open that view, including on reload. Switching views does not change this setting. Saved automatically for all projects in this browser."
        control={
          <ToggleButton
            on={enabled}
            onText="On"
            offText="Off"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="default-focus-label"
            aria-describedby="default-focus-description"
            onClick={() => {
              try { save(!enabled); }
              catch { toast.error("Could not save the default view. Browser storage may be unavailable."); }
            }}
          />
        }
      />
    </Card>
  );
}

function SettingsForm({ data }: { data: DoctorResponse }) {
  const { theme, choice, setTheme } = useTheme();
  const qc = useQueryClient();
  const [actor, setActor] = React.useState(data.config.humanActor);
  const [allowlist, setAllowlist] = React.useState<string[]>(data.config.humanAllowlist);
  const [newName, setNewName] = React.useState("");
  // Fallback poll interval, edited in seconds. Clamped to the config API's
  // accepted range (1–300s = 1000–300000ms) before saving; falls back to the
  // current value when the field is left blank or non-numeric.
  const [pollSec, setPollSec] = React.useState(String(Math.round(data.config.pollIntervalMs / 1000)));
  const clampSec = (s: string) => {
    const n = Math.round(Number(s));
    return Number.isFinite(n) && n > 0
      ? Math.min(300, Math.max(1, n))
      : Math.round(data.config.pollIntervalMs / 1000);
  };

  const save = useMutation({
    mutationFn: () =>
      api.saveConfig({
        humanActor: actor,
        humanAllowlist: allowlist,
        pollIntervalMs: clampSec(pollSec) * 1000,
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      // Re-fetch beads so useBeads picks up the new meta.pollIntervalMs and
      // reschedules its fallback poll immediately (TanStack re-reads the
      // functional refetchInterval after each fetch).
      qc.invalidateQueries({ queryKey: ["doctor"] });
      qc.invalidateQueries({ queryKey: ["beads"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const saveOnSubmitKey = (e: React.KeyboardEvent) => {
    if (!isSubmitKey(e)) return;
    e.preventDefault();
    if (!save.isPending) save.mutate();
  };

  const isDemo = data.kind === "demo";

  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-[18px]">
      <Card title="Project">
        <div className="flex flex-col gap-[6px]">
          <span className="text-label text-[var(--text-2)]">{data.project?.name ?? "—"}</span>
          <span className="break-all font-mono text-label text-[var(--text-3)]">
            {isDemo ? "built-in sample data (no path)" : data.repoPath}
          </span>
        </div>
        <div className="flex items-center gap-2 text-label text-[var(--text-2)]">
          <Icon
            name={data.ok ? "check" : "x"}
            size={14}
            style={{ color: readableColor(data.ok ? "#22c55e" : "#ef4444") }}
          />
          <span>
            {isDemo
              ? "Demo mode — in-memory sample data. Add a real project to manage live beads."
              : `${data.message}${data.version ? ` · ${data.version}` : ""}`}
          </span>
        </div>
        <div className="text-meta text-[var(--text-3)]">
          Use the project menu on desktop or open the mobile Menu to switch projects.
        </div>
      </Card>

      <Card title="Attribution">
        <label className="flex flex-col gap-[6px]">
          <span className="text-label text-[var(--text-2)]">
            Human actor (stamps <span className="font-mono">BEADS_ACTOR</span>)
          </span>
          <TextInput
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            onKeyDown={saveOnSubmitKey}
          />
        </label>
        <div className="flex flex-col gap-[7px]">
          <span className="text-label text-[var(--text-2)]">
            Human allowlist · others render as agent
          </span>
          <div className="flex flex-wrap gap-[7px]">
            {allowlist.map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-[6px] rounded-lg border border-border bg-[var(--surface-2)] px-[9px] py-1 text-label"
              >
                {n}
                <LinkButton
                  onClick={() => setAllowlist((a) => a.filter((x) => x !== n))}
                  aria-label={`Remove ${n}`}
                  className="hover:text-[#ef4444]"
                >
                  ×
                </LinkButton>
              </span>
            ))}
            <TextInput
              size="sm"
              dashed
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  setAllowlist((a) => Array.from(new Set([...a, newName.trim()])));
                  setNewName("");
                }
              }}
              placeholder="+ add name, Enter"
              className="w-[120px]"
            />
          </div>
        </div>
        <div className="text-meta text-[var(--text-3)]">
          Attribution is global — it applies to every project.
        </div>
      </Card>

      <Card title="Agents">
        <AgentsSettings agents={data.config.agents} />
      </Card>

      <Card title="Freshness & theme">
        <SettingRow
          title="Fallback refresh interval"
          description="Live changes stream in instantly; this only backstops a dropped stream"
          control={
          <div className="flex flex-shrink-0 items-center gap-[6px]">
            <TextInput
              type="number"
              min={1}
              max={300}
              value={pollSec}
              onChange={(e) => setPollSec(e.target.value)}
              onBlur={() => setPollSec(String(clampSec(pollSec)))}
              onKeyDown={saveOnSubmitKey}
              aria-label="Fallback refresh interval in seconds"
              mono
              className="w-[72px] text-right"
            />
            <span className="font-mono text-body text-[var(--text-3)]">s</span>
          </div>
          }
        />
        <div className="flex flex-col gap-[10px]">
          <div>
            <div className="text-body">Theme</div>
            <div className="text-meta text-[var(--text-3)]">
              Saved per project — each project remembers its own theme on this device.
              Currently <span className="font-medium text-[var(--text-2)]">{choice === SYSTEM_CHOICE.id ? `System (${theme.name})` : theme.name}</span>.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
            {[SYSTEM_CHOICE, ...THEMES].map((t) => {
              const active = t.id === choice;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className="flex items-center gap-[9px] rounded-[10px] border p-[9px] text-left transition-colors hover:bg-[var(--surface-3)]"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: active ? "var(--brand)" : "var(--border)",
                    boxShadow: active ? "0 0 0 1px var(--brand)" : "none",
                  }}
                >
                  <span className="flex h-[24px] w-[24px] flex-shrink-0 overflow-hidden rounded-[7px] border border-border">
                    {t.swatch.map((c, i) => (
                      <span key={i} style={{ background: c, width: "33.34%" }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label font-medium text-[var(--text)]">
                      {t.name}
                    </span>
                    <span className="block text-meta capitalize text-[var(--text-3)]">
                      {t.id === SYSTEM_CHOICE.id ? "follows OS" : t.mode}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <BoardCard />

      <UpdatesCard />

      <NotificationsCard />

      <GamificationCard />

      <KeyboardShortcutsCard />

      <div className="flex justify-end">
        <BrandButton icon="check" onClick={() => save.mutate()} disabled={save.isPending} className="max-md:w-full">
          Save settings
        </BrandButton>
      </div>
    </div>
  );
}

function KeyboardShortcutsCard() {
  const [helpOpen, setHelpOpen] = React.useState(false);
  return (
    <Card title="Keyboard shortcuts">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
          <section key={group.topic}>
            <h3 className="mb-1.5 text-meta font-semibold uppercase tracking-[.08em] text-[var(--text-3)]">
              {group.topic}
            </h3>
            <div className="flex flex-col gap-1">
              {group.shortcuts.map((shortcut) => (
                <div
                  key={`${group.topic}-${shortcut.keys.join("-")}-${shortcut.label}`}
                  className="flex min-h-7 items-center justify-between gap-4"
                >
                  <span className="text-label text-[var(--text-2)]">{shortcut.label}</span>
                  <ShortcutKeys keys={shortcut.keys} sequence={shortcut.sequence} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <SettingRow
        title="Shortcuts are disabled while typing in a field"
        description={<>Press{" "}
          <kbd className="rounded border border-border bg-[var(--surface-2)] px-1.5 py-0.5 font-mono">
            ?
          </kbd>{" "}
          anywhere outside a field for the same reference.</>}
        control={
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            Open reference
          </Button>
        }
      />
      <KeyboardHelpDialog open={helpOpen} onOpenChangeAction={setHelpOpen} />
    </Card>
  );
}

function BoardCard() {
  const { prefs, setPrefs } = useBoardPrefs();
  const opts: { value: "auto" | "always"; label: string }[] = [
    { value: "auto", label: "Only when it has beads" },
    { value: "always", label: "Always show" },
  ];
  return (
    <Card title="Board">
      <SettingRow
        title="Blocked column"
        description="Hide the Blocked column when nothing is blocked, or keep it pinned."
        control={
        <Segmented
          label="Blocked column"
          options={opts}
          value={prefs.blockedColumn}
          onChange={(v) => setPrefs({ ...prefs, blockedColumn: v })}
        />
        }
      />
    </Card>
  );
}

function UpdatesCard() {
  const { prefs, setPrefs } = useBoardPrefs();
  const on = prefs.checkUpdates;
  return (
    <Card title="Software updates">
      <SettingRow
        title="Check for new versions"
        description="Check GitHub every five minutes and show new versions in the sidebar. This choice applies to this browser."
        control={
          <ToggleButton
            on={on}
            role="switch"
            aria-label="Check for new versions"
            aria-checked={on}
            onClick={() => setPrefs({ ...prefs, checkUpdates: !on })}
          />
        }
      />
      <label className="flex items-center justify-between gap-4 text-body max-md:flex-col max-md:items-start max-md:gap-2">
        Update channel
        <SelectField aria-label="Update channel" value={prefs.updateChannel}
          onChange={e => setPrefs({ ...prefs, updateChannel: e.target.value === "development" ? "development" : "stable" })}
          className="max-md:w-full">
          <option value="stable">Stable releases (recommended)</option>
          <option value="development">Development (main)</option>
        </SelectField>
      </label>
      <p className="m-0 text-meta text-[var(--text-3)]">
        Stable follows published versions and includes release notes. Development follows the latest
        commits on main and requires a Git checkout. Updates only install when you choose Update now.
      </p>
    </Card>
  );
}

function GamificationCard() {
  const { meta } = useApp();
  const qc = useQueryClient();
  const enabled = !!meta?.gamification;
  const save = useMutation({
    mutationFn: (v: boolean) => api.saveConfig({ gamification: v }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["beads"] });
      qc.invalidateQueries({ queryKey: ["doctor"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Card title="Gamification">
      <SettingRow
        title="Productivity XP & levels"
        description="Earn XP for closing beads (weighted by priority and how many they unblock); a level/progress bar appears in the sidebar. Derived from bd history — opt-in."
        control={<ToggleButton on={enabled} onClick={() => save.mutate(!enabled)} disabled={save.isPending} />}
      />
    </Card>
  );
}

function NotificationsCard() {
  const { prefs, setPrefs, permission, requestPermission } = useNotificationPrefs();
  const unsupported = permission === "unsupported";

  const toggleEnabled = async () => {
    if (!prefs.enabled) {
      // Turning on: ask for OS permission (a no-op if already granted/denied).
      if (permission === "default") await requestPermission();
    }
    setPrefs({ ...prefs, enabled: !prefs.enabled });
  };

  const cat = (key: keyof NotifPrefs, label: string) => (
    <label className="flex cursor-pointer select-none items-center gap-[9px] max-md:min-h-11">
      <CheckInput
        checked={prefs[key]}
        disabled={!prefs.enabled}
        onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
      />
      <span className={`text-body ${prefs.enabled ? "text-[var(--text-2)]" : "text-[var(--text-3)]"}`}>
        {label}
      </span>
    </label>
  );

  return (
    <Card title="Notifications">
      <SettingRow
        title="Desktop & toast notifications"
        description={unsupported
          ? "This browser does not support desktop notifications."
          : "Get notified when an agent finishes or blocks a bead, or escalates one to you."}
        control={<ToggleButton on={prefs.enabled} onClick={toggleEnabled} disabled={unsupported} />}
      />
      {prefs.enabled && permission === "denied" && (
        <div className="text-meta text-[#ef4444]">
          Desktop permission is blocked in your browser — you will still see in-app toasts.
          Re-enable notifications for this site in your browser settings for desktop alerts.
        </div>
      )}
      <div className="flex flex-col gap-[8px]">
        {cat("finished", "An agent finishes a bead")}
        {cat("blocked", "A bead becomes blocked")}
        {cat("escalation", "A bead is escalated to you (Needs You)")}
      </div>
      <div className="text-meta text-[var(--text-3)]">
        Per-device — stored in this browser, not in beads. Your own (human) actions never notify.
      </div>
    </Card>
  );
}
