"use client";
import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { useApp } from "@/components/app-context";
import { useGamification } from "@/hooks/use-beads";
import { Icon } from "@/components/icons";
import { avatarColor, initials } from "@/lib/beads-view";
import type { ActorStat } from "@/lib/api-client";

/**
 * Gamification surface: your level/XP + daily streaks (txs.2), badges (txs.3),
 * and the human-vs-agent leaderboard (txs.4). All derived from bd history via
 * /gamification. Only reachable when the feature is opted in (Settings).
 */
export function AchievementsView() {
  const { projectId, meta } = useApp();
  const enabled = !!meta?.gamification;
  const { data, isLoading } = useGamification(projectId, enabled);

  if (!enabled) {
    return (
      <Shell>
        <div className="p-10 text-center text-body text-[var(--text-3)]">
          Gamification is off. Enable it in <span className="font-medium">Settings → Gamification</span> to
          earn XP, streaks, and badges.
        </div>
      </Shell>
    );
  }
  if (isLoading && !data) {
    return (
      <Shell>
        <div className="p-10 text-center text-body text-[var(--text-3)]">Loading achievements…</div>
      </Shell>
    );
  }
  if (!data) return <Shell>{null}</Shell>;

  const you = data.you;
  const humans = data.actors.filter((a) => a.origin === "human");
  const agents = data.actors.filter((a) => a.origin === "agent");

  return (
    <Shell>
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        {/* Level + streaks */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-[13px] border border-border bg-[var(--surface)] p-4 md:col-span-2">
            <div className="flex items-baseline justify-between">
              <div className="text-body font-semibold">Level {you.level}</div>
              <div className="font-mono text-label text-[var(--text-3)]">{you.xp} XP · {you.closed} closed</div>
            </div>
            <div className="mt-2 h-[8px] overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div className="h-full rounded-full" style={{ width: `${Math.round(you.progress * 100)}%`, background: "var(--brand)" }} />
            </div>
            <div className="mt-1 text-meta text-[var(--text-3)]">
              {Math.max(0, you.span - you.intoLevel)} XP to level {you.level + 1}
            </div>
          </div>
          <div className="flex items-center justify-around rounded-[13px] border border-border bg-[var(--surface)] p-4">
            <Stat value={`🔥 ${you.currentStreak}`} label="current streak" />
            <Stat value={`${you.longestStreak}d`} label="longest" />
          </div>
        </div>

        {/* Badges */}
        <section className="rounded-[13px] border border-border bg-[var(--surface)] p-[16px_18px]">
          <div className="mb-3 text-body font-semibold">Badges</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {you.badges.map((b) => (
              <div
                key={b.key}
                title={b.description}
                className={`flex flex-col items-center gap-1 rounded-[10px] border p-3 text-center ${
                  b.earned ? "border-[var(--brand)] bg-[var(--brand-weak)]" : "border-border bg-[var(--surface-2)] opacity-60"
                }`}
              >
                <Icon name="feature" size={20} style={{ color: b.earned ? "var(--brand)" : "var(--text-3)" }} />
                <span className="text-label font-semibold">{b.label}</span>
                <span className="text-meta leading-tight text-[var(--text-3)]">{b.description}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Leaderboard */}
        <section className="rounded-[13px] border border-border bg-[var(--surface)] p-[16px_18px]">
          <div className="mb-3 text-body font-semibold">Leaderboard · humans vs agents</div>
          <div className="grid gap-4 md:grid-cols-2">
            <LeaderColumn title="👤 Humans" actors={humans} you={you.actor} />
            <LeaderColumn title="🤖 Agents" actors={agents} you={you.actor} />
          </div>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Achievements" subtitle="XP, streaks, badges & leaderboard" />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-page-title font-semibold">{value}</div>
      <div className="text-meta uppercase tracking-[.03em] text-[var(--text-3)]">{label}</div>
    </div>
  );
}

function LeaderColumn({ title, actors, you }: { title: string; actors: ActorStat[]; you: string }) {
  return (
    <div>
      <div className="mb-2 text-label font-medium text-[var(--text-2)]">{title}</div>
      {actors.length === 0 ? (
        <div className="text-label text-[var(--text-3)]">No closes yet.</div>
      ) : (
        <ol className="flex flex-col gap-[5px]">
          {actors.map((a, i) => (
            <li
              key={a.actor}
              className={`flex items-center gap-2 rounded-[9px] px-2 py-[6px] text-label ${
                a.actor === you ? "bg-[var(--brand-weak)]" : "bg-[var(--surface-2)]"
              }`}
            >
              <span className="w-4 text-center font-mono text-meta text-[var(--text-3)]">{i + 1}</span>
              <span
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-meta font-semibold text-white"
                style={{ background: avatarColor(a.actor) }}
              >
                {initials(a.actor)}
              </span>
              <span className="flex-1 truncate">{a.actor}</span>
              {a.currentStreak >= 2 && <span className="text-meta" title="current streak">🔥{a.currentStreak}</span>}
              <span className="font-mono text-label font-semibold">{a.xp}</span>
              <span className="text-meta text-[var(--text-3)]">XP</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
