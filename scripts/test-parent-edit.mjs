// Drawer reparenting uses the existing update contract and prevents hierarchy cycles.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated demo server");
const edge = (id, parent) => ({ issue_id: id, depends_on_id: parent, type: "parent-child" });
const beads = [
  { id: "epic-a", title: "Epic A", issue_type: "epic", status: "open", priority: 2, labels: [], dependencies: [] },
  { id: "epic-b", title: "Epic B", issue_type: "epic", status: "open", priority: 2, labels: [], dependencies: [] },
  { id: "child", title: "Child", issue_type: "task", status: "open", priority: 2, labels: [], dependencies: [edge("child", "epic-a")] },
  { id: "descendant", title: "Descendant", issue_type: "task", status: "open", priority: 2, labels: [], dependencies: [edge("descendant", "child")] },
].map((bead) => ({ created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...bead }));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  const updates = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly: false } }));
  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) return route.fulfill({ json: { beads, meta: { kind: "demo", humanActor: "reviewer" } } });
    if (request.method() === "PATCH") {
      const patch = request.postDataJSON();
      updates.push(patch);
      const target = beads.find((bead) => path.endsWith(`/beads/${bead.id}`));
      target.dependencies = target.dependencies.filter((dependency) => dependency.type !== "parent-child");
      if (patch.parent) target.dependencies.push(edge(target.id, patch.parent));
      return route.fulfill({ json: { ...target, parent: patch.parent || null } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${base}/p/demo?bead=child`);
  const drawer = page.getByRole("dialog");
  await drawer.getByText("Epic A", { exact: true }).waitFor();
  await drawer.getByRole("button", { name: "Change parent" }).click();
  // A text input with a `list` attribute has the combobox role, not textbox.
  const input = drawer.getByRole("combobox", { name: "Parent bead" });
  await input.waitFor({ state: "visible", timeout: 7000 });
  const options = await input.getAttribute("list");
  assert.ok(options);
  assert.equal(await page.locator(`#${options} option[value^="child ·"]`).count(), 0, "cannot parent a bead to itself");
  assert.equal(await page.locator(`#${options} option[value^="descendant ·"]`).count(), 0, "cannot parent a bead to its descendant");
  // Editing the prefilled text must not save a half-typed value; Escape cancels.
  await page.keyboard.press("Backspace");
  assert.deepEqual(updates, [], "a single backspace does not save");
  assert.equal(await input.isVisible(), true);
  await page.keyboard.press("Escape");
  await input.waitFor({ state: "detached" });
  assert.deepEqual(updates, [], "Escape cancels without saving");
  assert.equal(await drawer.isVisible(), true, "Escape closes only the editor, not the drawer");
  await drawer.getByRole("button", { name: "Change parent" }).click();
  await input.waitFor({ state: "visible" });
  await input.fill("epic-b · Epic B");
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.querySelector('input[aria-label="Parent bead"]') === null);
  assert.deepEqual(updates, [{ parent: "epic-b" }]);
  await drawer.getByText("Epic B", { exact: true }).waitFor();
  await drawer.getByRole("button", { name: "Change parent" }).click();
  await drawer.getByRole("combobox", { name: "Parent bead" }).fill("");
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.querySelector('input[aria-label="Parent bead"]') === null);
  assert.deepEqual(updates, [{ parent: "epic-b" }, { parent: "" }], "clearing the field detaches the bead");
  assert.deepEqual(errors, []);
  console.log("PASS: drawer can reparent and detach a bead, excludes self and descendants, and sends parent updates");
} finally {
  await browser.close();
}
