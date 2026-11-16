"use client";
import * as React from "react";
import { DEFAULT_AGENT_COLOR, presetOf, type AgentIdentity } from "@/lib/agents";
import { initials } from "@/lib/beads-view";

/**
 * Simplified marks for the pre-defined agents, drawn white on the agent's brand
 * colour. They are our own approximations, not the vendors' official artwork.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  "claude-code": (
    <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
  ),
  codex: (
    <g stroke="#fff" strokeWidth="1.9" strokeLinejoin="round" fill="none">
      <path d="M12 3.4 19.4 7.7v8.6L12 20.6 4.6 16.3V7.7z" />
      <path d="M12 8.4l3.2 1.9v3.8L12 16l-3.2-1.9v-3.8z" />
    </g>
  ),
  cursor: <path d="M6.5 4.5 19 11l-5.6 1.8L11.5 18.5z" fill="#fff" />,
  gemini: <path d="M12 3c.7 5 4 8.3 9 9-5 .7-8.3 4-9 9-.7-5-4-8.3-9-9 5-.7 8.3-4 9-9z" fill="#fff" />,
  copilot: (
    <g stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round">
      <path d="M5 11a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
      <path d="M9.2 12v1.6M14.8 12v1.6" />
    </g>
  ),
};

/**
 * The icon for an agent identity: a pre-defined agent's mark, or for one the
 * user added, the emoji they picked, else its initials on the colour they picked.
 */
export function AgentIcon({ agent, size = 18 }: { agent: AgentIdentity; size?: number }) {
  const preset = presetOf(agent.id);
  const background = preset ? preset.color : agent.emoji ? "var(--surface-3)" : (agent.color ?? DEFAULT_AGENT_COLOR);
  return (
    <span
      aria-hidden="true"
      data-agent-icon={agent.id}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none text-white"
      style={{ width: size, height: size, background, fontSize: Math.round(size * 0.5) }}
    >
      {preset ? (
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)}>
          {GLYPHS[preset.id]}
        </svg>
      ) : agent.emoji ? (
        <span style={{ fontSize: Math.round(size * 0.62) }}>{agent.emoji}</span>
      ) : (
        initials(agent.name)
      )}
    </span>
  );
}
