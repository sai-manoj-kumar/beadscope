// The icon before an assignee (or comment author, or the signed-in actor) is the same everywhere:
// an agent identity such as claude-code shows its mark, not coloured initials (bui-ih7.2).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, 'Set BEADSCOPE_TEST_URL to an isolated demo server');
const bead = (id, extra = {}) => ({
  id, title: `Task ${id}`, status: 'open', issue_type: 'task', priority: 2, labels: [], dependencies: [],
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...extra,
});
const epic = bead('ic-epic', { issue_type: 'epic', title: 'Icon epic' });
const child = bead('ic-child', {
  assignee: 'claude-code', title: 'Child task', dependencies: [{ id: 'ic-epic', dependency_type: 'parent-child' }],
  comments: [{ id: 1, issue_id: 'ic-child', author: 'claude-code', text: 'agent comment', created_at: '2026-09-02T00:00:00Z' }],
});
const person = bead('ic-person', { assignee: 'Alice', title: 'Person task' });
// Machines of the coding-agent pool: coding-agent-<n> share the pool's icon.
const pooled = bead('ic-pool', { assignee: 'coding-agent-1', title: 'Pool task', comments: [{ id: 2, issue_id: 'ic-pool', author: 'coding-agent-2', text: 'pool comment', created_at: '2026-09-02T00:00:00Z' }] });
const lookalike = bead('ic-look', { assignee: 'coding-agent-x', title: 'Lookalike task' });
const beads = [epic, child, person, pooled, lookalike];
const agents = [{ id: 'coding-agent', name: 'coding-agent', enabled: true }, { id: 'claude-code', name: 'claude-code', enabled: true }];
const meta = { kind: 'demo', humanActor: 'Alice', humanAllowlist: ['Alice'], agents, pollIntervalMs: 300000 };

const browser = await chromium.launch();
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/p/demo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/beads/stream')) return route.abort();
    if (path.endsWith('/beads')) return route.fulfill({ json: { beads, meta } });
    const one = beads.find((b) => path.endsWith(`/beads/${b.id}`));
    return route.fulfill({ json: one ?? {} });
  });

  // `where` is a locator for the row/card holding the assignee; it must show the agent mark, never initials.
  const agentMark = async (where, what) => {
    await where.locator('[data-agent-icon="claude-code"]').first().waitFor();
    assert.equal(await where.locator('[data-agent-icon="claude-code"] svg').count() > 0, true, `${what}: shows the claude-code mark`);
    assert.ok(!(await where.innerText()).includes('CL\n'), `${what}: no CL initials`);
  };

  await page.goto(`${base}/p/demo?view=board`);
  await agentMark(page.locator('[data-keyboard-bead-id="ic-child"]').first(), 'board card');

  await page.goto(`${base}/p/demo?view=list`);
  await agentMark(page.getByText('Child task').first().locator('xpath=ancestor::*[.//*[@data-agent-icon]][1]'), 'list row');

  await page.goto(`${base}/p/demo?view=epics`);
  await agentMark(page.getByText('Child task').first().locator('xpath=ancestor::*[.//*[@data-agent-icon]][1]'), 'epics row');

  // coding-agent-<n> shows the pool mark (not Claude Code's, not initials); a name that only looks like it does not.
  await page.goto(`${base}/p/demo?view=list`);
  const row = (title) => page.getByText(title).first().locator('xpath=ancestor::*[.//*[@data-agent-icon or text()="CA"]][1]');
  await row('Pool task').locator('[data-agent-icon="coding-agent"]').first().waitFor();
  assert.equal(await row('Pool task').locator('[data-agent-icon="claude-code"]').count(), 0, 'pool member does not get the Claude Code mark');
  await row('Lookalike task').getByText('CA', { exact: true }).waitFor();
  assert.equal(await row('Lookalike task').locator('[data-agent-icon]').count(), 0, 'coding-agent-x is not a pool member');

  // The human's own initials still work for a non-agent name.
  await page.goto(`${base}/p/demo?view=list`);
  const alice = page.getByText('Person task').first().locator('xpath=ancestor::*[.//*[@data-agent-icon or text()="AL"]][1]');
  await alice.getByText('AL', { exact: true }).waitFor();

  // Drawer: the comment author's icon matches too.
  await page.goto(`${base}/p/demo?bead=ic-child`);
  await agentMark(page.getByRole('dialog').getByTestId('comment-list'), 'drawer comment');
  await page.goto(`${base}/p/demo?bead=ic-pool`);
  await page.getByRole('dialog').getByTestId('comment-list').locator('[data-agent-icon="coding-agent"]').first().waitFor();

  assert.deepEqual(errors, [], 'no page errors');
  console.log('assignee icons ok');
} finally {
  await browser.close();
}
