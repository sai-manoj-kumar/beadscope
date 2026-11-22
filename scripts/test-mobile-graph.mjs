// Graph is desktop only (bead bui-4e1.8): a phone does not offer it in the nav sheet or the command
// palette, a link or saved view for it lands on the default view, and resizing across the breakpoint
// falls back. Desktop keeps it.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
// A phone that is sent away from the Graph lands on the default page, which is Epics.
const board = (page) => page.getByRole("heading", { name: "Epics", exact: true });
const graph = (page) => page.getByRole("heading", { name: "Dependency graph", exact: true });
try {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();

  // A direct link to the graph lands on Board.
  await page.goto(`${base}/p/demo?view=graph`, { waitUntil: "domcontentloaded" });
  await board(page).waitFor();
  assert.equal(await graph(page).count(), 0, "phone never renders the Graph view");

  // The nav sheet has no Graph item but keeps the other views.
  const menu = page.getByRole("button", { name: "Open navigation and project menu" });
  const sheetTitle = page.getByRole("heading", { name: "Project and view navigation", exact: true });
  for (let i = 0; i < 20 && !(await sheetTitle.isVisible()); i++) { await menu.click(); await page.waitForTimeout(500); }
  await sheetTitle.waitFor();
  const sheet = page.locator('[data-slot="sheet-content"]');
  assert.equal(await sheet.getByRole("button", { name: "Graph", exact: true }).count(), 0, "nav sheet has no Graph");
  for (const name of ["Focus", "Board", "List", "Epics", "Insights", "Settings"]) {
    assert.equal(await sheet.getByRole("button", { name: new RegExp(`^${name}`) }).count(), 1, `nav sheet keeps ${name}`);
  }
  await page.keyboard.press("Escape");
  await sheetTitle.waitFor({ state: "detached" });

  // The command palette does not list Graph.
  await page.getByRole("button", { name: "Search and commands" }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole("dialog").getByText("Graph", { exact: true }).count(), 0, "palette has no Graph");
  await phone.close();

  // Desktop keeps it, and shrinking the window while on it falls back to Board.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await desk.newPage();
  await d.goto(`${base}/p/demo?view=graph`, { waitUntil: "domcontentloaded" });
  await graph(d).waitFor();
  assert.equal(await d.getByRole("button", { name: "Graph", exact: true }).count(), 1, "desktop sidebar keeps Graph");
  await d.setViewportSize({ width: 390, height: 844 });
  await board(d).waitFor();
  assert.equal(await graph(d).count(), 0, "Graph is gone after shrinking to phone width");
  await d.setViewportSize({ width: 1280, height: 800 });
  await graph(d).waitFor();
  await desk.close();
} finally {
  await browser.close();
}
console.log("mobile graph: ok");
