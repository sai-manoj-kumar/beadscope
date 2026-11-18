// Phone launcher (bead bui-4e1.15): Remove from list is visible and 44px without hover, every card
// aligns its path the same way, and there is no empty band under the path.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const projects = [
  { id: "demo", name: "Demo", path: null, hasBeads: true },
  { id: "short", name: "short", path: "/Users/me/short", hasBeads: true },
  { id: "long", name: "long-project", path: "/Users/someone/projects/a/deeply/nested/folder/long-project", hasBeads: true },
];
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.route("**/api/projects", (route) => route.fulfill({ json: { projects } }));
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const where = `@${width}px`;
    const remove = page.getByRole("button", { name: /^Remove .* from list$/ });
    await remove.first().waitFor();
    await page.waitForTimeout(400);
    assert.equal(await remove.count(), 2, `${where} one Remove per project card`);
    for (let i = 0; i < 2; i++) {
      const b = await remove.nth(i).boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, `${where} Remove is 44px, got ${b.width}x${b.height}`);
      const opacity = await remove.nth(i).evaluate((el) => getComputedStyle(el).opacity);
      assert.equal(opacity, "1", `${where} Remove is visible without hover`);
    }
    // Same path alignment on every card.
    const aligns = await page.locator("[title^='/Users']").evaluateAll((els) => els.map((e) => getComputedStyle(e).textAlign));
    assert.deepEqual([...new Set(aligns)], ["left"], `${where} paths are left-aligned on every card: ${aligns}`);
    // No empty band: the card ends right after its path line.
    const gaps = await page.locator("[title^='/Users']").evaluateAll((els) => els.map((e) => {
      const card = e.closest("[role=button]").getBoundingClientRect();
      return Math.round(card.bottom - e.getBoundingClientRect().bottom);
    }));
    for (const g of gaps) assert.ok(g <= 24, `${where} no dead band under the path, got ${g}px`);
    const a = await page.evaluate(pageAudit);
    assert.equal(a.pageScroll, false, `${where} no horizontal page scroll`);
    assert.deepEqual(a.overflow, [], `${where} past the right edge: ${a.overflow.slice(0, 3)}`);
    assert.deepEqual(a.smallTargets, [], `${where} targets under 44px: ${a.smallTargets.slice(0, 4)}`);
    await ctx.close();
  }
  // Desktop: the control stays hidden until hover and cards keep their uniform height.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects } }));
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const remove = page.getByRole("button", { name: /^Remove .* from list$/ }).first();
  await remove.waitFor({ state: "attached" });
  assert.equal(await remove.evaluate((el) => getComputedStyle(el).opacity), "0", "desktop Remove appears only on hover");
  const h = await remove.evaluate((el) => el.closest("[role=button]").getBoundingClientRect().height);
  assert.ok(h >= 112, `desktop cards keep the uniform minimum height, got ${h}`);
  await ctx.close();
} finally {
  await browser.close();
}
console.log("mobile launcher: ok");
