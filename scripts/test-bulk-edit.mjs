// Isolated writable server only. Uses a throwaway bd repo; skips when bd is not installed.
// Bulk edit in the List view: Cmd/Ctrl-click ticks rows (a plain click still opens the drawer), a
// bar offers Bulk edit, the dialog changes priority, assignee and status on every ticked bead and
// leaves "No change" fields and unticked beads alone. On a phone the Select button shows 44px
// checkboxes. Everything is checked against what bd stores.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated app server");
try {
  execFileSync("bd", ["--version"], { stdio: "ignore" });
} catch {
  console.log("SKIP bulk edit: bd is not installed");
  process.exit(0);
}

const json = { "Content-Type": "application/json" };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beadscope-bulk-"));
const env = { ...process.env };
delete env.BEADS_ACTOR;
const bd = (args) => execFileSync("bd", args, { cwd: dir, env, encoding: "utf8" });
const show = (id) => {
  const shown = JSON.parse(bd(["show", id, "--json"]));
  return Array.isArray(shown) ? shown[0] : shown;
};
const waitFor = async (what, check) => {
  for (let i = 0; i < 60; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(check(), what);
};

let projectId;
let browser;
try {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  bd(["init", "--prefix", "bk"]);
  const make = (title, extra = []) => JSON.parse(bd(["create", title, "-p", "2", "--json", ...extra])).id;
  const a = make("alpha bead");
  const b = make("bravo bead");
  const c = make("charlie bead");
  const d = make("delta bead", ["--assignee", "alice"]);
  const added = await fetch(`${base}/api/projects`, { method: "POST", headers: json, body: JSON.stringify({ path: dir }) });
  assert.equal(added.status, 201);
  projectId = (await added.json()).id;

  browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
  const errors = [];
  const openList = async (context) => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/p/${projectId}?view=list`);
    await page.locator(`[data-keyboard-bead-id="${a}"]`).waitFor();
    return page;
  };
  const row = (page, id) => page.locator(`[data-keyboard-bead-id="${id}"]`);
  const bar = (page) => page.getByTestId("bulk-bar");

  // Desktop.
  const desktop = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  let page = await openList(desktop);
  assert.equal(await bar(page).count(), 0, "no selection bar until something is selected");
  assert.equal(await page.getByRole("checkbox").count(), 0, "no checkboxes until selecting");

  // A plain click still opens the drawer.
  await row(page, a).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await bar(page).count(), 0, "a plain click does not select");

  // Ctrl-click and Meta-click tick rows; checkboxes appear and a plain click now ticks as well.
  // (A real Ctrl-click on macOS is a right click and fires no click event, so Ctrl is sent as a click event.)
  await row(page, a).dispatchEvent("click", { ctrlKey: true, bubbles: true });
  await bar(page).waitFor();
  await row(page, b).click({ modifiers: ["Meta"] });
  await row(page, c).click();
  await bar(page).getByText("3 selected").waitFor();
  assert.equal(await page.getByRole("checkbox", { name: `Select ${a}` }).isChecked(), true);
  assert.equal(await page.getByRole("checkbox", { name: `Select ${d}` }).isChecked(), false);
  await row(page, c).click(); // untick
  await bar(page).getByText("2 selected").waitFor();

  // Bulk edit: nothing chosen means nothing to apply.
  await bar(page).getByRole("button", { name: "Bulk edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const submit = dialog.getByRole("button", { name: /^Update 2 beads/ });
  assert.equal(await submit.isDisabled(), true, "Update stays disabled while every field is on No change");
  const shots = process.env.BULK_SCREENSHOT_DIR; // set it to also write screenshots for a person to look at
  if (shots) {
    await page.waitForTimeout(500); // let the dialog finish fading in
    await page.screenshot({ path: `${shots}/bulk-dialog-desktop.png` });
  }
  await dialog.getByLabel("Priority").selectOption("0");
  await dialog.getByLabel("Assignee").selectOption("alice");
  await submit.click();
  await dialog.waitFor({ state: "detached" });
  await waitFor("both ticked beads are P0 and assigned to alice", () => [a, b].every((id) => show(id).priority === 0 && show(id).assignee === "alice"));
  assert.equal(show(c).priority, 2, "an unticked bead keeps its priority");
  assert.ok(!show(c).assignee, "an unticked bead keeps its assignee");
  assert.equal(show(a).status, "open", "a field left on No change is not written");
  assert.equal(await bar(page).count(), 0, "the selection is cleared after a successful edit");

  // Unassign + status on a mix of beads whose assignees differ.
  await row(page, b).click({ modifiers: ["Meta"] });
  await row(page, d).click();
  await bar(page).getByRole("button", { name: "Bulk edit" }).click();
  await dialog.waitFor();
  await dialog.getByLabel("Assignee").selectOption({ label: "Unassigned" });
  await dialog.getByLabel("Status").selectOption("blocked");
  await dialog.getByRole("button", { name: /^Update 2 beads/ }).click();
  await dialog.waitFor({ state: "detached" });
  await waitFor("both beads are unassigned and blocked", () => [b, d].every((id) => !show(id).assignee && show(id).status === "blocked"));
  assert.equal(show(b).priority, 0, "priority was left alone");
  assert.equal(show(a).assignee, "alice", "a bead outside the selection is untouched");

  // Keyboard: Cmd/Ctrl+Enter on a focused row ticks it; plain Enter would open the drawer.
  await row(page, c).focus();
  await page.keyboard.press("Meta+Enter");
  await bar(page).getByText("1 selected").waitFor();
  assert.equal(await page.getByRole("checkbox", { name: `Select ${c}` }).isChecked(), true);
  await row(page, d).click();

  // One bead fails: the dialog says which, keeps it ticked, and a second try only redoes that one.
  let failD = true;
  await page.route(`**/api/p/${projectId}/beads/${d}`, (route) =>
    failD && route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) })
      : route.continue(),
  );
  await bar(page).getByRole("button", { name: "Bulk edit" }).click();
  await dialog.waitFor();
  await dialog.getByLabel("Priority").selectOption("3");
  await dialog.getByRole("button", { name: /^Update 2 beads/ }).click();
  await dialog.getByRole("alert").waitFor();
  assert.match(await dialog.getByRole("alert").innerText(), new RegExp(`1 of 2 could not be updated \\(${d}\\)`));
  await waitFor("the bead that worked is P3", () => show(c).priority === 3);
  assert.notEqual(show(d).priority, 3, "the failed bead was not changed");
  await dialog.getByRole("button", { name: /^Update 1 bead$/ }).waitFor();
  failD = false;
  await bar(page).getByText("1 selected").waitFor(); // c is unticked, d is still ticked
  // (By attribute: with the dialog open the page behind it is hidden from role queries.)
  assert.equal(await page.locator(`input[aria-label="Select ${d}"]`).isChecked(), true);

  // While writes are in flight the dialog refuses to close; it closes by itself when they finish.
  await page.route(`**/api/p/${projectId}/beads/${d}`, async (route) => {
    if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await dialog.getByRole("button", { name: /^Update 1 bead$/ }).click();
  await dialog.getByRole("button", { name: /^Updating 1 of 1/ }).waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await dialog.isVisible(), true, "Esc does not close the dialog while it is updating");
  await dialog.waitFor({ state: "detached" });
  await waitFor("the retried bead is P3", () => show(d).priority === 3);
  await page.unroute(`**/api/p/${projectId}/beads/${d}`);
  assert.equal(await bar(page).count(), 0, "nothing is left ticked");

  // Select all, then Clear.
  assert.equal(await page.getByRole("button", { name: "Select", exact: true }).isVisible(), false, "the Select button is for phones; desktop uses Cmd/Ctrl-click");
  await row(page, a).click({ modifiers: ["Meta"] });
  await bar(page).getByRole("button", { name: /^Select all/ }).click();
  await bar(page).getByText("4 selected").waitFor();
  await bar(page).getByRole("button", { name: "Clear" }).click();
  await bar(page).waitFor({ state: "detached" });
  await page.close();

  // Phone: Select shows the checkboxes, each a 44px target.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await openList(phone);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await bar(page).waitFor();
  const box = await page.getByRole("checkbox", { name: `Select ${a}` }).locator("xpath=..").boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44, `checkbox target is at least 44px (${box?.width}x${box?.height})`);
  await row(page, a).tap();
  await row(page, c).tap();
  await bar(page).getByText("2 selected").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0, "tapping in Select mode does not open the drawer");
  if (shots) await page.screenshot({ path: `${shots}/bulk-select-phone.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `the page does not scroll sideways (${overflow}px)`);
  await bar(page).getByRole("button", { name: "Bulk edit" }).tap();
  await page.getByRole("dialog").waitFor();
  if (shots) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/bulk-dialog-phone.png` });
  }
  await page.getByRole("dialog").getByLabel("Priority").selectOption("1");
  await page.getByRole("dialog").getByRole("button", { name: /^Update 2 beads/ }).tap();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await waitFor("the two tapped beads are P1", () => [a, c].every((id) => show(id).priority === 1));
  assert.equal(show(b).priority, 0, "an unticked bead keeps its priority");

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS bulk edit: Cmd/Ctrl-click and phone Select tick beads; priority, assignee and status apply to exactly those");
} finally {
  await browser?.close();
  if (projectId) await fetch(`${base}/api/projects/${projectId}`, { method: "DELETE" });
  fs.rmSync(dir, { recursive: true, force: true });
}
