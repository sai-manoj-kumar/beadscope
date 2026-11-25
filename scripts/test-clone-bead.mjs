// Isolated writable server only. Uses a throwaway bd repo; skips when bd is not installed.
// The bead drawer's Clone button opens the create dialog prefilled from the bead (type, priority,
// title, description, assignee, labels, parent, due date, Backlog), every field stays editable, and
// the new bead carries none of the source's comments or dependencies and starts Ready. The source
// is left as it was, and on a phone the Clone button is a 44px target and the dialog fits.
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
  console.log("SKIP clone bead: bd is not installed");
  process.exit(0);
}

const json = { "Content-Type": "application/json" };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beadscope-clone-"));
const env = { ...process.env };
delete env.BEADS_ACTOR;
const bd = (args) => execFileSync("bd", args, { cwd: dir, env, encoding: "utf8" });
const show = (id) => {
  const shown = JSON.parse(bd(["show", id, "--json"]));
  return Array.isArray(shown) ? shown[0] : (shown.data ?? shown);
};
const commentCount = (id) => {
  const c = JSON.parse(bd(["comments", id, "--json"]));
  return (Array.isArray(c) ? c : (c.data ?? c.comments ?? [])).length;
};
const idByTitle = (title) => {
  const all = JSON.parse(bd(["list", "--all", "--json", "--limit", "0"]));
  const list = Array.isArray(all) ? all : (all.data ?? all.issues ?? []);
  return list.find((b) => b.title === title)?.id;
};
const waitBead = async (title) => {
  for (let i = 0; i < 40; i++) {
    const id = idByTitle(title);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail(`bd never showed "${title}"`);
};
const post = (projectId, body) =>
  fetch(`${base}/api/p/${projectId}/beads`, { method: "POST", headers: json, body: JSON.stringify(body) });

let projectId;
let browser;
try {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  bd(["init", "--prefix", "cl"]);
  const added = await fetch(`${base}/api/projects`, { method: "POST", headers: json, body: JSON.stringify({ path: dir }) });
  assert.equal(added.status, 201);
  projectId = (await added.json()).id;

  // A parent and a source bead with something in every field the dialog can copy.
  const parent = (await (await post(projectId, { title: "clone parent", issue_type: "epic" })).json()).id;
  const other = (await (await post(projectId, { title: "something it depends on" })).json()).id;
  const created = await post(projectId, {
    title: "original bead",
    issue_type: "bug",
    priority: 1,
    description: "steps to reproduce",
    assignee: "claude-code",
    labels: ["ui", "m3"],
    parent,
    due: "2030-07-04T12:15:00.000Z",
    backlog: true,
  });
  assert.equal(created.status, 201);
  const source = (await created.json()).id;
  bd(["comments", "add", source, "a comment that must not be cloned"]);
  bd(["dep", "add", source, other]);
  const before = show(source);

  browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
  const errors = [];
  const shots = process.env.CLONE_SCREENSHOT_DIR;
  const openClone = async (context) => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000); // generous: the first run after a build is slow
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/p/${projectId}?bead=${source}`);
    await page.getByRole("button", { name: "Clone bead" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: `Clone ${source}` });
    await dialog.waitFor();
    return { page, dialog };
  };

  const desktop = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: "America/New_York", locale: "en-US" });
  let { page, dialog } = await openClone(desktop);
  const titleBox = dialog.getByPlaceholder("What needs doing?");
  assert.equal(await titleBox.inputValue(), "original bead", "the title is copied");
  assert.equal(await dialog.locator("select").nth(0).inputValue(), "bug", "the type is copied");
  assert.equal(await dialog.locator("select").nth(1).inputValue(), "1", "the priority is copied");
  assert.match(await dialog.locator("textarea").nth(1).inputValue(), /steps to reproduce/, "the description is copied");
  assert.equal(await dialog.getByPlaceholder("ui, dnd, m3").inputValue(), "m3, ui", "the labels are copied");
  assert.equal(await dialog.getByLabel(/^Due/).inputValue(), "2030-07-04T08:15", "the due date is copied, in local time");
  assert.match(await dialog.getByPlaceholder(/No parent/).inputValue(), new RegExp(`^${parent} · clone parent`), "the parent is copied");
  assert.equal(await dialog.getByRole("checkbox").isChecked(), true, "a Backlog bead clones into the Backlog");
  assert.match(await dialog.innerText(), /Comments,\s+activity and dependencies are not copied/, "the dialog says what is left behind");
  if (shots) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/clone-desktop.png` });
  }

  // Change key fields, then create.
  await titleBox.fill("cloned bead");
  await dialog.locator("select").nth(1).selectOption("3");
  await dialog.getByRole("checkbox").uncheck();
  await dialog.getByRole("button", { name: /Create bead/ }).click();
  await dialog.waitFor({ state: "detached" });
  const copy = await waitBead("cloned bead");
  assert.notEqual(copy, source, "a new bead was made");
  const made = show(copy);
  assert.equal(made.issue_type, "bug");
  assert.equal(made.priority, 3, "the edited priority is used");
  assert.equal(made.description, "steps to reproduce");
  assert.equal(made.assignee, "claude-code");
  assert.deepEqual([...(made.labels ?? [])].sort(), ["m3", "ui"]);
  assert.equal(made.due_at, "2030-07-04T12:15:00Z");
  assert.equal(made.status, "open", "unchecking Backlog starts the clone Ready");
  const parentEdge = (made.dependencies ?? []).find((d) => (d.type ?? d.dependency_type) === "parent-child");
  assert.equal(parentEdge?.id ?? parentEdge?.depends_on_id, parent, "the parent is kept");
  assert.equal(commentCount(source), 1, "the source has its comment (so the next check can fail)");
  assert.equal(commentCount(copy), 0, "comments are not cloned");
  assert.ok(
    !(made.dependencies ?? []).some((d) => (d.id ?? d.depends_on_id) === other),
    "the source's dependencies are not cloned",
  );

  // The source is untouched.
  const after = show(source);
  assert.equal(after.title, before.title);
  assert.equal(after.status, before.status);
  assert.equal(commentCount(source), 1, "the source keeps its comment");
  await page.close();

  // Images in the description are copied into the new bead, so the clone survives the source's deletion.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  const withImage = (await (await post(projectId, { title: "has an image" })).json()).id;
  const shotsDir = path.join(dir, ".beads", "attachments", withImage);
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.writeFileSync(path.join(shotsDir, "shot.png"), png);
  fs.writeFileSync(path.join(shotsDir, "unused.png"), png);
  bd(["update", withImage, "--description", `see ![shot](attachment://${withImage}/shot.png) and ![gone](attachment://${withImage}/gone.png)`]);
  {
    const p = await desktop.newPage();
    p.setDefaultTimeout(20000);
    await p.goto(`${base}/p/${projectId}?bead=${withImage}`);
    await p.getByRole("button", { name: "Clone bead" }).click();
    const d = p.getByRole("dialog").filter({ hasText: `Clone ${withImage}` });
    await d.waitFor();
    await d.getByPlaceholder("What needs doing?").fill("image clone");
    await d.getByRole("button", { name: /Create bead/ }).click();
    await d.waitFor({ state: "detached" });
    const imageCopy = await waitBead("image clone");
    // The description is rewritten after the create, so wait for it.
    let desc = "";
    for (let i = 0; i < 40; i++) {
      desc = show(imageCopy).description ?? "";
      if (desc.includes(`attachment://${imageCopy}/shot.png`)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(
      desc,
      `see ![shot](attachment://${imageCopy}/shot.png) and ![gone](attachment://${withImage}/gone.png)`,
      "a copied image points at the new bead; a source image that is already missing is left as written",
    );
    const copiedDir = path.join(dir, ".beads", "attachments", imageCopy);
    assert.deepEqual(fs.readdirSync(copiedDir), ["shot.png"], "only the referenced image is copied");
    assert.ok(fs.readFileSync(path.join(copiedDir, "shot.png")).equals(png), "the copy has the same bytes");
    assert.ok(fs.existsSync(path.join(shotsDir, "shot.png")), "the source keeps its image");
    // Delete the source's files: the clone's image still serves.
    fs.rmSync(shotsDir, { recursive: true, force: true });
    const served = await fetch(`${base}/api/p/${projectId}/attachments/${imageCopy}/shot.png`);
    assert.equal(served.status, 200, "the clone's image still serves after the source's images are gone");
    await p.close();
  }

  // Cancel creates nothing.
  ({ page, dialog } = await openClone(desktop));
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.waitForTimeout(600);
  const all = JSON.parse(bd(["list", "--all", "--json", "--limit", "0"]));
  const list = Array.isArray(all) ? all : (all.data ?? all.issues ?? []);
  assert.equal(list.filter((b) => b.title === "original bead").length, 1, "cancelling a clone creates nothing");
  await page.close();

  // Phone: the dialog fills the screen and the Clone button is a 44px target.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/New_York", locale: "en-US", hasTouch: true, isMobile: true });
  page = await phone.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/p/${projectId}?bead=${source}`);
  const cloneBtn = page.getByRole("button", { name: "Clone bead" });
  await cloneBtn.waitFor();
  const btn = await cloneBtn.boundingBox();
  assert.ok(btn && btn.width >= 44 && btn.height >= 44, `Clone is at least 44px on a phone (${btn?.width}x${btn?.height})`);
  await cloneBtn.click();
  dialog = page.getByRole("dialog").filter({ hasText: `Clone ${source}` });
  await dialog.waitFor();
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "nothing sticks out sideways");
  if (shots) await page.screenshot({ path: `${shots}/clone-phone.png` });
  await page.close();

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS clone bead: the drawer's Clone button opens a prefilled, editable create dialog and copies no comments or dependencies");
} finally {
  await browser?.close();
  if (projectId) await fetch(`${base}/api/projects/${projectId}`, { method: "DELETE" });
  fs.rmSync(dir, { recursive: true, force: true });
}
