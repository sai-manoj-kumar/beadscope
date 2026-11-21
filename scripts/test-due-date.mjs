// A bead's due date and time show in the drawer and on list rows; an open bead past its due time is marked overdue.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, 'Set BEADSCOPE_TEST_URL to an isolated demo server');
const mk = (id, extra) => ({
  id, title: `Bead ${id}`, status: 'open', issue_type: 'task', priority: 2, labels: [], dependencies: [], comments: [],
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...extra,
});
const beads = [
  mk('due-late', { due_at: '2020-01-02T15:30:00Z' }), // open and long past: overdue
  mk('due-soon', { due_at: '2099-12-31T09:05:00Z' }), // open and far ahead: not overdue
  mk('due-none', {}),
  mk('due-done', { status: 'closed', closed_at: '2026-09-02T00:00:00Z', due_at: '2020-01-02T15:30:00Z' }), // closed: never overdue
  mk('due-bad', { due_at: 'not a date' }), // unreadable: treated as no due date
];
const browser = await chromium.launch();
const errors = [];
try {
  // UTC so the formatted times below do not depend on the machine running the test.
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'UTC', locale: 'en-US' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/p/demo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/beads/stream')) return route.abort();
    if (path.endsWith('/beads')) return route.fulfill({ json: { beads, meta: { kind: 'demo', humanActor: 'reviewer', humanAllowlist: ['reviewer'], pollIntervalMs: 300000 } } });
    const id = path.split('/').pop();
    return route.fulfill({ json: beads.find((b) => b.id === id) ?? {} });
  });

  // List rows
  await page.goto(`${base}/p/demo?view=list`);
  const row = (id) => page.locator(`[data-keyboard-bead-id="${id}"]`);
  await row('due-late').waitFor();
  assert.equal((await row('due-late').getByTestId('due-chip').textContent())?.trim(), 'Due Jan 2, 2020, 3:30 PM', 'overdue row shows the due date and time');
  assert.equal(await row('due-late').getByTestId('due-chip').getAttribute('data-overdue'), 'true', 'open bead past due is overdue');
  assert.equal((await row('due-soon').getByTestId('due-chip').textContent())?.trim(), 'Due Dec 31, 2099, 9:05 AM');
  assert.equal(await row('due-soon').getByTestId('due-chip').getAttribute('data-overdue'), null, 'future due is not overdue');
  assert.equal(await row('due-none').getByTestId('due-chip').count(), 0, 'no due date, no chip');
  assert.equal(await row('due-bad').getByTestId('due-chip').count(), 0, 'unreadable due date, no chip');
  // For a human to look at: DUE_SCREENSHOT_DIR=<dir> writes the list and the drawer.
  const shots = process.env.DUE_SCREENSHOT_DIR;
  if (shots) await page.screenshot({ path: `${shots}/list-desktop.png` });

  // Drawer
  const open = async (id) => {
    await page.goto(`${base}/p/demo?bead=${id}`);
    await page.getByRole('dialog').waitFor();
    return page.getByRole('dialog');
  };
  let dialog = await open('due-late');
  const field = dialog.getByTestId('due-field');
  assert.match((await field.textContent()) ?? '', /Jan 2, 2020, 3:30 PM/, 'drawer shows the due date and time');
  assert.match((await field.textContent()) ?? '', /Overdue/, 'drawer marks an overdue bead');
  if (shots) {
    await page.waitForTimeout(600); // let the drawer finish sliding in
    await page.screenshot({ path: `${shots}/drawer-desktop.png` });
  }
  dialog = await open('due-soon');
  assert.match((await dialog.getByTestId('due-field').textContent()) ?? '', /Dec 31, 2099, 9:05 AM/);
  assert.doesNotMatch((await dialog.getByTestId('due-field').textContent()) ?? '', /Overdue/);
  dialog = await open('due-done');
  assert.match((await dialog.getByTestId('due-field').textContent()) ?? '', /Jan 2, 2020, 3:30 PM/);
  assert.doesNotMatch((await dialog.getByTestId('due-field').textContent()) ?? '', /Overdue/, 'a closed bead is never overdue');
  dialog = await open('due-none');
  assert.equal(await dialog.getByTestId('due-field').count(), 0, 'no due date, no field');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('due date ok');
} finally {
  await browser.close();
}
