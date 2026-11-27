// A status pill ("In progress") stays on one line. When its row is too narrow it is cut short with an
// ellipsis instead of wrapping onto a second line. Uses intercepted fixtures; no project data is read.
//
// Needs an isolated read-only demo server (npm run test:browser starts one).
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated demo server");
const bead = {
  id: "chip-1", title: "Bead chip-1", status: "in_progress", issue_type: "task", priority: 2, labels: [], dependencies: [], comments: [],
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
const errors = [];
try {
  for (const width of [320, 360, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/p/demo/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/beads/stream")) return route.abort();
      if (path.endsWith("/beads")) return route.fulfill({ json: { beads: [bead], meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000 } } });
      return route.fulfill({ json: bead });
    });
    await page.goto(`${base}/p/demo?bead=chip-1`);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const chip = dialog.locator('span[title="In progress"]').first();
    await chip.waitFor();

    const lines = () => chip.evaluate((el) => {
      const line = parseFloat(getComputedStyle(el).lineHeight) || el.clientHeight;
      return { rows: Math.round((el.clientHeight - 2) / line), text: el.textContent };
    });
    const natural = await lines();
    assert.equal(natural.rows, 1, `${width}px: the pill is one line`);
    assert.equal(natural.text, "In progress", `${width}px: the full label shows when there is room`);

    // Squeeze the pill's parent so there is no room: the label is clipped with an ellipsis on one line.
    await chip.evaluate((el) => {
      const parent = el.parentElement;
      parent.style.width = "64px";
      parent.style.flex = "none";
      parent.style.flexWrap = "nowrap";
      parent.style.overflow = "hidden";
    });
    const squeezed = await chip.evaluate((el) => {
      const inner = el.firstElementChild;
      const line = parseFloat(getComputedStyle(el).lineHeight) || el.clientHeight;
      return {
        rows: Math.round((el.clientHeight - 2) / line),
        clipped: inner.scrollWidth > inner.clientWidth,
        ellipsis: getComputedStyle(inner).textOverflow,
        narrow: el.getBoundingClientRect().width <= 64,
      };
    });
    assert.equal(squeezed.rows, 1, `${width}px: a squeezed pill stays on one line`);
    assert.equal(squeezed.ellipsis, "ellipsis", `${width}px: a squeezed pill truncates with an ellipsis`);
    assert.equal(squeezed.clipped, true, `${width}px: the squeezed label is cut short`);
    assert.equal(squeezed.narrow, true, `${width}px: the squeezed pill shrinks to fit its row`);
    await context.close();
  }
  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS status chip: one line at every phone width, truncated with an ellipsis when squeezed");
} finally {
  await browser.close();
}
