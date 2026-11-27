/**
 * Agent identities: the names an AI agent works under (the `bd` actor string),
 * managed in Settings. Shared by the server (config) and the UI, so this file
 * must not import anything server-only.
 *
 * An identity only labels and offers a name. `bd` stores the plain string in
 * `assignee` / `created_by`; Beadscope already treats any name that is not on the
 * human allowlist as an agent (lib/attribution.ts), so identities do not change
 * that rule. They give the assignee picker its choices and give those names an icon.
 */

/** What is stored in config.json. */
export interface AgentIdentity {
  /**
   * Stable key. Renaming an identity changes `name`, never `id`. Pre-defined
   * identities use their preset key ("claude-code"); user-added ones "custom-…".
   */
  id: string;
  /** The actor name: what `bd` records as the assignee. Editable. */
  name: string;
  /** Only enabled identities are offered in the assignee picker. */
  enabled: boolean;
  /** User-added identities only: a stock emoji from AGENT_EMOJIS. Wins over `color`. */
  emoji?: string;
  /** User-added identities only: a colour from AGENT_COLORS. */
  color?: string;
}

export interface AgentPreset {
  id: string;
  /** The default actor name. */
  name: string;
  /** Product name shown beside the name in Settings. */
  label: string;
  /** Brand colour behind the icon (any CSS background, so a gradient works). */
  color: string;
  /** Enabled the first time Beadscope sees it. */
  enabled: boolean;
  /**
   * A pool: the identity also stands for every `<name>-<number>` actor, one per machine
   * (coding-agent covers coding-agent-0, coding-agent-1, ...). Pre-defined identities only.
   */
  pool?: boolean;
}

/** Pre-defined identities, in display order. They can be disabled and renamed, not deleted. */
export const AGENT_PRESETS: AgentPreset[] = [
  { id: "coding-agent", name: "coding-agent", label: "Coding agents", color: "linear-gradient(135deg, #7c3aed 0%, #0ea5e9 100%)", enabled: true, pool: true },
  { id: "claude-code", name: "claude-code", label: "Claude Code", color: "#d97757", enabled: true },
  { id: "codex", name: "codex", label: "Codex", color: "#10a37f", enabled: false },
  { id: "cursor", name: "cursor-agent", label: "Cursor", color: "#4b5563", enabled: false },
  { id: "gemini", name: "gemini", label: "Gemini CLI", color: "#4285f4", enabled: false },
  { id: "copilot", name: "copilot", label: "GitHub Copilot", color: "#8957e5", enabled: false },
];

/** Stock emoji for identities the user adds. */
export const AGENT_EMOJIS = [
  "🤖", "🧠", "⚡", "🛠️", "🚀", "🦾", "🔮", "🛰️",
  "🦉", "🐙", "🦊", "🐱", "🧪", "🎯", "🌟", "🧩",
];

/** Colours for identities the user adds (shown behind the initials). */
export const AGENT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
];

export const DEFAULT_AGENT_COLOR = AGENT_COLORS[5];
export const MAX_AGENT_NAME = 64;

export function presetOf(id: string): AgentPreset | undefined {
  return AGENT_PRESETS.find((p) => p.id === id);
}

export function defaultAgents(): AgentIdentity[] {
  return AGENT_PRESETS.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled }));
}

/**
 * Turn whatever is on disk (or in a request) into a clean list: every preset
 * present and in order, then the user's own, with unknown fields dropped.
 * Never throws, so a bad config file cannot break startup.
 */
export function normalizeAgents(input: unknown): AgentIdentity[] {
  const stored = new Map<string, Record<string, unknown>>();
  const custom: AgentIdentity[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      if (typeof e.id !== "string" || !e.id || stored.has(e.id)) continue;
      stored.set(e.id, e);
    }
  }
  const nameOf = (e: Record<string, unknown> | undefined, fallback: string) => {
    const n = typeof e?.name === "string" ? e.name.trim().slice(0, MAX_AGENT_NAME) : "";
    return n || fallback;
  };
  const out: AgentIdentity[] = AGENT_PRESETS.map((p) => {
    const e = stored.get(p.id);
    return {
      id: p.id,
      name: nameOf(e, p.name),
      enabled: typeof e?.enabled === "boolean" ? e.enabled : p.enabled,
    };
  });
  for (const [id, e] of stored) {
    if (presetOf(id) || !id.startsWith("custom-")) continue;
    const name = nameOf(e, "");
    if (!name) continue;
    const agent: AgentIdentity = { id, name, enabled: e.enabled !== false };
    if (typeof e.emoji === "string" && AGENT_EMOJIS.includes(e.emoji)) agent.emoji = e.emoji;
    if (typeof e.color === "string" && AGENT_COLORS.includes(e.color)) agent.color = e.color;
    custom.push(agent);
  }
  return [...out, ...custom];
}

/**
 * Check a list a user is saving. Returns a message for the first problem, or
 * null. Names must be unique (ignoring case) and must not collide with a human
 * name, which would make the agent's work render as human's.
 */
export function validateAgents(agents: AgentIdentity[], humanNames: string[]): string | null {
  const seen = new Set<string>();
  const humans = new Set(humanNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  for (const a of agents) {
    const name = a.name.trim();
    if (!name) return "Every agent needs a name.";
    if (name.length > MAX_AGENT_NAME) return `Agent names are at most ${MAX_AGENT_NAME} characters.`;
    if (/[\u0000-\u001f\u007f]/.test(name)) return "Agent names cannot contain control characters.";
    const key = name.toLowerCase();
    if (humans.has(key)) return `"${name}" is a human name (the human actor or allowlist); agents need their own.`;
    if (seen.has(key)) return `"${name}" is used twice. Agent names must be unique.`;
    seen.add(key);
  }
  return null;
}

/** Enabled identities' names, in list order: what the assignee picker offers. */
export function enabledAgentNames(agents: AgentIdentity[] | undefined): string[] {
  return (agents ?? []).filter((a) => a.enabled).map((a) => a.name);
}

/**
 * The identity an assignee name belongs to, enabled or not (so old beads keep their icon).
 * A name matches an identity exactly (ignoring case); failing that, `<pool>-<number>` matches
 * the pool, so coding-agent-1 and coding-agent-2 are both "coding-agent". An exact match wins.
 */
export function agentByName(agents: AgentIdentity[] | undefined, name: string | null | undefined): AgentIdentity | undefined {
  const key = name?.trim().toLowerCase();
  if (!key || !agents) return undefined;
  const exact = agents.find((a) => a.name.trim().toLowerCase() === key);
  if (exact) return exact;
  return agents.find((a) => {
    if (!presetOf(a.id)?.pool) return false;
    const base = a.name.trim().toLowerCase();
    return key.length > base.length + 1 && key.startsWith(base + "-") && /^\d+$/.test(key.slice(base.length + 1));
  });
}

export function newCustomAgentId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
