"use client";
import * as React from "react";
import { AgentIcon } from "@/components/agent-icon";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { agentByName, enabledAgentNames } from "@/lib/agents";
import { avatarColor, initials } from "@/lib/beads-view";

/**
 * Assignee choices: the human actor, then the agent identities that are switched
 * on in Settings, then every other name already on a bead (alphabetical).
 */
export function useAssigneeNames(): string[] {
  const { beads, meta } = useApp();
  return React.useMemo(() => {
    const clean = (names: Array<string | null | undefined>) =>
      names.map((n) => n?.trim()).filter((n): n is string => !!n);
    const first = Array.from(new Set(clean([meta?.humanActor, ...enabledAgentNames(meta?.agents)])));
    const rest = Array.from(new Set(clean([...beads.map((b) => b.assignee)])))
      .filter((n) => !first.includes(n))
      .sort((a, b) => a.localeCompare(b));
    return [...first, ...rest];
  }, [beads, meta?.humanActor, meta?.agents]);
}

/** An agent's icon when the name is an agent identity, else the person's coloured initials. */
export function AssigneeAvatar({ name, size = 18 }: { name: string; size?: number }) {
  const { meta } = useApp();
  const agent = agentByName(meta?.agents, name);
  if (agent) return <AgentIcon agent={agent} size={size} />;
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5), background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}

function OptionRow({ name, label }: { name: string; label?: string }) {
  return (
    <>
      {name ? <AssigneeAvatar name={name} size={18} /> : <span className="h-[18px] w-[18px] shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label ?? name}</span>
    </>
  );
}

const listClass =
  "bd-scroll absolute left-0 right-0 z-30 mt-1 max-h-[220px] overflow-y-auto rounded-[9px] border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-[var(--shadow-lg)]";
const optionClass = (active: boolean, selected: boolean) =>
  `flex cursor-pointer items-center gap-[8px] rounded-[7px] px-[8px] py-[6px] text-body ${
    active ? "bg-[var(--surface-3)]" : ""
  } ${selected ? "font-semibold" : ""}`;

/**
 * A dropdown that shows each name with its icon, in place of a native <select>
 * (which cannot draw icons). "" means unassigned.
 */
export function AssigneeSelect({
  value,
  onChange,
  names,
  label = "Assignee",
}: {
  value: string;
  onChange: (name: string) => void;
  names: string[];
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const options = ["", ...names];

  React.useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };
  const toggle = () => {
    setActive(Math.max(0, options.indexOf(value)));
    setOpen((o) => !o);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return toggle();
            setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          } else if (open && e.key === "Enter") {
            e.preventDefault();
            choose(options[active]);
          } else if (open && e.key === "Escape") {
            // Close the list only; the dialog around it should stay open.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="flex h-[38px] w-full cursor-pointer items-center gap-[8px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-left text-body text-[var(--text)] outline-none focus:border-[var(--brand)]"
      >
        <OptionRow name={value} label={value || "Unassigned"} />
        <Icon name="chevron" size={12} className="shrink-0 text-[var(--text-3)]" />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className={listClass}>
          {options.map((name, i) => (
            <li
              key={name || "__unassigned"}
              role="option"
              aria-selected={name === value}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(name)}
              className={optionClass(i === active, name === value)}
            >
              <OptionRow name={name} label={name || "Unassigned"} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Suggestions for a free-text assignee field: each name with its icon, filtered by what is
 * typed. The text field itself stays the source of truth, so any name can still be typed.
 * The list floats over the content below, so render it inside a `relative` wrapper around the field.
 */
export function AssigneeSuggestions({
  id,
  names,
  typed,
  active,
  onPick,
}: {
  id: string;
  names: string[];
  typed: string;
  active: number;
  onPick: (name: string) => void;
}) {
  if (names.length === 0) return null;
  return (
    <ul id={id} role="listbox" aria-label="Suggested assignees" className={listClass}>
      {names.map((name, i) => (
        <li
          key={name}
          id={`${id}-${i}`}
          role="option"
          aria-selected={name === typed.trim()}
          // mousedown, so the text field keeps focus and does not blur before the pick lands.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(name);
          }}
          className={optionClass(i === active, name === typed.trim())}
        >
          <OptionRow name={name} />
        </li>
      ))}
    </ul>
  );
}

/** The names to suggest for what has been typed: all of them when it is blank or an exact match. */
export function filterSuggestions(names: string[], typed: string): string[] {
  const q = typed.trim().toLowerCase();
  if (!q || names.some((n) => n.toLowerCase() === q)) return names;
  return names.filter((n) => n.toLowerCase().includes(q));
}
