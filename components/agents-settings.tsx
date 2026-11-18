"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentIcon } from "@/components/agent-icon";
import { useApp } from "@/components/app-context";
import {
  AGENT_COLORS,
  AGENT_EMOJIS,
  DEFAULT_AGENT_COLOR,
  MAX_AGENT_NAME,
  newCustomAgentId,
  presetOf,
  type AgentIdentity,
} from "@/lib/agents";
import { api, type DoctorResponse } from "@/lib/api-client";
import { Button, CheckInput, IconButton, TextInput } from "@/components/controls";


/**
 * Agent identities: which agents Beadscope offers in the assignee picker.
 * Every change saves at once and takes effect without a restart, so the card
 * has no Save button of its own.
 */
export function AgentsSettings({ agents: saved }: { agents: AgentIdentity[] }) {
  const { projectId } = useApp();
  const qc = useQueryClient();
  const [names, setNames] = React.useState<Record<string, string>>({});
  const [openPicker, setOpenPicker] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  // Shown at once; the saved list is only read when the card mounts, and
  // a failed save puts the saved list back.
  const [agents, setAgents] = React.useState(saved);

  const save = useMutation({
    mutationFn: (next: AgentIdentity[]) => api.saveConfig({ agents: next }),
    onSuccess: (config) => {
      qc.setQueryData<DoctorResponse>(["doctor", projectId], (old) => (old ? { ...old, config } : old));
      qc.invalidateQueries({ queryKey: ["beads"] });
    },
    onError: (e) => {
      setNames({});
      setAgents(saved);
      toast.error((e as Error).message);
    },
  });

  const commit = (next: AgentIdentity[]) => {
    setAgents(next);
    save.mutate(next);
  };
  const change = (id: string, patch: Partial<AgentIdentity>) =>
    commit(agents.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const commitName = (agent: AgentIdentity) => {
    const draft = names[agent.id];
    if (draft === undefined || draft.trim() === agent.name) return;
    change(agent.id, { name: draft.trim() });
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    commit([...agents, { id: newCustomAgentId(), name, enabled: true, color: DEFAULT_AGENT_COLOR }]);
    setNewName("");
  };

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="text-meta text-[var(--text-3)]">
        Checked agents are offered when assigning a bead. The name is what <span className="font-mono">bd</span>{" "}
        records, so it should match the <span className="font-mono">BEADS_ACTOR</span> that agent runs with.
        Renaming does not change beads already assigned to the old name.
      </div>
      <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
        {agents.map((agent) => {
          const preset = presetOf(agent.id);
          const draft = names[agent.id] ?? agent.name;
          return (
            <li key={agent.id} data-agent-row={agent.id} className="flex flex-col gap-[8px]">
              <div className="flex items-center gap-[10px] max-md:flex-wrap">
                <label className="flex shrink-0 cursor-pointer items-center justify-center max-md:h-11 max-md:w-11">
                  <CheckInput
                    checked={agent.enabled}
                    onChange={(e) => change(agent.id, { enabled: e.target.checked })}
                    aria-label={`Offer ${agent.name} as an assignee`}
                  />
                </label>
                <AgentIcon agent={agent} size={24} />
                <TextInput
                  size="sm"
                  mono
                  value={draft}
                  maxLength={MAX_AGENT_NAME}
                  onChange={(e) => setNames((n) => ({ ...n, [agent.id]: e.target.value }))}
                  onBlur={() => commitName(agent)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitName(agent);
                    } else if (e.key === "Escape") {
                      setNames((n) => Object.fromEntries(Object.entries(n).filter(([id]) => id !== agent.id)));
                    }
                  }}
                  aria-label={`Name of ${preset?.label ?? agent.name}`}
                  className="flex-1"
                />
                {preset ? (
                  <span className="hidden w-[96px] shrink-0 truncate text-meta text-[var(--text-3)] sm:block">
                    {preset.label}
                  </span>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-expanded={openPicker === agent.id}
                      aria-label={`Choose icon for ${agent.name}`}
                      onClick={() => setOpenPicker((p) => (p === agent.id ? null : agent.id))}
                    >
                      Icon
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Remove ${agent.name}`}
                      disabled={save.isPending}
                      onClick={() => commit(agents.filter((a) => a.id !== agent.id))}
                      className="text-[var(--text-3)] hover:text-[#ef4444]"
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
              {!preset && openPicker === agent.id && (
                <div className="ml-[34px] max-md:ml-0 flex flex-col gap-[8px] rounded-[10px] border border-border bg-[var(--surface-2)] p-[10px]">
                  <div role="group" aria-label="Emoji" className="flex flex-wrap gap-[4px]">
                    {AGENT_EMOJIS.map((emoji) => (
                      <IconButton
                        key={emoji}
                        label={`Emoji ${emoji}`}
                        variant="ghost"
                        aria-pressed={agent.emoji === emoji}
                        onClick={() => change(agent.id, { emoji })}
                        className="border text-page-title"
                        style={{ borderColor: agent.emoji === emoji ? "var(--brand)" : "transparent" }}
                      >
                        {emoji}
                      </IconButton>
                    ))}
                  </div>
                  <div role="group" aria-label="Colour" className="flex flex-wrap items-center gap-[6px]">
                    {AGENT_COLORS.map((color) => {
                      const active = !agent.emoji && agent.color === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          aria-label={`Colour ${color}`}
                          aria-pressed={active}
                          // A colour means initials on that colour, so it replaces the emoji.
                          onClick={() => change(agent.id, { color, emoji: undefined })}
                          className="tap-target h-[22px] w-[22px] rounded-full border-2 max-md:h-11 max-md:w-11"
                          style={{ background: color, borderColor: active ? "var(--text)" : "transparent" }}
                        />
                      );
                    })}
                    <span className="text-meta text-[var(--text-3)]">Colour shows the initials</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-[8px] max-md:flex-wrap">
        <TextInput
          size="sm"
          mono
          dashed
          value={newName}
          maxLength={MAX_AGENT_NAME}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-label="Name of a new agent"
          placeholder="+ add an agent, e.g. my-agent"
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={add} disabled={!newName.trim() || save.isPending}>
          Add agent
        </Button>
      </div>
    </div>
  );
}
