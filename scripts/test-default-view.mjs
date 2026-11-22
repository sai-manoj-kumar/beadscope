import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, 'Set BEADSCOPE_TEST_URL to an isolated demo server');
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const nav = name => page.getByRole('button', { name, exact: true }).click();
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const project = async name => { await page.goto(`${base}/p/demo`); await heading(name); };
  const select = page.getByRole('combobox', { name: 'Default page' });
  // The saved choice is read after hydration, so right after a reload the select may still show the default.
  const expectChoice = value => page.waitForFunction(
    v => [...document.querySelectorAll('select')].some(s => s.getAttribute('aria-labelledby') === 'default-page-label' && s.value === v), value);
  // Nothing saved yet: Epics. Old settings (the Focus switch, remembered views) are ignored.
  await page.goto(`${base}/p/demo`);
  await heading('Epics');
  await page.evaluate(() => {
    localStorage.setItem('beadscope.view.demo', 'focus');
    localStorage.setItem('beadscope.default-focus', 'true');
  });
  await project('Epics');
  await nav('Settings');
  assert.equal(await select.inputValue(), 'epics');
  assert.deepEqual(
    await select.locator('option').allTextContents(),
    ['Epics', 'Focus', 'List', 'Needs You', 'Agent Queue'],
  );
  // Each choice that is a view of the project opens it, on reload too; explicit view links still win.
  for (const [value, name] of [['focus', 'Focus'], ['list', 'List'], ['needsyou', 'Needs You']]) {
    await select.selectOption(value);
    assert.equal(await select.inputValue(), value);
    await page.reload();
    await heading('Settings'); // The reload stays on the explicit settings link.
    await expectChoice(value);
    await project(name);
    await nav('Board');
    await page.reload();
    await heading('Board');
    await project(name); // Visiting another view does not change the default.
    await nav('Settings');
  }
  // Agent Queue has no project view: a bare project link goes to the all-repos page.
  await select.selectOption('agent-queue');
  await page.goto(`${base}/p/demo`);
  await page.waitForURL(`${base}/agent-queue`);
  await page.getByRole('heading', { name: 'Agent Queue', exact: true }).first().waitFor();
  // A link that names a view still opens that project view.
  await page.goto(`${base}/p/demo?view=board`);
  await heading('Board');
  // Opening a bead from the queue and closing its drawer stays in the project.
  await page.goto(`${base}/p/demo?bead=bd-3c71.1`);
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.waitForTimeout(1000);
  assert.ok(new URL(page.url()).pathname.startsWith('/p/demo'), 'closing the drawer does not leave the project');
  await page.goto(`${base}/p/demo?view=settings`);
  await heading('Settings');
  await expectChoice('agent-queue');
  // Back to the Epics default.
  await select.selectOption('epics');
  await project('Epics');
  // Another browser profile has its own preference.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`${base}/p/demo`);
  await otherPage.getByRole('heading', { name: 'Epics', exact: true }).waitFor();
  await otherPage.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await otherPage.getByRole('combobox', { name: 'Default page' }).inputValue(), 'epics');
  console.log('PASS: Epics default, five-way default page, explicit view URLs and reloads, Agent Queue redirect, ignored legacy settings, browser isolation');
} finally { await browser.close(); }
