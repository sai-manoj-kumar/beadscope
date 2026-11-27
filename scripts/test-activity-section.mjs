// The bead drawer's Activity section: who made each change, a local human-readable time
// (1h ago, 2d ago, 24th Nov), newest first.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, 'Set BEADSCOPE_TEST_URL to an isolated demo server');
const bead = {
  id: 'act-a', title: 'Activity bead', status: 'open', issue_type: 'task', priority: 2, labels: [], dependencies: [],
  created_at: '2020-11-01T12:00:00Z', updated_at: '2020-11-01T12:00:00Z', created_by: 'reviewer',
};
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const item = (id, actor, action, at) => ({ id, issueId: 'act-a', title: bead.title, actor, origin: 'agent', action, at });
// The server returns newest first; the drawer must keep that order.
const items = [
  item('1', 'claude-code', 'claimed · In Progress', ago(2 * 3600e3 + 5e3)),
  item('2', 'reviewer', 'commented', ago(3 * 86400e3 + 5e3)),
  item('3', 'reviewer', 'changed priority → P1', '2020-11-24T12:00:00Z'),
  item('4', 'reviewer', 'updated title', '2020-11-11T12:00:00Z'),
  item('5', 'reviewer', 'created', '2020-11-01T12:00:00Z'),
];
const browser = await chromium.launch();
const errors = [];
let activityUrl = '';
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/p/demo/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/beads/stream')) return route.abort();
    if (path.endsWith('/activity')) { activityUrl = url.search; return route.fulfill({ json: { items } }); }
    if (path.endsWith('/beads')) return route.fulfill({ json: { beads: [bead], meta: { kind: 'demo', humanActor: 'reviewer', humanAllowlist: ['reviewer'], pollIntervalMs: 300000 } } });
    return route.fulfill({ json: path.endsWith(`/beads/${bead.id}`) ? bead : {} });
  });
  await page.goto(`${base}/p/demo?bead=act-a`);
  const list = page.getByRole('dialog').getByTestId('activity-list');
  await list.getByText('claude-code').waitFor();
  assert.equal(activityUrl, '?issue=act-a', 'the drawer asks for this bead only');
  const rows = await list.locator('> div').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(rows, [
    'claude-code claimed · In Progress2h ago',
    'reviewer commented3d ago',
    'reviewer changed priority → P124th Nov 2020',
    'reviewer updated title11th Nov 2020',
    'reviewer created1st Nov 2020',
  ], 'who, what and when, newest first');
  const title = await list.getByText('2h ago').getAttribute('title');
  assert.match(title ?? '', /\d{4}/, 'hover shows the full local date and time');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('activity section ok');
} finally {
  await browser.close();
}
