// Isolated writable server only. Uses throwaway bd repos; skips when bd is not installed.
// Bulk edit on the Board, Focus and the all-repos Agent Queue (the List view has test-bulk-edit.mjs):
// Cmd/Ctrl-click ticks a card (a plain click still opens the drawer), a bar offers Bulk edit, and the
// dialog changes exactly the ticked beads. A drag on the Board must not tick a card. On the Agent
// Queue the ticked beads come from two repos. On a phone the Select button shows 44px checkboxes.
// Everything is checked against what bd stores.
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
  console.log("SKIP bulk edit views: bd is not installed");
  process.exit(0);
}

const json = { "Content-Type": "application/json" };
const env = { ...process.env };
delete env.BEADS_ACTOR;
const repos = [];
const makeRepo = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `beadscope-bulkviews-${prefix}-`));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  const bd = (args) => execFileSync("bd", args, { cwd: dir, env, encoding: "utf8" });
  bd(["init", "--prefix", prefix]);
  const repo = {
    dir,
    id: "",
    bd,
    // Priority 1 so the bead is "Next up" in Focus; assigned to the default agent so the Agent Queue lists it.
    make: (title, extra = []) =>
      JSON.parse(bd(["create", title, "-p", "1", "--assignee", "claude-code", "--json", ...extra])).id,
    show: (id) => {
      const shown = JSON.parse(bd(["show", id, "--json"]));
      return Array.isArray(shown) ? shown[0] : shown;
    },
  };
  repos.push(repo);
  return repo;
};
const waitFor = async (what, check) => {
  for (let i = 0; i < 60; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(check(), what);
};

let browser;
try {
  const one = makeRepo("bv");
  const two = makeRepo("bw");
  const a = one.make("alpha board bead");
  const b = one.make("bravo board bead");
  const c = one.make("charlie board bead");
  const x = two.make("xray second repo bead");
  const y = two.make("yankee second repo bead");
  for (const repo of repos) {
    const added = await fetch(`${base}/api/projects`, { method: "POST", headers: json, body: JSON.stringify({ path: repo.dir }) });
    assert.equal(added.status, 201);
    repo.id = (await added.json()).id;
  }

  browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
  const errors = [];
  const open = async (context, url, ready) => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.locator(ready).first().waitFor();
    return page;
  };
  const shots = process.env.BULK_SCREENSHOT_DIR; // set it to also write screenshots for a person to look at
  const shot = async (page, name) => {
    if (shots) await page.screenshot({ path: `${shots}/bulk-${name}.png` });
  };
  const card = (page, id) => page.locator(`[data-keyboard-bead-id="${id}"]`);
  const bar = (page) => page.getByTestId("bulk-bar");
  const dialog = (page) => page.getByRole("dialog");
  const desktop = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // One pass over a view: a plain click opens the drawer, Cmd/Ctrl-click ticks, Bulk edit changes the
  // ticked beads only. `view` names the screen in messages.
  const exerciseDesktop = async (view, page, first, second, untouched, prio) => {
    assert.equal(await bar(page).count(), 0, `${view}: no selection bar until something is selected`);
    assert.equal(await page.getByRole("checkbox").count(), 0, `${view}: no checkboxes until selecting`);
    assert.equal(await page.getByRole("button", { name: "Select", exact: true }).isVisible(), false, `${view}: the Select button is for phones`);

    await card(page, first).click();
    await dialog(page).waitFor();
    await page.keyboard.press("Escape");
    await dialog(page).waitFor({ state: "detached" });
    assert.equal(await bar(page).count(), 0, `${view}: a plain click does not select`);

    // (A real Ctrl-click on macOS is a right click and fires no click event, so Ctrl is sent as a click event.)
    await card(page, first).dispatchEvent("click", { ctrlKey: true, bubbles: true });
    await bar(page).waitFor();
    await card(page, second).click({ modifiers: ["Meta"] });
    await card(page, untouched).click(); // selecting now: a plain click ticks
    await bar(page).getByText("3 selected").waitFor();
    assert.equal(await page.getByRole("checkbox", { name: `Select ${first}` }).isChecked(), true);
    await card(page, untouched).click(); // untick
    await bar(page).getByText("2 selected").waitFor();
    await shot(page, `${view}-desktop`);

    await bar(page).getByRole("button", { name: "Bulk edit" }).click();
    await dialog(page).waitFor();
    const submit = dialog(page).getByRole("button", { name: /^Update 2 beads/ });
    assert.equal(await submit.isDisabled(), true, `${view}: Update stays disabled while every field is on No change`);
    await dialog(page).getByLabel("Priority").selectOption(String(prio));
    await submit.click();
    await dialog(page).waitFor({ state: "detached" });
    assert.equal(await bar(page).count(), 0, `${view}: the selection is cleared after a successful edit`);
  };

  const exercisePhone = async (view, page, first, second) => {
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await bar(page).waitFor();
    const box = await page.getByRole("checkbox", { name: `Select ${first}` }).locator("xpath=..").boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `${view}: checkbox target is at least 44px (${box?.width}x${box?.height})`);
    await card(page, first).tap();
    await card(page, second).tap();
    await bar(page).getByText("2 selected").waitFor();
    assert.equal(await dialog(page).count(), 0, `${view}: tapping in Select mode does not open the drawer`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${view}: the page does not scroll sideways (${overflow}px)`);
    await shot(page, view.replace(/\W+/g, "-"));
    await bar(page).getByRole("button", { name: "Bulk edit" }).tap();
    await dialog(page).waitFor();
    await dialog(page).getByLabel("Priority").selectOption("3");
    await dialog(page).getByRole("button", { name: /^Update 2 beads/ }).tap();
    await dialog(page).waitFor({ state: "detached" });
  };

  // ---- Board ----
  let page = await open(desktop, `${base}/p/${one.id}?view=board`, `[data-keyboard-bead-id="${a}"]`);
  await exerciseDesktop("Board", page, a, b, c, 0);
  await waitFor("Board: both ticked beads are P0", () => [a, b].every((id) => one.show(id).priority === 0));
  assert.equal(one.show(c).priority, 1, "Board: an unticked bead keeps its priority");

  // Drag interplay: dragging a card must not tick it, and ticking one card must not start a drag.
  await card(page, a).click({ modifiers: ["Meta"] });
  await bar(page).getByText("1 selected").waitFor();
  const target = await card(page, c).boundingBox();
  assert.ok(target);
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 40, { steps: 8 });
  await page.mouse.move(cx, cy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await bar(page).getByText("1 selected").waitFor();
  assert.equal(await page.locator(`input[aria-label="Select ${c}"]`).isChecked(), false, "Board: a drag does not tick the card it started on");
  assert.equal(one.show(c).status, "open", "Board: a drag within the column does not change the bead");

  // Keyboard: Cmd/Ctrl+Enter on a focused card ticks it.
  await card(page, c).focus();
  await page.keyboard.press("Meta+Enter");
  await bar(page).getByText("2 selected").waitFor();
  await bar(page).getByRole("button", { name: /^Select all/ }).click();
  await bar(page).getByText("3 selected").waitFor();
  await bar(page).getByRole("button", { name: "Clear" }).click();
  await bar(page).waitFor({ state: "detached" });
  await page.close();

  page = await open(phone, `${base}/p/${one.id}?view=board`, `[data-keyboard-bead-id="${a}"]`);
  await exercisePhone("Board (phone)", page, a, c);
  await waitFor("Board (phone): both tapped beads are P3", () => [a, c].every((id) => one.show(id).priority === 3));
  assert.equal(one.show(b).priority, 0, "Board (phone): an untapped bead keeps its priority");
  await page.close();

  // ---- Focus ---- (all P1, so they sit in Next up)
  for (const id of [a, b, c]) one.bd(["update", id, "-p", "1"]);
  page = await open(desktop, `${base}/p/${one.id}?view=focus`, `[data-keyboard-bead-id="${a}"]`);
  await exerciseDesktop("Focus", page, a, b, c, 0);
  await waitFor("Focus: both ticked beads are P0", () => [a, b].every((id) => one.show(id).priority === 0));
  assert.equal(one.show(c).priority, 1, "Focus: an unticked bead keeps its priority");
  await page.close();

  page = await open(phone, `${base}/p/${one.id}?view=focus`, `[data-keyboard-bead-id="${a}"]`);
  await exercisePhone("Focus (phone)", page, a, c);
  await waitFor("Focus (phone): both tapped beads are P3", () => [a, c].every((id) => one.show(id).priority === 3));
  assert.equal(one.show(b).priority, 0, "Focus (phone): an untapped bead keeps its priority");
  await page.close();

  // ---- Folded lanes on a phone: Select all counts only the cards you can see ----
  // d is closed (the Board's Done lane starts folded); e is in progress (Focus "In flight").
  const d = one.make("delta done bead");
  one.bd(["close", d, "--force"]); // --force: it is assigned to claude-code, the actor here is whoever runs the test
  const e = one.make("echo in flight bead");
  one.bd(["update", e, "-p", "1", "--status", "in_progress"]);
  for (const id of [a, b, c]) one.bd(["update", id, "-p", "1"]); // back into Focus "Next up"
  const checked = (page, id) => page.getByRole("checkbox", { name: `Select ${id}` });

  page = await open(phone, `${base}/p/${one.id}?view=board`, `[data-keyboard-bead-id="${a}"]`);
  assert.equal(await card(page, d).isVisible(), false, "Board (phone): the Done lane starts folded");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await bar(page).getByRole("button", { name: "Select all 4" }).tap(); // a, b, c, e; not the folded d
  await bar(page).getByText("4 selected").waitFor();
  const doneLane = page.getByRole("button", { name: /^Done/ });
  await doneLane.tap(); // unfold Done: d is shown but was never ticked
  await card(page, d).waitFor();
  assert.equal(await checked(page, d).isChecked(), false, "Board (phone): a bead in a folded lane is not ticked by Select all");
  await bar(page).getByText("4 selected").waitFor();
  await bar(page).getByRole("button", { name: "Select all 5" }).tap();
  await bar(page).getByText("5 selected").waitFor();
  await doneLane.tap(); // fold it again: d drops out of the count, so a bulk edit cannot touch it
  await bar(page).getByText("4 selected").waitFor();
  await page.close();

  page = await open(phone, `${base}/p/${one.id}?view=focus`, `[data-keyboard-bead-id="${a}"]`);
  await page.getByRole("button", { name: "In flight lane" }).tap(); // fold In flight (it holds e)
  assert.equal(await card(page, e).isVisible(), false, "Focus (phone): a folded lane hides its cards");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await bar(page).getByRole("button", { name: "Select all 3" }).tap(); // a, b, c; not the folded e
  await bar(page).getByText("3 selected").waitFor();
  await page.getByRole("button", { name: "In flight lane" }).tap();
  await card(page, e).waitFor();
  assert.equal(await checked(page, e).isChecked(), false, "Focus (phone): a bead in a folded lane is not ticked by Select all");
  await bar(page).getByRole("button", { name: "Select all 4" }).waitFor();
  await page.close();
  one.bd(["update", b, "-p", "0"]); // as the Agent Queue checks below expect

  // ---- Agent Queue, two repos ----
  const section = (page, repo) => page.locator(`[data-repo-section="${repo.id}"]`);
  const ready = `[data-repo-section="${two.id}"] [data-keyboard-bead-id="${x}"]`;
  page = await open(desktop, `${base}/agent-queue`, ready);
  assert.equal(await bar(page).count(), 0, "Agent Queue: no selection bar until something is selected");
  await section(page, one).locator(`[data-keyboard-bead-id="${a}"]`).dispatchEvent("click", { ctrlKey: true, bubbles: true });
  await bar(page).waitFor();
  await section(page, two).locator(`[data-keyboard-bead-id="${x}"]`).click({ modifiers: ["Meta"] });
  await bar(page).getByText("2 selected").waitFor();
  await shot(page, "agent-queue-desktop");
  await bar(page).getByRole("button", { name: "Bulk edit" }).click();
  await dialog(page).waitFor();
  await dialog(page).getByLabel("Priority").selectOption("4");
  await dialog(page).getByRole("button", { name: /^Update 2 beads/ }).click();
  await dialog(page).waitFor({ state: "detached" });
  await waitFor("Agent Queue: the ticked bead in each repo is P4", () => one.show(a).priority === 4 && two.show(x).priority === 4);
  assert.equal(one.show(b).priority, 0, "Agent Queue: an unticked bead keeps its priority");
  assert.equal(two.show(y).priority, 1, "Agent Queue: an unticked bead in the other repo keeps its priority");
  assert.equal(await bar(page).count(), 0, "Agent Queue: the selection is cleared after a successful edit");
  // A plain click still opens the drawer.
  await section(page, two).locator(`[data-keyboard-bead-id="${y}"]`).click();
  await dialog(page).waitFor();
  await page.keyboard.press("Escape");
  await dialog(page).waitFor({ state: "detached" });
  await page.close();

  page = await open(phone, `${base}/agent-queue`, ready);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await bar(page).waitFor();
  await section(page, one).locator(`[data-keyboard-bead-id="${b}"]`).tap();
  await section(page, two).locator(`[data-keyboard-bead-id="${y}"]`).tap();
  await bar(page).getByText("2 selected").waitFor();
  assert.equal(await dialog(page).count(), 0, "Agent Queue (phone): tapping in Select mode does not open the drawer");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `Agent Queue (phone): the page does not scroll sideways (${overflow}px)`);
  await bar(page).getByRole("button", { name: "Bulk edit" }).tap();
  await dialog(page).waitFor();
  await dialog(page).getByLabel("Priority").selectOption("2");
  await dialog(page).getByRole("button", { name: /^Update 2 beads/ }).tap();
  await dialog(page).waitFor({ state: "detached" });
  await waitFor("Agent Queue (phone): both tapped beads are P2", () => one.show(b).priority === 2 && two.show(y).priority === 2);
  assert.equal(one.show(a).priority, 4, "Agent Queue (phone): an untapped bead keeps its priority");

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS bulk edit views: Cmd/Ctrl-click and phone Select tick cards on the Board, Focus and Agent Queue (across repos); only ticked beads change; a drag does not tick");
} finally {
  await browser?.close();
  for (const repo of repos) {
    if (repo.id) await fetch(`${base}/api/projects/${repo.id}`, { method: "DELETE" });
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
}
