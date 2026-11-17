// Phone Board (bead bui-4e1.3): columns stack and fold, cards do not drag, tapping opens the
// drawer, the page does not scroll sideways. Desktop keeps side-by-side columns with drag.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/p/demo?view=board`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Board", exact: true }).waitFor();
    const sections = page.locator("section", { has: page.locator("button[aria-expanded]") });
    await sections.first().waitFor();
    await page.waitForTimeout(500);

    const n = await sections.count();
    assert.ok(n >= 3, `columns render (${n})`);
    const boxes = [];
    for (let i = 0; i < n; i++) boxes.push(await sections.nth(i).boundingBox());
    for (const [i, b] of boxes.entries()) {
      assert.ok(b.x >= 0 && b.x + b.width <= width + 0.5, `@${width}px column ${i} fits: x=${b.x} w=${b.width}`);
      if (i > 0) assert.ok(b.y > boxes[i - 1].y, `@${width}px column ${i} stacks below the previous one`);
    }
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scrollW <= width, `@${width}px no horizontal page scroll (${scrollW})`);

    // Folding: header toggles its list, and the headers are 44px tall.
    const first = sections.first();
    const toggle = first.locator("button[aria-expanded]");
    const tb = await toggle.boundingBox();
    assert.ok(tb.height >= 44, `@${width}px column header is 44px, got ${tb.height}`);
    const open = (await toggle.getAttribute("aria-expanded")) === "true";
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), String(!open), "header toggles the column");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), String(open), "header toggles back");

    if (width === 390) {
      // Cards do not drag and do not block touch scrolling; a tap opens the drawer.
      const card = page.locator("article[data-keyboard-bead-id]").first();
      await card.waitFor();
      assert.notEqual(await card.evaluate((el) => getComputedStyle(el).touchAction), "none", "card must not set touch-action: none");
      const before = await card.boundingBox();
      const b = before;
      await page.mouse.move(b.x + b.width / 2, b.y + 20);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 5, b.y + 140, { steps: 8 });
      await page.mouse.up();
      assert.equal(await page.locator('[aria-roledescription="sortable"]').count(), 0, "no sortable (draggable) cards on phones");
      const after = await card.boundingBox();
      assert.equal(after.y, before.y, "the card did not move");
      // Releasing on the same card is a tap, so the drawer opens.
      await page.getByRole("dialog").waitFor();
    }
    await ctx.close();
  }

  // Desktop: side by side, draggable.
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await d.newPage();
  await page.goto(`${base}/p/demo?view=board`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Board", exact: true }).waitFor();
  const cols = page.locator("section", { has: page.locator("button[aria-expanded]") });
  await cols.first().waitFor();
  const a = await cols.nth(0).boundingBox();
  const c = await cols.nth(1).boundingBox();
  assert.ok(Math.abs(a.y - c.y) < 2 && c.x > a.x, "desktop columns sit side by side");
  assert.equal(await page.locator("article[data-keyboard-bead-id]").first().evaluate((el) => getComputedStyle(el).touchAction), "none", "desktop cards keep touch-action none for dragging");
  await d.close();
} finally {
  await browser.close();
}
console.log("mobile board: ok");
