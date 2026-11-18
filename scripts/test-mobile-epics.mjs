// Phone Epics view (bead bui-4e1.5): the card keeps a readable title, progress and Details button
// inside the screen; the header does not clip. Desktop keeps the one-row card.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/p/demo?view=epics`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Epics", exact: true }).waitFor();
    const card = page.locator("section", { has: page.getByRole("button", { name: /^Open details for / }) }).first();
    await card.waitFor();
    await page.waitForTimeout(400);
    const where = `@${width}px`;

    const title = card.locator("div.text-section").first();
    const t = await title.boundingBox();
    assert.ok(t.width >= 170, `${where} epic title keeps a readable width, got ${t.width}`);
    const lines = await title.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    assert.ok(lines <= 3, `${where} epic title on at most 3 lines, got ${lines}`);

    const details = card.getByRole("button", { name: /^Open details for / });
    const d = await details.boundingBox();
    assert.ok(d.height >= 44, `${where} Details is 44px, got ${d.height}`);
    assert.ok(d.x >= 0 && d.x + d.width <= width, `${where} Details sits inside the screen`);

    const bar = await card.locator(".rounded-full.bg-\\[var\\(--surface-3\\)\\]").first().boundingBox();
    assert.ok(bar.width >= 200, `${where} progress bar is wide, got ${bar.width}`);

    // Open the epic's children too, then audit the whole page.
    await card.getByTitle(/Show children|Hide children/).first().click();
    await page.waitForTimeout(300);
    const a = await page.evaluate(pageAudit);
    assert.equal(a.pageScroll, false, `${where} no horizontal page scroll`);
    assert.deepEqual(a.overflow, [], `${where} past the right edge: ${a.overflow.slice(0, 3)}`);
    assert.deepEqual(a.smallTargets, [], `${where} targets under 44px: ${a.smallTargets.slice(0, 3)}`);
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/p/demo?view=epics`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Epics", exact: true }).waitFor();
  const card = page.locator("section", { has: page.getByRole("button", { name: /^Open details for / }) }).first();
  await card.waitFor();
  const title = await card.locator("div.text-section").first().boundingBox();
  const details = await card.getByRole("button", { name: /^Open details for / }).boundingBox();
  assert.ok(details.x > title.x + title.width - 1 && Math.abs(details.y - title.y) < 60, "desktop Details sits on the same row, right of the title");
  await ctx.close();
} finally {
  await browser.close();
}
console.log("mobile epics: ok");
