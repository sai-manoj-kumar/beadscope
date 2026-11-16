// Run only against an isolated demo server; project data is intercepted and never written.
// Focus view's Agent filter (bui-6v3.1): one chip per enabled agent identity narrows every
// column to the beads assigned to that agent, and shows all priorities in "Next up".
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, 'Set BEADSCOPE_TEST_URL to an isolated demo server');
const bead = (id, extra = {}) => ({ id, title: id, status: 'open', issue_type: 'task', priority: 1,
  labels: [], dependencies: [], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-08T00:00:00Z', ...extra });
const beads = [
  bead('cc-flight', { status: 'in_progress', assignee: 'claude-code' }),
  bead('cc-low', { priority: 3, assignee: 'Claude-Code' }), // name match ignores case; P3 must still show for the agent
  bead('cc-blocked', { status: 'blocked', assignee: 'claude-code' }),
  bead('codex-flight', { status: 'in_progress', assignee: 'codex' }),
  bead('human-flight', { status: 'in_progress', assignee: 'reviewer' }),
  bead('human-low', { priority: 3, assignee: 'reviewer' }),
  bead('unassigned-p1'),
];
const agents = [
  { id: 'claude-code', name: 'claude-code', enabled: true },
  { id: 'codex', name: 'codex', enabled: true },
  { id: 'gemini', name: 'gemini', enabled: false },
];
const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let metaAgents = agents;
  await page.route('**/api/p/demo/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/beads/stream')) return route.abort();
    if (path.endsWith('/beads')) return route.fulfill({ json: { beads, meta: {
      kind: 'demo', readOnly: true, pollIntervalMs: 1000, humanActor: 'reviewer', humanAllowlist: ['reviewer'], agents: metaAgents,
    } } });
    return route.fulfill({ json: beads.find(b => path.endsWith(`/beads/${b.id}`)) ?? {} });
  });
  await page.goto(`${base}/p/demo?view=focus`);
  const group = page.getByRole('group', { name: 'Agent queue' });
  await group.waitFor();
  const chip = name => group.getByRole('button', { name, exact: true });
  const ids = async column => page.locator(`[data-focus-column="${column}"] [data-keyboard-bead-id]`).evaluateAll(es => es.map(e => e.dataset.keyboardBeadId).sort());

  // Only enabled identities get a chip, each with its icon; All starts selected.
  assert.deepEqual(await group.getByRole('button').allTextContents(), ['All', 'claude-code', 'codex']);
  assert.equal(await group.locator('[data-agent-icon]').count(), 2);
  assert.equal(await chip('All').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await ids('next'), ['unassigned-p1'], 'unfiltered Next up stays P0/P1');

  // One agent: its own beads in every column, any priority in Next up.
  await chip('claude-code').click();
  assert.equal(await chip('claude-code').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await ids('flight'), ['cc-flight']);
  assert.deepEqual(await ids('blocked'), ['cc-blocked']);
  assert.deepEqual(await ids('next'), ['cc-low']);
  assert.match(await page.locator('[data-focus-column="next"]').first().innerText(), /any priority/);

  await chip('codex').click();
  assert.deepEqual(await ids('flight'), ['codex-flight']);
  assert.deepEqual(await ids('next'), []);

  // Clicking the selected chip clears it; All shows everything again.
  await chip('codex').click();
  assert.deepEqual(await ids('flight'), ['cc-flight', 'codex-flight', 'human-flight']);

  // Group by Assignee shows the agent's icon beside its name, and none for a person.
  await page.getByRole('combobox', { name: 'Group by' }).selectOption('assignee');
  assert.equal(await page.locator('section[aria-label="Assignee: claude-code"] [data-agent-icon="claude-code"]').count(), 1);
  assert.equal(await page.locator('section[aria-label="Assignee: reviewer"] [data-agent-icon]').count(), 0);
  await page.getByRole('combobox', { name: 'Group by' }).selectOption('none');

  // An agent switched off in Settings loses its chip; a selected one falls back to All.
  await chip('claude-code').click();
  metaAgents = agents.map(a => (a.id === 'claude-code' ? { ...a, enabled: false } : a));
  await page.reload();
  await group.waitFor();
  assert.deepEqual(await group.getByRole('button').allTextContents(), ['All', 'codex']);
  assert.deepEqual(await ids('flight'), ['cc-flight', 'codex-flight', 'human-flight']);

  // No enabled agents: the filter is not shown.
  metaAgents = [];
  await page.reload();
  await page.getByRole('heading', { name: 'Focus', exact: true }).waitFor();
  assert.equal(await page.getByRole('group', { name: 'Agent queue' }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Agent queue passes');
} finally { await browser.close(); }
