// Epics screen: beads outside every epic are listed under a "No epic" section (bead bui-ih7.3).
// Isolated demo server only; project data is intercepted and never written.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated app server");

const bead = (id, title, extra = {}) => ({
  id,
  title,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});
const parent = (id, parentId) => ({ issue_id: id, depends_on_id: parentId, type: "parent-child" });

const beads = [
  bead("epic-a", "Epic A", { issue_type: "epic" }),
  bead("in-epic", "Inside the epic", { dependencies: [parent("in-epic", "epic-a")] }),
  bead("loose-open", "Loose open bead", { priority: 1 }),
  bead("loose-closed", "Loose closed bead", { status: "closed" }),
  bead("loose-archived", "Loose archived bead", { labels: ["archived"] }),
  // A task's own child is not under an epic either: the Epics screen lists direct epic children only.
  bead("task-parent", "Plain task parent", { priority: 3 }),
  bead("task-child", "Child of a plain task", { dependencies: [parent("task-child", "task-parent")] }),
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.setDefaultTimeout(7000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) {
      return route.fulfill({
        json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"] } },
      });
    }
    return route.fulfill({ json: beads.find((item) => path.endsWith(`/beads/${item.id}`)) ?? {} });
  });

  await page.goto(`${base}/p/demo?view=epics`);
  await page.getByRole("heading", { name: "Epics", exact: true }).waitFor();
  const section = page.locator("[data-no-epic-section]");
  await section.waitFor();
  const rows = () => section.locator("[data-keyboard-bead-id]");
  const domIds = () => rows().evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));
  const ids = async () => (await domIds()).sort();

  assert.ok(await section.getByText("No epic", { exact: true }).isVisible(), "section is titled No epic");
  // Expanded by default; closed and archived beads are left out, epics and epic children never appear.
  assert.deepEqual(await ids(), ["loose-open", "task-child", "task-parent"],
    "No epic lists open beads without an epic parent");
  assert.deepEqual(await domIds(), ["loose-open", "task-child", "task-parent"],
    "rows are ordered by priority, then id");
  assert.ok(await section.getByText(/3 of 4 beads/).isVisible(), "header says how many are hidden by Hide Closed");

  // The listed bead opens its drawer like any epic child.
  await section.locator('[data-keyboard-bead-id="loose-open"]').click();
  await page.getByRole("dialog").waitFor();
  await page.getByTitle("Close", { exact: true }).click();

  // Show Closed adds the closed bead, still not the archived one.
  await page.getByRole("button", { name: "Show Closed", exact: true }).click();
  assert.deepEqual(await ids(), ["loose-closed", "loose-open", "task-child", "task-parent"],
    "Show Closed adds closed beads outside an epic");

  // The header collapses and expands the list.
  const header = section.getByRole("button", { expanded: true }).first();
  await header.click();
  assert.equal(await rows().count(), 0, "collapsed section hides its rows");
  await section.getByRole("button", { expanded: false }).first().click();
  assert.equal(await rows().count(), 4, "expanded section shows its rows again");

  // With every bead in an epic the section is not rendered.
  beads.length = 0;
  beads.push(
    bead("epic-a", "Epic A", { issue_type: "epic" }),
    bead("in-epic", "Inside the epic", { dependencies: [parent("in-epic", "epic-a")] }),
  );
  await page.reload();
  await page.getByRole("heading", { name: "Epics", exact: true }).waitFor();
  await page.locator('[data-epic-id="epic-a"]').waitFor();
  assert.equal(await page.locator("[data-no-epic-section]").count(), 0, "no section when nothing is epic-less");

  assert.deepEqual(errors, []);
  console.log("PASS: No epic section lists epic-less beads, follows Hide Closed, collapses, and hides when empty");
} finally {
  await browser.close();
}
