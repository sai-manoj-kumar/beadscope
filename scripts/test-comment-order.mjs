// Comments in the bead drawer are listed newest first, with the composer above the list.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, 'Set BEADSCOPE_TEST_URL to an isolated demo server');
const comment = (id, text, created_at) => ({ id, issue_id: 'ord-a', author: 'reviewer', text, created_at });
const bead = {
  id: 'ord-a', title: 'Order ord-a', status: 'open', issue_type: 'task', priority: 2, labels: [], dependencies: [],
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  // Deliberately not in time order: the drawer must sort, not trust the API order.
  comments: [
    comment(2, 'middle comment', '2026-09-02T10:00:00Z'),
    comment(1, 'oldest comment', '2026-09-01T10:00:00Z'),
    comment(3, 'newest comment', '2026-09-03T10:00:00Z'),
  ],
};
const browser = await chromium.launch();
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/p/demo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/beads/stream')) return route.abort();
    if (path.endsWith('/beads')) return route.fulfill({ json: { beads: [bead], meta: { kind: 'demo', humanActor: 'reviewer', humanAllowlist: ['reviewer'], pollIntervalMs: 300000 } } });
    return route.fulfill({ json: path.endsWith(`/beads/${bead.id}`) ? bead : {} });
  });
  await page.goto(`${base}/p/demo?bead=ord-a`);
  const dialog = page.getByRole('dialog');
  const list = dialog.getByTestId('comment-list');
  await list.getByText('newest comment').waitFor();
  const texts = await list.locator('p, div').evaluateAll((els) =>
    els.map((e) => e.children.length === 0 ? e.textContent?.trim() : '').filter((t) => /comment$/.test(t ?? '')));
  assert.deepEqual(texts, ['newest comment', 'middle comment', 'oldest comment'], 'comments run newest to oldest');
  // The composer sits above the list, so a new comment appears right under it.
  const box = await dialog.getByPlaceholder(/Comment as/).boundingBox();
  const first = await list.getByText('newest comment').boundingBox();
  assert.ok(box && first && box.y < first.y, 'composer is above the newest comment');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('comment order ok');
} finally {
  await browser.close();
}
