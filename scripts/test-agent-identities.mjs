import assert from 'node:assert/strict';
import { chromium } from 'playwright';
// Agent identities (bui-6v3.2): Settings lists them with a checkbox, an editable name and an
// icon; only the checked ones are offered when assigning; new ones can be added at run time.
// Runs against the isolated demo server and puts the config back before it exits, because the
// browser suites share one server.
const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, 'Set BEADSCOPE_TEST_URL to an isolated app server');
const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

const put = (ctx, data) => ctx.request.put(`${base}/api/config`, { data });
const config = async (ctx) => (await ctx.request.get(`${base}/api/config`)).json();
const metaAgents = async (ctx) => (await (await ctx.request.get(`${base}/api/p/demo/beads`)).json()).meta.agents;

try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await ctx.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });

  // 1. The pre-defined identities exist; only Claude Code is on by default.
  const initial = await config(ctx);
  assert.deepEqual(initial.agents.map((a) => a.id), ['claude-code', 'codex', 'cursor', 'gemini', 'copilot']);
  assert.deepEqual(initial.agents.filter((a) => a.enabled).map((a) => a.name), ['claude-code']);
  assert.deepEqual((await metaAgents(ctx)).filter((a) => a.enabled).map((a) => a.name), ['claude-code']);

  // 2. Settings shows each one with a checkbox, an editable name and its icon.
  await page.goto(`${base}/p/demo?view=settings`);
  const row = (id) => page.locator(`[data-agent-row="${id}"]`);
  await row('claude-code').waitFor();
  assert.equal(await row('claude-code').locator('input[type=checkbox]').isChecked(), true);
  assert.equal(await row('codex').locator('input[type=checkbox]').isChecked(), false);
  assert.equal(await row('claude-code').locator('svg').count(), 1, 'a pre-defined agent shows its standard icon');
  assert.equal(await row('claude-code').getByLabel('Name of Claude Code').inputValue(), 'claude-code');

  // 3. Checking one takes effect with no restart, and it is offered in the assignee picker.
  await row('codex').locator('input[type=checkbox]').check();
  await page.waitForFunction(async () => (await (await fetch('/api/config')).json()).agents.find((a) => a.id === 'codex').enabled);
  assert.deepEqual((await metaAgents(ctx)).filter((a) => a.enabled).map((a) => a.name), ['claude-code', 'codex']);

  // 4. Add a new identity at run time, then pick a stock emoji for it.
  await page.getByLabel('Name of a new agent').fill('my-agent');
  await page.getByRole('button', { name: 'Add agent' }).click();
  const custom = page.locator('[data-agent-row^="custom-"]');
  await custom.waitFor();
  assert.equal(await custom.getByLabel('Name of my-agent').inputValue(), 'my-agent');
  assert.equal((await custom.locator('[data-agent-icon]').textContent()).trim(), 'MA', 'initials on a colour until an emoji is picked');
  await custom.getByRole('button', { name: 'Choose icon for my-agent' }).click();
  await custom.getByRole('button', { name: 'Emoji 🦊' }).click();
  await custom.locator('[data-agent-icon]', { hasText: '🦊' }).waitFor();
  await custom.getByRole('button', { name: 'Colour #22c55e' }).click();
  await custom.locator('[data-agent-icon]', { hasText: 'MA' }).waitFor();

  // 5. The assignee picker offers the checked identities (and not the unchecked ones).
  const pickerNames = async () => {
    await page.goto(`${base}/p/demo?bead=bd-3c71.1`);
    // bd-3c71.1 is assigned to "cursor-agent", which is an identity that is switched off: it still has its icon.
    await page.locator('button[aria-label="Change assignee"] [data-agent-icon="cursor"]').waitFor();
    await page.getByRole('button', { name: 'Change assignee' }).click();
    return page.getByRole('option').locator('span.truncate').allInnerTexts();
  };
  let names = await pickerNames();
  for (const n of ['claude-code', 'codex', 'my-agent']) assert.ok(names.includes(n), `${n} is offered: ${names}`);
  assert.ok(!names.includes('gemini'), 'an unchecked identity is not offered');

  // The create modal's dropdown shows each agent with its icon too (a native select cannot).
  await page.goto(`${base}/p/demo?view=board`);
  await page.getByRole('heading', { name: 'Board', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Read Only Mode', exact: true }).waitFor({ state: 'detached' });
  // The heading renders before React attaches the keyboard handler, so a key pressed too early is lost: press again until the dialog opens.
  await page.waitForFunction(() => {
    if (document.querySelector('[role="dialog"]')) return true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    return false;
  }, null, { polling: 250, timeout: 20000 });
  await page.getByRole('dialog').waitFor();
  await page.getByRole('combobox', { name: 'Assignee' }).click();
  const choices = page.getByRole('listbox', { name: 'Assignee' }).getByRole('option');
  const shown = await choices.locator('span.truncate').allInnerTexts();
  assert.equal(shown[0], 'Unassigned');
  assert.ok(shown.includes('codex') && shown.includes('claude-code') && !shown.includes('gemini'), String(shown));
  assert.equal(await choices.locator('[data-agent-icon="codex"]').count(), 1, 'codex shows its icon in the create dropdown');
  assert.equal(await choices.locator('[data-agent-icon="claude-code"]').count(), 1);
  await choices.filter({ hasText: 'codex' }).click();
  assert.match(await page.getByRole('combobox', { name: 'Assignee' }).innerText(), /codex/);
  await page.keyboard.press('Escape');

  // 6. Unchecking removes it from the picker..
  await page.goto(`${base}/p/demo?view=settings`);
  await row('codex').locator('input[type=checkbox]').uncheck();
  await page.waitForFunction(async () => !(await (await fetch('/api/config')).json()).agents.find((a) => a.id === 'codex').enabled);
  names = await pickerNames();
  assert.ok(!names.includes('codex'), 'codex is no longer offered');
  assert.ok(names.includes('claude-code'));

  // 7. Names are editable and stay editable after a reload.
  await page.goto(`${base}/p/demo?view=settings`);
  const nameBox = page.locator('[data-agent-row^="custom-"]').getByLabel('Name of my-agent');
  await nameBox.fill('renamed-agent');
  await nameBox.press('Enter');
  await page.waitForFunction(async () => (await (await fetch('/api/config')).json()).agents.some((a) => a.name === 'renamed-agent'));
  await page.reload();
  await page.locator('[data-agent-row^="custom-"]').getByLabel('Name of renamed-agent').waitFor();

  // 8. Bad names are refused with a reason; nothing is saved.
  const before = JSON.stringify((await config(ctx)).agents);
  const agents = (await config(ctx)).agents;
  const dup = await put(ctx, { agents: agents.map((a) => (a.id === 'codex' ? { ...a, name: 'Claude-Code' } : a)) });
  assert.equal(dup.status(), 400);
  assert.match((await dup.json()).error, /used twice/);
  const human = await put(ctx, { agents: agents.map((a) => (a.id === 'codex' ? { ...a, name: initial.humanActor } : a)) });
  assert.equal(human.status(), 400);
  assert.match((await human.json()).error, /human name/);
  const blank = await put(ctx, { agents: agents.map((a) => (a.id === 'codex' ? { ...a, name: '   ' } : a)) });
  assert.equal(blank.status(), 400);
  assert.equal(JSON.stringify((await config(ctx)).agents), before);

  // 9. A custom identity can be removed; the pre-defined ones have no Remove button.
  assert.equal(await row('claude-code').getByRole('button', { name: /^Remove/ }).count(), 0);
  await page.locator('[data-agent-row^="custom-"]').getByRole('button', { name: 'Remove renamed-agent' }).click();
  await page.locator('[data-agent-row^="custom-"]').waitFor({ state: 'detached' });

  assert.deepEqual(errors, []);
  console.log('Agent identities pass');
} finally {
  const ctx = await browser.newContext();
  await put(ctx, { agents: [] }); // normalizes to the defaults: presets only, Claude Code on
  await browser.close();
}
