// Isolated writable server only. Uses a throwaway bd repo; skips when bd is not installed.
// A bead's due date and time can be set, changed and cleared from the drawer. The field shows the
// time in the browser's time zone (New York here, so a UTC mix-up would show), bd stores the instant,
// an incomplete value reverts, and on a phone the field and the Clear button keep 44px targets and 16px text.
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
  console.log("SKIP due edit: bd is not installed");
  process.exit(0);
}

const json = { "Content-Type": "application/json" };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beadscope-due-"));
const env = { ...process.env };
delete env.BEADS_ACTOR;
const bd = (args) => execFileSync("bd", args, { cwd: dir, env, encoding: "utf8" });
const dueOf = (id) => {
  const shown = JSON.parse(bd(["show", id, "--json"]));
  return (Array.isArray(shown) ? shown[0] : shown).due_at ?? null;
};
// The save is asynchronous, so wait for bd to show the new value.
const waitDue = async (id, expected) => {
  for (let i = 0; i < 40; i++) {
    if (dueOf(id) === expected) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(dueOf(id), expected, "bd holds the expected due date");
};

let projectId;
let browser;
try {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  bd(["init", "--prefix", "du"]);
  const withDue = JSON.parse(bd(["create", "has a due date", "--due", "2030-01-15T14:30:00Z", "--json"])).id;
  const without = JSON.parse(bd(["create", "has no due date", "--json"])).id;
  const added = await fetch(`${base}/api/projects`, { method: "POST", headers: json, body: JSON.stringify({ path: dir }) });
  assert.equal(added.status, 201);
  projectId = (await added.json()).id;

  browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
  const errors = [];
  const open = async (context, id) => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000); // generous: the first run after a build is slow
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/p/${projectId}?bead=${id}`);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    return { page, dialog, input: dialog.getByLabel("Due", { exact: true }), clear: dialog.getByRole("button", { name: "Clear due date" }) };
  };

  // Desktop, New York: 2030-01-15 14:30 UTC is 09:30 EST; February is still EST, July is EDT.
  const desktop = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: "America/New_York", locale: "en-US" });
  let { page, input, clear } = await open(desktop, withDue);
  assert.equal(await input.inputValue(), "2030-01-15T09:30", "the field shows the saved time in the browser's time zone");

  // For a human to look at: DUE_SCREENSHOT_DIR=<dir> writes the drawer on a desktop and on a phone.
  const shots = process.env.DUE_SCREENSHOT_DIR;
  if (shots) {
    await page.waitForTimeout(600); // let the drawer finish sliding in
    await page.screenshot({ path: `${shots}/drawer-edit-desktop.png` });
  }

  // Change it.
  await input.fill("2030-02-01T10:00");
  await input.blur();
  await waitDue(withDue, "2030-02-01T15:00:00Z");
  await page.waitForFunction(() => document.querySelector('[data-testid="due-field"] input')?.value === "2030-02-01T10:00");

  // An incomplete value is not saved and goes back to the saved one.
  await input.fill("");
  await input.blur();
  await page.waitForFunction(() => document.querySelector('[data-testid="due-field"] input')?.value === "2030-02-01T10:00");
  assert.equal(dueOf(withDue), "2030-02-01T15:00:00Z", "an empty field does not clear the date");

  // Enter saves too.
  await input.fill("2030-03-01T08:00");
  await input.press("Enter");
  await waitDue(withDue, "2030-03-01T13:00:00Z");

  // A year that is only started ("0002") is not saved.
  await input.fill("0002-05-05T10:00");
  await input.blur();
  await page.waitForFunction(() => document.querySelector('[data-testid="due-field"] input')?.value === "2030-03-01T08:00");
  assert.equal(dueOf(withDue), "2030-03-01T13:00:00Z", "a year before 1900 is not saved");

  // Clear it straight after an edit, with no blur in between: one click is enough.
  await input.fill("2030-04-01T09:00");
  await clear.click();
  await waitDue(withDue, null);
  await page.waitForFunction(() => document.querySelector('[data-testid="due-field"] input')?.value === "");
  await clear.waitFor({ state: "detached" }); // no Clear button without a due date
  await page.close();

  // Clear a saved date.
  ({ page, input, clear } = await open(desktop, withDue));
  await input.fill("2030-05-01T09:00");
  await input.press("Enter");
  await waitDue(withDue, "2030-05-01T13:00:00Z");
  await clear.click();
  await waitDue(withDue, null);
  await page.waitForFunction(() => document.querySelector('[data-testid="due-field"] input')?.value === "");
  await clear.waitFor({ state: "detached" }); // no Clear button without a due date
  await page.close();

  // Set one on a bead that has none (July is daylight time: UTC-4).
  ({ page, input } = await open(desktop, without));
  assert.equal(await input.inputValue(), "", "no due date, an empty field");
  // Unset reads blank: "Not set" is shown and the browser's own text (today's date on iOS) is hidden.
  const notSet = page.getByTestId("due-field").getByText("Not set", { exact: true });
  await notSet.waitFor();
  assert.equal(await input.evaluate((el) => getComputedStyle(el).color), "rgba(0, 0, 0, 0)", "the browser's own text is hidden while unset");
  assert.equal(await page.getByRole("button", { name: "Clear due date" }).count(), 0, "no Clear button while unset");
  await input.focus();
  await notSet.waitFor({ state: "hidden" }); // focus brings the real field back
  await input.blur();
  await notSet.waitFor();
  await input.fill("2030-07-04T08:15");
  await input.blur();
  await waitDue(without, "2030-07-04T12:15:00Z");
  await page.close();

  // The API refuses a due value that is not an ISO date and time.
  const bad = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ due: "next monday" }) });
  assert.equal(bad.status, 400, "a loose date string is rejected");
  const impossible = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ due: "2030-02-30T25:00:00Z" }) });
  assert.equal(impossible.status, 400, "an impossible date is rejected");
  // A day that does not exist in its month, or hour 24, must not roll over into a real date.
  for (const v of ["2030-02-30T10:00:00Z", "2031-02-29T10:00:00Z", "2030-04-31T10:00:00Z", "2030-01-01T24:00:00Z", "2030-01-01T10:00:00+24:00"]) {
    const r = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ due: v }) });
    assert.equal(r.status, 400, `${v} does not exist and is rejected`);
  }
  assert.equal(dueOf(without), "2030-07-04T12:15:00Z", "a rejected value changes nothing");
  // A leap day that does exist is still accepted (2032 is a leap year).
  const leap = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ due: "2032-02-29T10:00:00Z" }) });
  assert.equal(leap.status, 200, "a real leap day is accepted");
  await waitDue(without, "2032-02-29T10:00:00Z");
  const restore = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ due: "2030-07-04T12:15:00Z" }) });
  assert.equal(restore.status, 200);
  await waitDue(without, "2030-07-04T12:15:00Z");

  // Phone: targets and text are big enough.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/New_York", locale: "en-US", hasTouch: true, isMobile: true });
  ({ page, input, clear } = await open(phone, without));
  await clear.waitFor();
  await page.waitForTimeout(600); // let the drawer finish sliding in before measuring
  const box = await input.boundingBox();
  assert.ok(box && box.height >= 44, `due field is at least 44px tall on a phone (${box?.height})`);
  assert.ok(box.x + box.width <= 390, "due field stays inside the screen");
  assert.ok(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize)) >= 16, "due field text is 16px or more on a phone");
  const clearBox = await clear.boundingBox();
  assert.ok(clearBox && clearBox.height >= 44, `Clear is at least 44px tall on a phone (${clearBox?.height})`);
  assert.ok(clearBox.x + clearBox.width <= 390, "Clear stays inside the screen");
  if (shots) await page.screenshot({ path: `${shots}/drawer-edit-phone.png` });

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS due edit: set, change, clear and revert persist through bd in the browser's time zone");
} finally {
  await browser?.close();
  if (projectId) await fetch(`${base}/api/projects/${projectId}`, { method: "DELETE" });
  fs.rmSync(dir, { recursive: true, force: true });
}
