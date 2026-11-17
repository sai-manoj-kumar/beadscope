// Phone layout (epic bui-4e1): every view is checked at phone widths with scripts/mobile-audit.mjs.
//
// Checked on every view: the page does not scroll sideways, no visible text is under 14px, text
// fields are at least 16px (iOS zooms on focus), and the page declares a device-width viewport.
// Checked only on views that have been fixed: nothing sticks out past the right edge, and every
// button, link and field is at least 44px. When a mobile bead finishes a view, add the view to
// the lists below so it cannot regress. bui-4e1.20 (final review) needs both lists to hold all views.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { VIEWS, auditView } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");

const NO_OVERFLOW = new Set(["activity", "needsyou", "achievements", "publish", "list"]);
const TAP_TARGETS_OK = new Set([]);
const WIDTHS = [360, 390, 430];

const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
const problems = [];
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const projectUrl = `${base}/p/demo`;
    for (const view of VIEWS) {
      const a = await auditView(page, projectUrl, view);
      const at = `${view} @${width}px`;
      if (a.pageScroll) problems.push(`${at}: page scrolls sideways`);
      for (const [size, texts] of Object.entries(a.smallText)) problems.push(`${at}: ${texts.length} text node(s) at ${size}px, e.g. "${texts[0]}"`);
      for (const f of a.smallInputs) problems.push(`${at}: field under 16px: ${f}`);
      if (NO_OVERFLOW.has(view) && a.overflow.length) problems.push(`${at}: past the right edge: ${a.overflow.slice(0, 3).join("; ")}`);
      if (TAP_TARGETS_OK.has(view) && a.smallTargets.length) problems.push(`${at}: targets under 44px: ${a.smallTargets.slice(0, 3).join("; ")}`);
    }
    const viewportMeta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content"));
    assert.match(viewportMeta ?? "", /width=device-width/, "viewport meta must be device-width");
    await context.close();
  }
} finally {
  await browser.close();
}
assert.equal(problems.length, 0, `${problems.length} phone-layout problem(s):\n${problems.join("\n")}`);
console.log(`mobile layout: ok (${VIEWS.length} views × ${WIDTHS.length} widths)`);
