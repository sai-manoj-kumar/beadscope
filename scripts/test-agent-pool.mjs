// The coding-agent identity is a pool: coding-agent and every coding-agent-<n> (one per machine)
// belong to it, so they share its icon, its place in the Agent filter and the queue views (bui-k44.19).
// No server or browser needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/agents.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { AGENT_PRESETS, defaultAgents, normalizeAgents, agentByName, validateAgents } = exports;

// The pool is a pre-defined identity, first in the list and on by default.
assert.deepEqual(Array.from(AGENT_PRESETS.map((p) => p.id).slice(0, 2)), ['coding-agent', 'claude-code']);
const pool = AGENT_PRESETS[0];
assert.equal(pool.name, 'coding-agent');
assert.equal(pool.pool, true);
assert.equal(pool.enabled, true);
assert.equal(AGENT_PRESETS.filter((p) => p.pool).length, 1, 'only the coding-agent preset is a pool');

// An older config without the entry gets it, switched on, ahead of the others.
const old = normalizeAgents([{ id: 'claude-code', name: 'claude-code', enabled: true }, { id: 'codex', name: 'codex', enabled: false }]);
assert.deepEqual(Array.from(old.map((a) => a.id).slice(0, 3)),['coding-agent', 'claude-code', 'codex']);
assert.equal(old[0].enabled, true);

const agents = defaultAgents();
const idOf = (name) => agentByName(agents, name)?.id;

// The pool's own name and every numbered member map to it, whatever the case.
for (const name of ['coding-agent', 'Coding-Agent', ' coding-agent ', 'coding-agent-0', 'coding-agent-1', 'coding-agent-12', 'CODING-AGENT-3']) {
  assert.equal(idOf(name), 'coding-agent', name);
}
// Anything else does not, so a person or another agent is never swallowed by the pool.
for (const name of ['coding-agent-', 'coding-agent-x', 'coding-agent-1a', 'coding-agent-1-2', 'coding-agent1', 'my-coding-agent-1', 'coding-agents', '', null, undefined]) {
  assert.equal(idOf(name), undefined, String(name));
}
// The other identities still match exactly, and not by prefix.
assert.equal(idOf('claude-code'), 'claude-code');
assert.equal(idOf('claude-code-1'), undefined);
assert.equal(idOf('codex'), 'codex');

// An identity named exactly like a member keeps that member.
const own = [...agents, { id: 'custom-x', name: 'coding-agent-7', enabled: true }];
assert.equal(agentByName(own, 'coding-agent-7')?.id, 'custom-x');
assert.equal(agentByName(own, 'coding-agent-8')?.id, 'coding-agent');

// Renaming the pool moves the family with it.
const renamed = agents.map((a) => (a.id === 'coding-agent' ? { ...a, name: 'bot' } : a));
assert.equal(agentByName(renamed, 'bot-2')?.id, 'coding-agent');
assert.equal(agentByName(renamed, 'coding-agent-2'), undefined);

// A custom identity is never a pool, even if a config file says so.
const sneaky = normalizeAgents([{ id: 'custom-a', name: 'swarm', enabled: true, pool: true }]).find((a) => a.id === 'custom-a');
assert.equal(agentByName([sneaky], 'swarm-1'), undefined);

assert.equal(validateAgents(agents, ['Sai']), null);
console.log('agent pool ok');
