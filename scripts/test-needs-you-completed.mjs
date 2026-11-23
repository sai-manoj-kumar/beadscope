// "Completed · 3d" toggle on a project's own Needs You view (bead bui-ih7.17.7), the per-project
// twin of the all-repos toggle tested in test-queue-completed.mjs. Off by default, carried by
// ?done=1. Isolated demo server only; all project requests are intercepted, nothing is written.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated app server");

const ago = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();
const bead = (id, title, extra = {}) => ({
  id,
  title,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...extra,
});
const closed = (id, title, hours, extra = {}) =>
  bead(id, title, { status: "closed", closed_at: ago(hours), updated_at: ago(hours), ...extra });

const YOU = "reviewer";
const data = {
  alpha: [
    bead("al-open", "Alpha open for you", { assignee: YOU }),
    closed("al-mine", "Alpha mine done", 5, { assignee: YOU }),
    closed("al-flag", "Alpha flagged done", 30, { labels: ["human"] }),
    closed("al-edge", "Alpha mine done almost 3 days ago", 71, { assignee: YOU }),
    closed("al-gate", "Alpha approved gate", 2, { issue_type: "gate", await_type: "human" }),
    closed("al-old", "Alpha mine done long ago", 80, { assignee: YOU }),
    closed("al-arch", "Alpha mine archived", 3, { assignee: YOU, labels: ["archived"] }),
    closed("al-other", "Alpha someone else's", 3, { assignee: "someone" }),
    closed("al-claude", "Alpha claude done", 10, { assignee: "claude-code" }),
  ],
  beta: [closed("be-mine", "Beta mine done", 1, { assignee: YOU })],
  gamma: [bead("ga-open", "Gamma agent work", { assignee: "claude-code" })],
};
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  { id: "beta", name: "Beta Repo", path: "/tmp/beta", hasBeads: true },
  { id: "gamma", name: "Gamma Repo", path: "/tmp/gamma", hasBeads: true },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly: true } }));
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects } }));
  await page.route(/\/api\/p\/(alpha|beta|gamma)\//, async (route) => {
    const url = new URL(route.request().url());
    const [, , , id, ...rest] = url.pathname.split("/");
    if (url.pathname.endsWith("/beads/stream")) return route.abort();
    if (rest.join("/") === "beads") {
      return route.fulfill({
        json: { beads: data[id], meta: { kind: "bd", humanActor: YOU, humanAllowlist: [YOU], pollIntervalMs: 300000 } },
      });
    }
    return route.fulfill({ json: {} });
  });

  const cardIds = () =>
    page.locator("[data-keyboard-bead-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));
  const doneIds = () =>
    page.locator("[data-completed-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));
  const expectDone = async (expected) => {
    for (let i = 0; i < 50; i++) {
      if (JSON.stringify(await doneIds()) === JSON.stringify(expected)) return;
      await page.waitForTimeout(100);
    }
    assert.deepEqual(await doneIds(), expected);
  };
  const pressed = (on) => page.locator(`[data-completed-toggle][aria-pressed="${on}"]`).waitFor();
  const urlDone = (value) => page.waitForURL((u) => u.searchParams.get("done") === value);
  const toggle = () => page.locator("[data-completed-toggle]");

  await page.goto(`${base}/p/alpha?view=needsyou`);
  await page.getByText("1 waiting on you").waitFor();
  assert.equal(await toggle().getAttribute("aria-pressed"), "false", "off by default");
  assert.deepEqual(await cardIds(), ["al-open"], "closed beads are not listed until the toggle is on");

  await toggle().click();
  await pressed(true);
  await urlDone("1"); // the URL carries the toggle
  // Newest first; the old, archived, someone else's and agent's closed beads stay out.
  await expectDone(["al-gate", "al-mine", "al-flag", "al-edge"]);
  assert.deepEqual(await cardIds(), ["al-open", "al-gate", "al-mine", "al-flag", "al-edge"], "waiting cards stay above the completed ones");
  await page.getByText("1 waiting on you · 4 completed").waitFor();
  await page.getByRole("heading", { name: "Completed in the last 3 days" }).waitFor();
  await page.locator('[data-keyboard-bead-id="al-mine"]').getByText(/^closed 5h ago$/).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("view"), "needsyou", "the view stays on Needs You");

  // A completed card opens the drawer like any other.
  await page.locator('[data-keyboard-bead-id="al-mine"]').getByRole("button", { name: "al-mine", exact: true }).click();
  await page.locator("[data-bead-drawer]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-bead-drawer]").waitFor({ state: "detached" });

  // Reloading with the param keeps it on; switching it off clears it.
  await page.reload();
  await page.locator("[data-completed-card]").first().waitFor();
  assert.equal(await toggle().getAttribute("aria-pressed"), "true");
  await toggle().click();
  await urlDone(null);
  await expectDone([]);

  // Nothing waiting but something completed: the completed list is shown, not the empty state.
  await page.goto(`${base}/p/beta?view=needsyou&done=1`);
  await page.locator("[data-completed-card]").first().waitFor();
  assert.equal(await page.getByText(/Nothing needs you right now/).count(), 0);
  await page.getByText("nothing waiting · 1 completed").waitFor();
  await page.goto(`${base}/p/beta?view=needsyou`);
  await page.getByText(/Nothing needs you right now/).waitFor();

  // Nothing waiting and nothing completed for you: the empty state, even with the toggle on.
  await page.goto(`${base}/p/gamma?view=needsyou&done=1`);
  await page.getByText(/Nothing needs you right now/).waitFor();
  assert.equal(await doneIds().then((a) => a.length), 0);

  assert.deepEqual(errors, []);
  console.log("PASS: a project's Needs You view lists recently completed beads behind a toggle");
} finally {
  await browser.close();
}
