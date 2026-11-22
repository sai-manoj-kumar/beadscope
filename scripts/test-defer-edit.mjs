// Isolated writable server only. Uses a throwaway bd repo; skips when bd is not installed.
// A bead's defer date and time shows in the drawer and can be set, changed and cleared. A bead with
// no defer date shows an empty field and a "No defer date" hint, not an error or a broken date. The
// time is shown in the browser's time zone (New York here, so a UTC mix-up would show), bd stores
// the instant, an incomplete value reverts, and on a phone the field and Clear keep 44px targets.
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
  console.log("SKIP defer edit: bd is not installed");
  process.exit(0);
}

const json = { "Content-Type": "application/json" };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beadscope-defer-"));
const env = { ...process.env };
delete env.BEADS_ACTOR;
const bd = (args) => execFileSync("bd", args, { cwd: dir, env, encoding: "utf8" });
const deferOf = (id) => {
  const shown = JSON.parse(bd(["show", id, "--json"]));
  return (Array.isArray(shown) ? shown[0] : shown).defer_until ?? null;
};
// bd may print the instant with a zone offset or fractional seconds; compare as instants.
const sameInstant = (a, b) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));
// The save is asynchronous, so wait for bd to show the new value.
const waitDefer = async (id, expected) => {
  for (let i = 0; i < 40; i++) {
    if (sameInstant(deferOf(id), expected)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(sameInstant(deferOf(id), expected), `bd holds the expected defer date (${deferOf(id)} vs ${expected})`);
};

let projectId;
let browser;
try {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  bd(["init", "--prefix", "df"]);
  const withDefer = JSON.parse(bd(["create", "has a defer date", "--json"])).id;
  bd(["update", withDefer, "--defer", "2030-01-15T14:30:00Z"]);
  const without = JSON.parse(bd(["create", "has no defer date", "--json"])).id;
  assert.equal(deferOf(withDefer) !== null, true, "the fixture bead carries a defer date");
  assert.equal(deferOf(without), null, "the other fixture bead has none");
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
    return {
      page,
      dialog,
      input: dialog.getByLabel("Defer until", { exact: true }),
      clear: dialog.getByRole("button", { name: "Clear defer date" }),
      hint: dialog.getByText("No defer date."),
    };
  };
  const fieldValue = (page) => page.evaluate(() => document.querySelector('[data-testid="defer-field"] input')?.value);

  // Desktop, New York: 2030-01-15 14:30 UTC is 09:30 EST; July is EDT.
  const desktop = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: "America/New_York", locale: "en-US" });
  let { page, input, clear, hint } = await open(desktop, withDefer);
  assert.equal(await input.inputValue(), "2030-01-15T09:30", "the field shows the saved time in the browser's time zone");
  assert.equal(await hint.count(), 0, "no hint while a date is set");

  // For a human to look at: DEFER_SCREENSHOT_DIR=<dir> writes the drawer on a desktop and on a phone.
  const shots = process.env.DEFER_SCREENSHOT_DIR;
  if (shots) {
    await page.waitForTimeout(600); // let the drawer finish sliding in
    await page.screenshot({ path: `${shots}/drawer-defer-set-desktop.png` });
  }

  // Change it.
  await input.fill("2030-02-01T10:00");
  await input.blur();
  await waitDefer(withDefer, "2030-02-01T15:00:00Z");
  await page.waitForFunction(() => document.querySelector('[data-testid="defer-field"] input')?.value === "2030-02-01T10:00");

  // An incomplete value is not saved and goes back to the saved one.
  await input.fill("");
  await input.blur();
  await page.waitForFunction(() => document.querySelector('[data-testid="defer-field"] input')?.value === "2030-02-01T10:00");
  assert.ok(sameInstant(deferOf(withDefer), "2030-02-01T15:00:00Z"), "an empty field does not clear the date");

  // Reset it: one click on Clear removes the date.
  await clear.click();
  await waitDefer(withDefer, null);
  await page.waitForFunction(() => document.querySelector('[data-testid="defer-field"] input')?.value === "");
  await clear.waitFor({ state: "detached" }); // no Clear button without a defer date
  await hint.waitFor(); // and the unset hint takes its place
  await page.close();

  // Reload: the cleared bead opens with an empty field and no error.
  ({ page, input, clear, hint } = await open(desktop, withDefer));
  assert.equal(await input.inputValue(), "", "a cleared defer date stays cleared");
  await page.close();

  // A bead that never had one: empty field, hint, no Clear button.
  ({ page, input, clear, hint } = await open(desktop, without));
  assert.equal(await input.inputValue(), "", "no defer date, an empty field");
  await hint.waitFor();
  assert.equal(await clear.count(), 0, "nothing to clear");
  if (shots) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/drawer-defer-unset-desktop.png` });
  }

  // Set one (July is daylight time: UTC-4); Enter saves too.
  await input.fill("2030-07-04T08:15");
  await input.press("Enter");
  await waitDefer(without, "2030-07-04T12:15:00Z");
  await clear.waitFor();
  assert.equal(await fieldValue(page), "2030-07-04T08:15");
  await page.close();

  // The API refuses a defer value that is not an ISO date and time, and a rejected value changes nothing.
  for (const v of ["next monday", "2030-02-30T10:00:00Z", "2030-01-01T24:00:00Z"]) {
    const r = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ defer: v }) });
    assert.equal(r.status, 400, `${v} is rejected`);
  }
  assert.ok(sameInstant(deferOf(without), "2030-07-04T12:15:00Z"), "a rejected value changes nothing");
  // The API clears with an empty string, and an unrelated patch leaves the defer date alone.
  const other = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ priority: 1 }) });
  assert.equal(other.status, 200);
  assert.ok(sameInstant(deferOf(without), "2030-07-04T12:15:00Z"), "a patch without defer keeps the defer date");
  const cleared = await fetch(`${base}/api/p/${projectId}/beads/${without}`, { method: "PATCH", headers: json, body: JSON.stringify({ defer: "" }) });
  assert.equal(cleared.status, 200);
  await waitDefer(without, null);

  // Phone: targets and text are big enough.
  bd(["update", without, "--defer", "2030-07-04T12:15:00Z"]);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/New_York", locale: "en-US", hasTouch: true, isMobile: true });
  ({ page, input, clear } = await open(phone, without));
  await clear.waitFor();
  await page.waitForTimeout(600); // let the drawer finish sliding in before measuring
  const box = await input.boundingBox();
  assert.ok(box && box.height >= 44, `defer field is at least 44px tall on a phone (${box?.height})`);
  assert.ok(box.x + box.width <= 390, "defer field stays inside the screen");
  assert.ok(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize)) >= 16, "defer field text is 16px or more on a phone");
  const clearBox = await clear.boundingBox();
  assert.ok(clearBox && clearBox.height >= 44, `Clear is at least 44px tall on a phone (${clearBox?.height})`);
  assert.ok(clearBox.x + clearBox.width <= 390, "Clear stays inside the screen");
  if (shots) await page.screenshot({ path: `${shots}/drawer-defer-phone.png` });

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS defer edit: shown, set, change, clear and unset persist through bd in the browser's time zone");
} finally {
  await browser?.close();
  if (projectId) await fetch(`${base}/api/projects/${projectId}`, { method: "DELETE" });
  fs.rmSync(dir, { recursive: true, force: true });
}
