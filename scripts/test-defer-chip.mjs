// A bead's defer date shows on list rows and board cards while it is still ahead, and on a read-only
// server the drawer shows it but cannot change it. Uses intercepted fixtures; no project data is read.
//
// Needs an isolated read-only demo server (npm run test:browser starts one).
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated demo server");
const mk = (id, extra) => ({
  id, title: `Bead ${id}`, status: "open", issue_type: "task", priority: 2, labels: [], dependencies: [], comments: [],
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...extra,
});
const beads = [
  mk("def-later", { status: "deferred", defer_until: "2099-12-31T09:05:00Z" }), // deferred and far ahead: chip
  mk("def-open", { defer_until: "2099-12-31T09:05:00Z" }), // open with a future defer date: chip
  mk("def-past", { defer_until: "2020-01-02T15:30:00Z" }), // date passed: bd treats it as ready, no chip
  mk("def-none", { status: "deferred" }), // deferred, no date: no chip
  mk("def-done", { status: "closed", closed_at: "2026-09-02T00:00:00Z", defer_until: "2099-12-31T09:05:00Z" }), // closed: no chip
  mk("def-bad", { defer_until: "not a date" }), // unreadable: treated as no date
];
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
const errors = [];
try {
  // UTC so the formatted times below do not depend on the machine running the test.
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: "UTC", locale: "en-US" });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) return route.fulfill({ json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000 } } });
    const id = path.split("/").pop();
    return route.fulfill({ json: beads.find((b) => b.id === id) ?? {} });
  });

  const expectChips = async (view) => {
    await page.goto(`${base}/p/demo?view=${view}`);
    const card = (id) => page.locator(`[data-keyboard-bead-id="${id}"]`);
    await card("def-later").waitFor();
    const chip = (id) => card(id).getByTestId("defer-chip");
    assert.equal((await chip("def-later").textContent())?.trim(), "Deferred until Dec 31, 2099, 9:05 AM", `${view}: a deferred bead shows its defer date and time`);
    assert.equal((await chip("def-open").textContent())?.trim(), "Deferred until Dec 31, 2099, 9:05 AM", `${view}: an open bead with a future defer date shows it`);
    for (const id of ["def-past", "def-none", "def-bad"]) assert.equal(await chip(id).count(), 0, `${view}: ${id} has no chip`);
    // A closed bead is hidden by default; it may not be on screen at all, which is also "no chip".
    assert.equal(await card("def-done").getByTestId("defer-chip").count(), 0, `${view}: a closed bead has no chip`);
  };
  await expectChips("list");
  const shots = process.env.DEFER_SCREENSHOT_DIR;
  if (shots) await page.screenshot({ path: `${shots}/list-defer-chip.png` });
  await expectChips("board");
  if (shots) await page.screenshot({ path: `${shots}/board-defer-chip.png` });

  // Read-only drawer: the saved defer date is shown, but the field is locked and has no Clear button.
  await page.goto(`${base}/p/demo?bead=def-later`);
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const field = dialog.getByTestId("defer-field");
  assert.equal(await field.locator("input").inputValue(), "2099-12-31T09:05", "the drawer shows the defer date");
  assert.equal(await field.locator("input").isDisabled(), true, "a read-only server cannot edit the defer date");
  assert.equal(await dialog.getByRole("button", { name: "Clear defer date" }).count(), 0, "no Clear button on a read-only server");
  // With no defer date the field is not shown at all (nothing to see, nothing to edit).
  await page.goto(`${base}/p/demo?bead=def-none`);
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.getByTestId("defer-field").count(), 0, "no defer date on a read-only server, no field");

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS defer chip: shown on list rows and board cards, locked in a read-only drawer");
} finally {
  await browser.close();
}
