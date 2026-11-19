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
const beads = [epic, child, person];
const agents = [{ id: 'claude-code', name: 'claude-code', enabled: true }];
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

  // The human's own initials still work for a non-agent name.
  await page.goto(`${base}/p/demo?view=list`);
  const alice = page.getByText('Person task').first().locator('xpath=ancestor::*[.//*[@data-agent-icon or text()="AL"]][1]');
  await alice.getByText('AL', { exact: true }).waitFor();

  // Drawer: the comment author's icon matches too.
  await page.goto(`${base}/p/demo?bead=ic-child`);
  await agentMark(page.getByRole('dialog').getByTestId('comment-list'), 'drawer comment');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('assignee icons ok');
} finally {
  await browser.close();
}
