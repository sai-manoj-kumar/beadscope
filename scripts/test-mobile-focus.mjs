// Phone Focus view (bead bui-4e1.4): lanes stack and fold, filters wrap with 44px targets, grouped
// mode has no sideways scroll. Desktop keeps lanes side by side.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    for (const grouped of [false, true]) {
      await page.goto(`${base}/p/demo?view=focus`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Focus", exact: true }).waitFor();
      const select = page.getByLabel("Group by");
      await select.waitFor();
      await page.waitForTimeout(400);
      if (grouped) await select.selectOption("assignee");
      await page.waitForTimeout(300);
      const where = `@${width}px ${grouped ? "grouped" : "plain"}`;
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollW <= width, `${where} no horizontal page scroll (${scrollW})`);
      const over = await page.evaluate((w) => [...document.querySelectorAll("main *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !e.closest("[data-allow-x-scroll]"); }).length, width);
      assert.equal(over, 0, `${where} ${over} element(s) past the right edge`);
      const gb = await select.boundingBox();
      assert.ok(gb.height >= 44, `${where} Group by select is 44px, got ${gb.height}`);
      const rf = await page.getByRole("button", { name: "Recently finished" }).boundingBox();
      assert.ok(rf.height >= 44, `${where} Recently finished is 44px, got ${rf.height}`);
      if (!grouped) {
        const cols = page.locator("[data-focus-column]");
        const n = await cols.count();
        assert.ok(n >= 3, `${where} lanes render (${n})`);
        let prev = -1;
        for (let i = 0; i < n; i++) {
          const b = await cols.nth(i).boundingBox();
          assert.ok(b.y > prev, `${where} lane ${i} stacks below the previous one`);
          assert.ok(b.x >= 0 && b.x + b.width <= width + 0.5, `${where} lane ${i} fits`);
          prev = b.y;
        }
        const toggle = cols.first().locator("button[aria-expanded]");
        const open = await toggle.getAttribute("aria-expanded");
        await toggle.click();
        assert.notEqual(await toggle.getAttribute("aria-expanded"), open, `${where} lane header folds`);
      }
    }
    await ctx.close();
  }
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await d.newPage();
  await page.goto(`${base}/p/demo?view=focus`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Focus", exact: true }).waitFor();
  const cols = page.locator("[data-focus-column]");
  await cols.first().waitFor();
  const a = await cols.nth(0).boundingBox();
  const c = await cols.nth(1).boundingBox();
  assert.ok(Math.abs(a.y - c.y) < 2 && c.x > a.x, "desktop lanes sit side by side");
  await d.close();
} finally {
  await browser.close();
}
console.log("mobile focus: ok");
