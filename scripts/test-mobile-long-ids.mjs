// Long bead ids on a phone (found on a real iPhone, 2026-11-18): projects whose id prefix is long
// ("Steadion-iOS-qll.1") made a dependency row wider than the drawer, and the whole drawer then slid
// sideways under a finger. The demo's ids are rewritten to long ones; the drawer, the list and the
// board must still fit, and no vertical scroller may be able to pan sideways.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { auditOverlay, pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const LONG = "Steadion-iOS-quality-gate-";
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const where = `@${width}px`;
    await page.route(/\/api\/p\/demo\/beads/, async (route) => {
      const req = route.request();
      const res = await route.fetch({ url: req.url().replaceAll(LONG, "bd-"), postData: req.postData()?.replaceAll(LONG, "bd-") ?? undefined });
      if (!(res.headers()["content-type"] ?? "").includes("json")) return route.fulfill({ response: res });
      await route.fulfill({ response: res, body: (await res.text()).replaceAll('"bd-', `"${LONG}`) });
    });

    for (const [view, heading] of [["board", "Board"], ["focus", "Focus"], ["epics", "Epics"], ["needsyou", "Needs You"], ["activity", "Activity"]]) {
      await page.goto(`${base}/p/demo?view=${view}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      await page.waitForTimeout(500);
      const v = await page.evaluate(pageAudit);
      assert.equal(v.pageScroll, false, `${where} ${view} with long ids: page scrolls sideways`);
      assert.deepEqual(v.overflow, [], `${where} ${view} with long ids: past the right edge: ${v.overflow.slice(0, 3)}`);
    }

    await page.goto(`${base}/p/demo?view=list`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "List", exact: true }).waitFor();
    const row = page.locator(`[data-keyboard-bead-id="${LONG}9f2a.1"]`);
    await row.waitFor();
    const list = await page.evaluate(pageAudit);
    assert.deepEqual(list.overflow, [], `${where} list with long ids: past the right edge: ${list.overflow.slice(0, 3)}`);

    await row.click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await sheet.getByText("Dependencies").first().waitFor();
    await page.waitForTimeout(400);
    const a = await auditOverlay(page, '[data-slot="sheet-content"]');
    assert.equal(a.pageScroll, false, `${where} drawer: page scrolls sideways`);
    assert.deepEqual(a.overflow, [], `${where} drawer with long ids: past the right edge: ${a.overflow.slice(0, 3)}`);

    // Nothing in the drawer may be able to slide sideways: the scroller clips instead of panning.
    const x = await sheet.locator(".bd-scroll").first().evaluate((el) => getComputedStyle(el).overflowX);
    assert.equal(x, "hidden", `${where} the drawer scroller does not pan sideways, got overflow-x: ${x}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log("mobile long ids: ok");
