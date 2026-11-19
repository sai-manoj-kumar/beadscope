// Phone app shell (bead bui-4e1.2): the top bar buttons are 44px, the search button opens the
// command palette, and the nav sheet, project menu and palette fit the screen with 44px rows.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { auditOverlay } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
const problems = [];
const check = (where, a, { text = true } = {}) => {
  if (a.overflow.length) problems.push(`${where}: past the right edge: ${a.overflow.slice(0, 3).join("; ")}`);
  if (a.smallTargets.length) problems.push(`${where}: targets under 44px: ${a.smallTargets.slice(0, 4).join("; ")}`);
  if (text) for (const [size, t] of Object.entries(a.smallText)) problems.push(`${where}: ${t.length} text(s) at ${size}px, e.g. "${t[0]}"`);
};
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${base}/p/demo?view=activity`, { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Open navigation and project menu" });
  const search = page.getByRole("button", { name: "Search and commands" });
  await menu.waitFor();
  for (const [name, btn] of [["menu", menu], ["search", search]]) {
    const b = await btn.boundingBox();
    assert.ok(b.width >= 44 && b.height >= 44, `${name} button must be 44px, got ${b.width}x${b.height}`);
  }

  // Page name (bead bui-4e1.26): the top bar shows the current page, not the app name, and the
  // page's own h1 stays in the page for screen readers without being drawn a second time.
  for (const [view, name] of [["activity", "Activity"], ["epics", "Epics"], ["needsyou", "Needs You"]]) {
    await page.goto(`${base}/p/demo?view=${view}`, { waitUntil: "domcontentloaded" });
    const title = page.locator("[data-mobile-page-title]");
    await title.waitFor();
    assert.equal((await title.textContent()).trim(), name, `${view}: the top bar must name the page`);
    const h1 = page.locator("h1").first();
    await h1.waitFor();
    assert.equal((await h1.textContent()).trim(), name, `${view}: the page keeps its h1`);
    const hb = await h1.boundingBox();
    assert.ok(hb.width <= 2 && hb.height <= 2, `${view}: the h1 must be visually hidden on phones, got ${JSON.stringify(hb)}`);
    assert.equal(await page.getByText("Beadscope", { exact: true }).filter({ visible: true }).count(), 0, `${view}: the app name must not take the top bar`);
  }
  await page.goto(`${base}/p/demo?view=activity`, { waitUntil: "domcontentloaded" });
  await menu.waitFor();

  // Desktop keeps the visible h1 and has no phone top bar title
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await desktop.newPage();
  await dpage.goto(`${base}/p/demo?view=epics`, { waitUntil: "domcontentloaded" });
  const dh1 = dpage.locator("h1").first();
  await dh1.waitFor();
  const dhb = await dh1.boundingBox();
  assert.ok(dhb.width > 20 && dhb.height > 10, `desktop h1 must stay visible, got ${JSON.stringify(dhb)}`);
  assert.equal(await dpage.locator("[data-mobile-page-title]").isVisible(), false, "desktop has no phone top bar");
  await desktop.close();

  // Nav sheet
  await page.waitForTimeout(500);
  await menu.click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.waitFor();
  await page.waitForTimeout(400);
  check("nav sheet", await auditOverlay(page, '[data-slot="sheet-content"]'));

  // Project menu inside the sheet
  await page.getByRole("button", { name: /Select project/ }).click();
  const projectMenu = page.locator('[data-slot="dropdown-menu-content"]');
  await projectMenu.waitFor();
  await page.waitForTimeout(300);
  check("project menu", await auditOverlay(page, '[data-slot="dropdown-menu-content"]'));
  // Add project dialog (folder browser)
  await page.getByRole("menuitem", { name: /Add project/ }).click();
  const folders = page.locator('[data-slot="dialog-content"]');
  await folders.waitFor();
  await page.waitForTimeout(600);
  check("folder browser", await auditOverlay(page, '[data-slot="dialog-content"]'));
  await page.keyboard.press("Escape");
  await folders.waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });

  // Command palette from the top bar
  await search.click();
  const palette = page.getByRole("dialog");
  await palette.waitFor();
  await page.getByRole("combobox").or(page.locator("[cmdk-input]")).first().waitFor();
  await page.waitForTimeout(300);
  const box = await palette.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, `palette must fit the screen, got ${JSON.stringify(box)}`);
  check("command palette", await auditOverlay(page, '[role="dialog"]'));
  await context.close();
} finally {
  await browser.close();
}
assert.equal(problems.length, 0, `${problems.length} phone-shell problem(s):\n${problems.join("\n")}`);
console.log("mobile shell: ok");
