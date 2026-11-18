"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { api } from "@/lib/api-client";
import { isSubmitKey } from "@/lib/keyboard-shortcuts";
import { Card } from "@/components/settings-card";
import { PageHeader } from "@/components/page-header";

const TEMPLATES = [
  { id: "manager", name: "Manager Dashboard", blurb: "Stats-forward hero + highlights. Warm & fuzzy for managers." },
  { id: "timeline", name: "Activity Timeline", blurb: "A chronological feed of everything that got done." },
  { id: "portfolio", name: "Minimal Portfolio", blurb: "Clean card grid — understated and tidy." },
] as const;

const cardBase = "rounded-[12px] border bg-[var(--surface)] p-[14px_16px] text-left transition-colors";

export function PublishView() {
  const { projectId, beads, meta, readOnly } = useApp();
  const [template, setTemplate] = React.useState<(typeof TEMPLATES)[number]["id"]>("manager");
  const [title, setTitle] = React.useState("Look at my productivity 😄");
  const [scope, setScope] = React.useState<"project" | "all">("project");
  const [stats, setStats] = React.useState(true);
  const [search, setSearch] = React.useState(true);
  const gamificationEnabled = !!meta?.gamification;
  const [gamification, setGamification] = React.useState(false);
  const [result, setResult] = React.useState<{ outDir: string; indexPath: string; count: number } | null>(null);
  const [deployUrl, setDeployUrl] = React.useState<string | null>(null);

  const build = useMutation({
    mutationFn: () =>
      api.showcase.build(projectId, {
        template,
        title,
        scope,
        stats,
        search,
        gamification: gamificationEnabled && gamification,
      }),
    onSuccess: (r) => {
      setResult(r);
      setDeployUrl(null); // a fresh build supersedes any prior deploy URL
      toast.success(`Published ${r.count} beads · opening preview`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const open = useMutation({
    mutationFn: () => api.showcase.open(projectId, result!.indexPath),
    onError: (e) => toast.error((e as Error).message),
  });
  const deploy = useMutation({
    mutationFn: () => api.showcase.deploy(projectId, result!.outDir),
    onSuccess: (r) => {
      if (r.deployed && r.url) {
        setDeployUrl(r.url);
        toast.success("Deployed");
        window.open(r.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(r.error || "Deploy unavailable");
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const localCount = beads.filter((b) => !(b.labels ?? []).includes("archived")).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Publish" subtitle="Generate a shareable static site from your beads — built with Eleventy" />

      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[24px_22px] max-md:p-4">
        <div className="mx-auto flex max-w-[640px] flex-col gap-[18px]">
          {/* Template */}
          <Card title="Template">
            <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-3">
              {TEMPLATES.map((t) => {
                const active = template === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={cardBase}
                    style={{
                      borderColor: active ? "var(--brand)" : "var(--border)",
                      background: active ? "var(--brand-weak)" : "var(--surface)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-[7px]"
                        style={{ background: active ? "var(--brand)" : "var(--surface-2)", color: active ? "#fff" : "var(--text-3)" }}
                      >
                        <Icon name="rocket" size={13} />
                      </span>
                      <span className="text-body font-semibold">{t.name}</span>
                    </div>
                    <div className="mt-[6px] text-meta leading-[1.4] text-[var(--text-3)]">{t.blurb}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Options */}
          <Card title="Options">
            <label className="flex flex-col gap-[6px]">
              <span className="text-label text-[var(--text-2)]">Site title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (!isSubmitKey(e)) return;
                  e.preventDefault();
                  if (!readOnly && !build.isPending) build.mutate();
                }}
                className="h-[38px] rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-body text-[var(--text)] outline-none focus:border-[var(--brand)]"
                placeholder="Look at my productivity 😄"
              />
            </label>

            <div className="flex flex-col gap-[6px]">
              <span className="text-label text-[var(--text-2)]">Scope</span>
              <div className="flex flex-wrap gap-2">
                {(["project", "all"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className="h-9 flex-1 rounded-[9px] border text-label font-medium"
                    style={{
                      borderColor: scope === s ? "var(--brand)" : "var(--border)",
                      background: scope === s ? "var(--brand-weak)" : "var(--surface-2)",
                      color: scope === s ? "var(--brand)" : "var(--text-2)",
                    }}
                  >
                    {s === "project" ? "This project" : "All projects"}
                  </button>
                ))}
              </div>
              <span className="text-meta text-[var(--text-3)]">
                {scope === "project"
                  ? `${localCount} beads in this project (archived excluded)`
                  : "Aggregates beads across every project you've added"}
              </span>
            </div>

            <div className="flex flex-col gap-[8px]">
              <Toggle checked={stats} onChange={setStats} label="Include a stats dashboard (counts, human vs agent)" />
              <Toggle checked={search} onChange={setSearch} label="Include client-side search" />
              {gamificationEnabled && (
                <Toggle
                  checked={gamification}
                  onChange={setGamification}
                  label="Include gamification (level, XP, badges, leaderboard)"
                />
              )}
            </div>
          </Card>

          <div className="flex justify-end">
            <button
              onClick={() => build.mutate()}
              disabled={readOnly || build.isPending}
              className="tap-target flex h-[38px] items-center gap-[7px] rounded-[9px] px-4 text-body font-semibold text-white disabled:opacity-50 max-md:w-full max-md:justify-center"
              style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
            >
              <Icon name="rocket" size={15} />
              {build.isPending ? "Building…" : "Publish site"}
            </button>
          </div>

          {result && (
            <Card title="Published">
              <div className="text-body text-[var(--text-2)]">
                Built <b>{result.count}</b> beads into a static site.
              </div>
              <div className="break-all rounded-[9px] border border-border bg-[var(--surface-2)] p-[9px_11px] font-mono text-meta text-[var(--text-3)]">
                {result.outDir}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => open.mutate()}
                  disabled={readOnly || open.isPending}
                  className="flex h-9 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-label font-medium hover:bg-[var(--surface-3)] disabled:opacity-50"
                >
                  <Icon name="board" size={14} /> Open preview
                </button>
                <button
                  onClick={() => deploy.mutate()}
                  disabled={readOnly || deploy.isPending}
                  className="flex h-9 items-center gap-[6px] rounded-[9px] px-3 text-label font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  <Icon name="rocket" size={14} /> {deploy.isPending ? "Deploying…" : "Deploy"}
                </button>
                {deployUrl && (
                  <a
                    href={deployUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={deployUrl}
                    className="tap-target flex h-9 min-w-0 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-label font-medium text-[var(--brand)] hover:bg-[var(--surface-3)]"
                  >
                    <Icon name="link" size={14} />
                    <span className="truncate">{deployUrl.replace(/^https?:\/\//, "")}</span>
                  </a>
                )}
              </div>
              <span className="text-meta text-[var(--text-3)]">
                Deploy uses the Vercel CLI (best-effort). The folder above can also be hosted anywhere.
              </span>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-[9px] max-md:min-h-11">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 cursor-pointer md:h-4 md:w-4"
        style={{ accentColor: "var(--brand)" }}
      />
      <span className="text-body text-[var(--text-2)]">{label}</span>
    </label>
  );
}
