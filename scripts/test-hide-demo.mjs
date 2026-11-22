// Hide the Demo project (bead bui-k44.2): the launcher card has a Hide button; once hidden, Demo is gone from
// the project list API, the launcher, the project menu, and the all-repos pages (Needs You, Agent Queue); a
// Settings switch shows it again. Isolated demo server (Demo is its only project); the setting is restored
// at the end because the server is shared with other suites.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated demo server");

const projectIds = async () => (await (await fetch(`${base}/api/projects`)).json()).projects.map((p) => p.id);
const setHidden = (hideDemo) =>
  fetch(`${base}/api/config`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ hideDemo }) });

const browser = await chromium.launch();
try {
  await setHidden(false);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Shown by default: the card, and the sample beads on the all-repos pages (Demo is the only project).
  await page.goto(base);
  await page.getByRole("button", { name: /^Demo/ }).first().waitFor();
  assert.ok((await projectIds()).includes("demo"), "Demo is listed by default");
  for (const [path, id] of [["/needs-you", "bd-hmn1"], ["/agent-queue", "bd-3c71.1"]]) {
    await page.goto(`${base}${path}`);
    await page.getByText(id, { exact: true }).waitFor();
  }

  // Hide it from the launcher.
  await page.goto(base);
  await page.getByRole("button", { name: "Hide Demo project", exact: true }).click();
  await page.getByRole("button", { name: /^Demo/ }).waitFor({ state: "detached" });
  await page.getByText("Add your first project").waitFor();
  assert.ok(!(await projectIds()).includes("demo"), "the project list no longer holds Demo");

  // It stays hidden after a reload, in the project menu, and on the all-repos pages.
  await page.reload();
  await page.getByText("Add your first project").waitFor();
  assert.equal(await page.getByRole("button", { name: /^Demo/ }).count(), 0);
  for (const path of ["/needs-you", "/agent-queue"]) {
    await page.goto(`${base}${path}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await page.waitForTimeout(1500); // long enough for any Demo list to have loaded
    const text = await page.locator("body").innerText();
    assert.ok(!/Demo/.test(text) && !/bd-hmn1|bd-3c71/.test(text), `${path} shows nothing from Demo`);
  }
  await page.goto(`${base}/p/demo`);
  await page.getByRole("button", { name: /^Select project/ }).first().click();
  assert.equal(await page.getByRole("menuitem", { name: "Demo", exact: true }).count(), 0, "project menu omits Demo");
  await page.reload(); // closes the menu
  await page.getByRole("heading", { level: 1 }).first().waitFor();

  // The command palette omits Demo too.
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").waitFor();
  await page.getByText("Switch project…", { exact: false }).first().click();
  await page.getByText("Switch project", { exact: true }).last().waitFor();
  assert.ok(!/Demo/.test(await page.getByRole("dialog").innerText()), "palette omits Demo");
  await page.reload();
  await page.getByRole("heading", { level: 1 }).first().waitFor();

  // With no project left to open, the launcher itself offers the way back.
  await page.goto(base);
  await page.getByRole("button", { name: "Show Demo project", exact: true }).click();
  await page.getByRole("button", { name: /^Demo/ }).first().waitFor();
  assert.ok((await projectIds()).includes("demo"), "Demo is listed again from the launcher");
  await setHidden(true);

  // Bring it back from Settings.
  await page.goto(`${base}/p/demo`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Show the Demo project" });
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-labelledby="show-demo-label"]')?.getAttribute("aria-checked") === "true");
  assert.ok((await projectIds()).includes("demo"), "Demo is listed again");
  await page.goto(base);
  await page.getByRole("button", { name: /^Demo/ }).first().waitFor();

  assert.deepEqual(errors, []);
  console.log("PASS: hide Demo from the launcher, gone from the project list, menu and all-repos pages, shown again from Settings");
} finally {
  await setHidden(false);
  await browser.close();
}
