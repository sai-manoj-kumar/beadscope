// Phone drawer and create modal (beads bui-4e1.7, .16, .17): the bead drawer and the New bead dialog
// take the whole screen, the id stays on one line with no focus ring, Delete sits away from Close, the
// footer keeps Cancel and Create on one row, and every control is 44px with 16px fields.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { auditOverlay } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use a throwaway writable project (BEADSCOPE_TEST_URL)");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
const problems = [];
const check = (where, a) => {
  if (a.pageScroll) problems.push(`${where}: page scrolls sideways`);
  if (a.overflow.length) problems.push(`${where}: past the right edge: ${a.overflow.slice(0, 3).join("; ")}`);
  if (a.smallInputs.length) problems.push(`${where}: fields under 16px: ${a.smallInputs.slice(0, 3).join("; ")}`);
  if (a.smallTargets.length) problems.push(`${where}: targets under 44px: ${a.smallTargets.slice(0, 4).join("; ")}`);
  for (const [size, t] of Object.entries(a.smallText)) problems.push(`${where}: ${t.length} text(s) at ${size}px, e.g. "${t[0]}"`);
};
try {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const where = `@${width}px`;
    await page.goto(`${base}/p/demo?view=list`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "List", exact: true }).waitFor();
    const row = page.locator("[data-keyboard-bead-id]").first();
    await row.waitFor();
    await page.waitForTimeout(400);

    // ---- Drawer
    await row.click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await sheet.waitFor();
    await page.waitForTimeout(500);
    const sb = await sheet.boundingBox();
    assert.ok(Math.abs(sb.width - width) <= 1 && sb.x <= 1, `${where} drawer takes the full width, got ${JSON.stringify(sb)}`);
    const idLines = await sheet.locator(".font-mono").first().evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size; });
    assert.equal(idLines, 1, `${where} drawer id stays on one line, got ${idLines}`);
    const focusVisible = await page.evaluate(() => document.querySelector(":focus-visible")?.tagName ?? null);
    assert.notEqual(focusVisible, "BUTTON", `${where} nothing in the drawer shows a focus ring on open`);
    const close = sheet.getByRole("button", { name: "Close", exact: true });
    const del = sheet.getByRole("button", { name: "Delete", exact: true });
    const cb = await close.boundingBox();
    const db = await del.boundingBox();
    assert.ok(cb.width >= 44 && cb.height >= 44, `${where} Close is 44px`);
    assert.ok(db.width >= 44 && db.height >= 44, `${where} Delete is 44px`);
    assert.ok(Math.abs(db.y - cb.y) > 20 || Math.abs(db.x - cb.x) > 120, `${where} Delete is kept away from Close`);
    check(`${where} drawer`, await auditOverlay(page, '[data-slot="sheet-content"]'));
    await close.click();
    await sheet.waitFor({ state: "detached" });

    // ---- Create modal
    await page.getByRole("button", { name: "New", exact: true }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await dialog.waitFor();
    await page.waitForTimeout(500);
    const mb = await dialog.boundingBox();
    assert.ok(Math.abs(mb.width - width) <= 1 && mb.height <= 845, `${where} New bead dialog fits the screen, got ${JSON.stringify(mb)}`);
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    const create = dialog.getByRole("button", { name: /Create bead/ });
    const cr = await cancel.boundingBox();
    const cc = await create.boundingBox();
    assert.ok(Math.abs(cr.y - cc.y) < 4, `${where} Cancel and Create share a row`);
    assert.ok(cc.height < 60, `${where} Create bead does not wrap onto two lines, got height ${cc.height}`);
    assert.ok(cc.y + cc.height <= 845, `${where} Create is on screen`);
    // Assignee list
    await dialog.getByRole("combobox", { name: "Assignee" }).click();
    const options = page.getByRole("listbox", { name: "Assignee" }).getByRole("option");
    await options.first().waitFor();
    for (const o of await options.all()) {
      const ob = await o.boundingBox();
      assert.ok(ob.height >= 44, `${where} assignee option is 44px, got ${ob.height}`);
      assert.ok(ob.x >= 0 && ob.x + ob.width <= width + 0.5, `${where} assignee option fits the screen`);
    }
    await page.keyboard.press("Escape");
    check(`${where} create dialog`, await auditOverlay(page, '[data-slot="dialog-content"]'));
    await ctx.close();
  }

  // Desktop keeps the side drawer.
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await d.newPage();
  await page.goto(`${base}/p/demo?view=list`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "List", exact: true }).waitFor();
  const row = page.locator("[data-keyboard-bead-id]").first();
  await row.waitFor();
  await page.waitForTimeout(400);
  await row.click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.waitFor();
  await page.waitForTimeout(400);
  const sb = await sheet.boundingBox();
  assert.ok(sb.width < 1200 && sb.width > 400, `desktop drawer stays a side panel, got ${sb.width}`);
  await d.close();
} finally {
  await browser.close();
}
assert.equal(problems.length, 0, `${problems.length} phone drawer/modal problem(s):\n${problems.join("\n")}`);
console.log("mobile drawer: ok");
