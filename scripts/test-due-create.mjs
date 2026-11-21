// Isolated writable server only. Uses a throwaway bd repo; skips when bd is not installed.
// The create dialog can set an optional due date and time. The field is read in the browser's time
// zone (New York here, so a UTC mix-up shows), bd stores the instant, a bead made without it has no
// due date, the API refuses a loose date string, and on a phone the field keeps a 44px target and
// 16px text and stays inside the screen.
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
  console.log("SKIP due create: bd is not installed");
  process.exit(0);
}

const json = { "Content-Type": "application/json" };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beadscope-due-create-"));
const env = { ...process.env };
delete env.BEADS_ACTOR;
const bd = (args) => execFileSync("bd", args, { cwd: dir, env, encoding: "utf8" });
const dueOf = (id) => {
  const shown = JSON.parse(bd(["show", id, "--json"]));
  return (Array.isArray(shown) ? shown[0] : shown).due_at ?? null;
};
const idByTitle = (title) => {
  const all = JSON.parse(bd(["list", "--all", "--json", "--limit", "0"]));
  const list = Array.isArray(all) ? all : all.data ?? all.issues ?? [];
  return list.find((b) => b.title === title)?.id;
};
// The create is asynchronous, so wait for bd to show the bead.
const waitBead = async (title) => {
  for (let i = 0; i < 40; i++) {
    const id = idByTitle(title);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail(`bd never showed "${title}"`);
};

let projectId;
let browser;
try {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  bd(["init", "--prefix", "dc"]);
  const added = await fetch(`${base}/api/projects`, { method: "POST", headers: json, body: JSON.stringify({ path: dir }) });
  assert.equal(added.status, 201);
  projectId = (await added.json()).id;

  browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
  const errors = [];
  const openCreate = async (context) => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000); // generous: the first run after a build is slow
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/p/${projectId}`);
    await page.getByRole("button", { name: /^New\b|New bead|Create bead/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    return { page, dialog, title: dialog.getByPlaceholder("What needs doing?"), due: dialog.getByLabel(/^Due/), create: dialog.getByRole("button", { name: /Create bead/ }) };
  };

  // Desktop, New York: July is daylight time (UTC-4), so 08:15 local is 12:15 UTC.
  const desktop = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: "America/New_York", locale: "en-US" });
  let { page, dialog, title, due, create } = await openCreate(desktop);
  assert.equal(await due.inputValue(), "", "the due field starts empty");
  const shots = process.env.DUE_SCREENSHOT_DIR;
  if (shots) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/create-due-desktop.png` });
  }
  await title.fill("made with a due date");
  await due.fill("2030-07-04T08:15");
  await create.click();
  await dialog.waitFor({ state: "detached" });
  const withDue = await waitBead("made with a due date");
  assert.equal(dueOf(withDue), "2030-07-04T12:15:00Z", "bd holds the due time as the UTC instant");
  await page.close();

  // No due date typed: the bead has none.
  ({ page, dialog, title, create } = await openCreate(desktop));
  await title.fill("made without a due date");
  await create.click();
  await dialog.waitFor({ state: "detached" });
  const without = await waitBead("made without a due date");
  assert.equal(dueOf(without), null, "a bead made without a due date has none");
  await page.close();

  // The API refuses a due value that is not an ISO date and time, and creates nothing.
  const body = (due) => JSON.stringify({ title: "bad due", due });
  const bad = await fetch(`${base}/api/p/${projectId}/beads`, { method: "POST", headers: json, body: body("next monday") });
  assert.equal(bad.status, 400, "a loose date string is rejected");
  const impossible = await fetch(`${base}/api/p/${projectId}/beads`, { method: "POST", headers: json, body: body("2030-02-30T25:00:00Z") });
  assert.equal(impossible.status, 400, "an impossible date is rejected");
  // A day that does not exist in its month, or hour 24, must not roll over into a real date.
  for (const v of ["2030-02-30T10:00:00Z", "2031-02-29T10:00:00Z", "2030-04-31T10:00:00Z", "2030-01-01T24:00:00Z", "2030-01-01T10:00:00+24:00"]) {
    const r = await fetch(`${base}/api/p/${projectId}/beads`, { method: "POST", headers: json, body: body(v) });
    assert.equal(r.status, 400, `${v} does not exist and is rejected`);
  }
  assert.equal(idByTitle("bad due"), undefined, "a rejected request creates nothing");
  // The API takes an ISO instant straight too.
  const api = await fetch(`${base}/api/p/${projectId}/beads`, { method: "POST", headers: json, body: JSON.stringify({ title: "made by api", due: "2031-01-02T03:04:00.000Z" }) });
  assert.equal(api.status, 201);
  assert.equal(dueOf((await api.json()).id), "2031-01-02T03:04:00Z");

  // Phone: target and text are big enough, nothing sticks out.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/New_York", locale: "en-US", hasTouch: true, isMobile: true });
  ({ page, dialog, due } = await openCreate(phone));
  await page.waitForTimeout(600);
  await due.scrollIntoViewIfNeeded();
  const box = await due.boundingBox();
  assert.ok(box && box.height >= 44, `due field is at least 44px tall on a phone (${box?.height})`);
  assert.ok(box.x >= 0 && box.x + box.width <= 390, "due field stays inside the screen");
  assert.ok(parseFloat(await due.evaluate((el) => getComputedStyle(el).fontSize)) >= 16, "due field text is 16px or more on a phone");
  if (shots) await page.screenshot({ path: `${shots}/create-due-phone.png` });

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS due create: the create dialog sets an optional due date through bd in the browser's time zone");
} finally {
  await browser?.close();
  if (projectId) await fetch(`${base}/api/projects/${projectId}`, { method: "DELETE" });
  fs.rmSync(dir, { recursive: true, force: true });
}
