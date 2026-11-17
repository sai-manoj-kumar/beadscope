// List rows at phone width (bead bui-4e1.14): the title gets the width (it used to be cut to about
// four letters), the id and priority sit on a second line, rows do not block scrolling with
// touch-action: none, and desktop keeps one-line rows with the id before the title.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
const rowInfo = (page) =>
  page.evaluate(() => {
    const row = document.querySelector("[data-keyboard-bead-id]");
    const spans = [...row.querySelectorAll("span")];
    const title = spans.find((s) => s.className.includes("font-medium") && s.className.includes("flex-1"));
    const id = row.getAttribute("data-keyboard-bead-id");
    const idEl = [...row.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === id);
    const tr = title.getBoundingClientRect();
    const ir = idEl.getBoundingClientRect();
    return {
      touchAction: getComputedStyle(row).touchAction,
      sortable: row.getAttribute("aria-roledescription"),
      titleWidth: Math.round(tr.width),
      titleTop: Math.round(tr.top),
      idTop: Math.round(ir.top),
      idLeft: Math.round(ir.left),
      titleLeft: Math.round(tr.left),
      rowHeight: Math.round(row.getBoundingClientRect().height),
    };
  });
try {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await page.goto(`${base}/p/demo?view=list`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  await page.waitForTimeout(500);
  const m = await rowInfo(page);
  assert.ok(m.titleWidth >= 240, `phone: title must get most of the row, got ${m.titleWidth}px`);
  assert.ok(m.idTop > m.titleTop, `phone: id must be on a line below the title (${m.idTop} vs ${m.titleTop})`);
  assert.ok(m.rowHeight >= 44, `phone: row must be a 44px target, got ${m.rowHeight}`);
  assert.notEqual(m.touchAction, "none", "phone: rows must not block touch scrolling");
  assert.notEqual(m.sortable, "sortable", "phone: rows must not be draggable");
  await phone.close();

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await desktop.newPage();
  await dpage.goto(`${base}/p/demo?view=list`, { waitUntil: "domcontentloaded" });
  await dpage.locator("[data-keyboard-bead-id]").first().waitFor();
  await dpage.waitForTimeout(500);
  const d = await rowInfo(dpage);
  assert.ok(Math.abs(d.idTop - d.titleTop) < 20, `desktop: id and title share a line (${d.idTop} vs ${d.titleTop})`);
  assert.ok(d.idLeft < d.titleLeft, "desktop: id comes before the title");
  assert.equal(d.touchAction, "none", "desktop: rows keep touch-action none for drag");
  await desktop.close();
} finally {
  await browser.close();
}
console.log("mobile list: ok");
