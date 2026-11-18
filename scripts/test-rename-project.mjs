// Isolated writable server only. Uses a throwaway bd repo; skips when bd is not installed.
// The project switcher offers Rename for each real project (not Demo): an empty name is rejected,
// a valid name shows in the switcher, the browser tab title and the project list without a reload,
// and the project id and URL do not change. On a phone the dialog keeps 44px targets and 16px fields.
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
  console.log("SKIP rename project: bd is not installed");
  process.exit(0);
}

const json = { "Content-Type": "application/json" };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beadscope-rename-"));
const env = { ...process.env };
delete env.BEADS_ACTOR;
let projectId;
let browser;
try {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("bd", ["init", "--prefix", "rn"], { cwd: dir, env, stdio: "ignore" });
  const added = await fetch(`${base}/api/projects`, { method: "POST", headers: json, body: JSON.stringify({ path: dir }) });
  assert.equal(added.status, 201);
  const entry = await added.json();
  projectId = entry.id;
  const originalName = entry.name;
  const newName = "Renamed Project";
  const projectUrl = `${base}/p/${projectId}`;

  browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
  const errors = [];

  async function openMenu(page, phone) {
    if (phone) await page.getByRole("button", { name: "Open navigation and project menu" }).click();
    await page.getByRole("button", { name: /Select project/ }).click();
    await page.locator('[data-slot="dropdown-menu-content"]').waitFor();
  }

  async function newPage(device) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    return { context, page };
  }

  const names = async () => (await (await fetch(`${base}/api/projects`)).json()).projects.map((p) => [p.id, p.name]);

  // ---- phone: rename dialog layout (the empty-name check and the rename run here too) ----
  {
    const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await openMenu(page, true);
    assert.equal(await page.getByRole("menuitem", { name: "Demo", exact: true }).count(), 1, "Demo is listed");
    assert.equal(await page.getByRole("menuitem", { name: /^Rename / }).count(), 1, "only the real project has Rename, not Demo");
    await page.waitForTimeout(500); // the menu zooms in; measure once it settles
    const trigger = page.getByRole("menuitem", { name: `Rename ${originalName}`, exact: true });
    const box = await trigger.boundingBox();
    assert.ok(box && box.height >= 43.5 && box.width >= 43.5, `Rename target is at least 44px: ${JSON.stringify(box)}`);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Rename project" });
    await dialog.waitFor();
    const field = dialog.getByRole("textbox", { name: "Project name" });
    assert.equal(await field.inputValue(), originalName, "the field starts with the current name");
    const fontSize = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(fontSize >= 16, `field is at least 16px on a phone, got ${fontSize}`);
    await page.waitForTimeout(500); // the dialog zooms in; measure once it settles
    for (const name of ["Cancel", "Save"]) {
      const b = await dialog.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(b && b.height >= 43.5, `${name} is at least 44px tall: ${JSON.stringify(b)}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `no sideways overflow, got ${overflow}`);

    // An empty (or blank) name is rejected: message shown, dialog stays, nothing saved.
    await field.fill("   ");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.match(await dialog.getByRole("alert").innerText(), /Enter a name/);
    assert.equal(await dialog.isVisible(), true, "dialog stays open after an empty name");
    assert.ok((await names()).some(([id, name]) => id === projectId && name === originalName), "empty name was not saved");
    await context.close();
  }

  // ---- desktop: rename shows everywhere without a reload ----
  {
    const { context, page } = await newPage({ viewport: { width: 1280, height: 860 } });
    await page.evaluate(() => (window.__noReload = true));
    await openMenu(page, false);
    await page.getByRole("menuitem", { name: `Rename ${originalName}`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rename project" });
    await dialog.waitFor();
    const field = dialog.getByRole("textbox", { name: "Project name" });
    await field.fill("");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.ok((await names()).some(([id, name]) => id === projectId && name === originalName), "empty name was not saved");

    await field.fill(`  ${newName}  `);
    await field.press("Enter");
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: `Select project, current project ${newName}`, exact: true }).waitFor();
    await page.waitForFunction((title) => document.title === title, `${newName} | Beadscope`);
    assert.equal(await page.evaluate(() => window.__noReload === true), true, "the page did not reload");
    assert.equal(page.url(), projectUrl, "the URL does not change");
    assert.deepEqual((await names()).find(([id]) => id === projectId), [projectId, newName], "the new name is saved, trimmed, under the same id");

    // The list in the switcher shows the new name.
    await openMenu(page, false);
    await page.getByRole("menuitem", { name: newName, exact: true }).waitFor();
    await page.keyboard.press("Escape");

    // A fresh load (server-rendered tab title) agrees.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((title) => document.title === title, `${newName} | Beadscope`);
    await context.close();
  }

  assert.deepEqual(errors, [], `no console errors: ${errors.join("; ")}`);
  console.log("PASS rename project: empty name rejected, rename shows in switcher, tab title and list without reload, id and URL unchanged, phone targets hold");
} finally {
  await browser?.close();
  if (projectId) await fetch(`${base}/api/projects/${projectId}`, { method: "DELETE" });
  fs.rmSync(dir, { recursive: true, force: true });
}
