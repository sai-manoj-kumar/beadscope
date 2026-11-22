// "Completed · 3d" toggle on the all-repos queue pages (bead bui-ih7.17.4): Needs You and Agent Queue
// can also list what was closed in the last 3 days. Off by default, carried by ?done=1.
// Isolated demo server only; all project requests are intercepted, nothing is written.
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
const agents = [
  { id: "claude-code", name: "claude-code", enabled: true },
  { id: "codex", name: "codex", enabled: true },
];
const data = {
  alpha: [
    bead("al-open", "Alpha open for you", { assignee: YOU }),
    bead("al-agent-open", "Alpha open for claude", { assignee: "claude-code" }),
    // Needs You: closed in the window, for you / flagged / a gate. Newest first.
    closed("al-mine", "Alpha mine done", 5, { assignee: YOU }),
    closed("al-flag", "Alpha flagged done", 30, { labels: ["human"] }),
    // Just inside the 3-day window (72h); al-old below is just outside it.
    closed("al-edge", "Alpha mine done almost 3 days ago", 71, { assignee: YOU }),
    closed("al-gate", "Alpha approved gate", 2, { issue_type: "gate", await_type: "human" }),
    // Closed too long ago (just outside 3 days), archived, or not for you / an agent.
    closed("al-old", "Alpha mine done long ago", 80, { assignee: YOU }),
    closed("al-arch", "Alpha mine archived", 3, { assignee: YOU, labels: ["archived"] }),
    closed("al-other", "Alpha someone else's", 3, { assignee: "someone" }),
    closed("al-noassignee", "Alpha closed unassigned", 3),
    // Agent Queue: closed in the window.
    closed("al-claude", "Alpha claude done", 10, { assignee: "claude-code" }),
    closed("al-codex", "Alpha codex done", 20, { assignee: "codex" }),
    closed("al-claude-old", "Alpha claude done long ago", 100, { assignee: "claude-code" }),
    // Closed with no closed_at: falls back to its last update.
    bead("al-noclosedat", "Alpha closed without a date", { status: "closed", assignee: "codex", updated_at: ago(1) }),
  ],
  beta: [closed("be-claude", "Beta claude done", 1, { assignee: "claude-code" })],
};
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  { id: "beta", name: "Beta Repo", path: "/tmp/beta", hasBeads: true },
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
  await page.route(/\/api\/p\/(alpha|beta)\//, async (route) => {
    const url = new URL(route.request().url());
    const [, , , id, ...rest] = url.pathname.split("/");
    if (url.pathname.endsWith("/beads/stream")) return route.abort();
    if (rest.join("/") === "beads") {
      return route.fulfill({
        json: { beads: data[id], meta: { kind: "bd", humanActor: YOU, humanAllowlist: [YOU], agents, pollIntervalMs: 300000 } },
      });
    }
    return route.fulfill({ json: {} });
  });

  const cardIds = () =>
    page.locator("[data-keyboard-bead-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));
  const doneIds = () =>
    page.locator("[data-completed-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));
  // The page re-renders after a click or a filter change, so wait for the list rather than read it at once.
  const expectDone = async (expected) => {
    for (let i = 0; i < 50; i++) {
      if (JSON.stringify(await doneIds()) === JSON.stringify(expected)) return;
      await page.waitForTimeout(100);
    }
    assert.deepEqual(await doneIds(), expected);
  };
  // The URL and the button follow a click a moment later, so wait for them too.
  const pressed = (on) => page.locator(`[data-completed-toggle][aria-pressed="${on}"]`).waitFor();
  const urlDone = (value) => page.waitForURL((u) => u.searchParams.get("done") === value);
  const toggle = () => page.locator("[data-completed-toggle]");

  // ---- Needs You ----
  await page.goto(`${base}/needs-you`);
  await page.locator("[data-repo-section]").first().waitFor();
  assert.equal(await toggle().getAttribute("aria-pressed"), "false", "off by default");
  assert.deepEqual(await cardIds(), ["al-open"], "closed beads are not listed until the toggle is on");
  await page.getByText("1 waiting on you · all repos").waitFor();

  await toggle().click();
  await pressed(true);
  await urlDone("1"); // the URL carries the toggle
  // Newest first; the old, archived, someone else's and unassigned closed beads stay out.
  await expectDone(["al-gate", "al-mine", "al-flag", "al-edge"]);
  assert.deepEqual(await cardIds(), ["al-open", "al-gate", "al-mine", "al-flag", "al-edge"], "waiting cards stay above the completed ones");
  await page.getByText("1 waiting on you · 4 completed · all repos").waitFor();
  await page.getByRole("heading", { name: "Completed in the last 3 days" }).waitFor();
  await page.locator('[data-keyboard-bead-id="al-mine"]').getByText(/^closed 5h ago$/).waitFor();
  // Counts in the repo filter stay the waiting counts.
  assert.deepEqual(await page.getByLabel("Filter by repo").locator("option").allTextContents(), ["All repos", "Alpha Repo (1)", "Beta Repo"]);

  // A completed card opens the drawer like any other.
  await page.locator('[data-keyboard-bead-id="al-mine"]').getByRole("button", { name: "al-mine", exact: true }).click();
  await page.locator("[data-bead-drawer]").waitFor();
  assert.equal(new URL(page.url()).pathname, "/needs-you");
  await page.keyboard.press("Escape");
  await page.locator("[data-bead-drawer]").waitFor({ state: "detached" });

  // Reloading with the param keeps it on; switching it off clears it.
  await page.reload();
  await page.locator("[data-completed-card]").first().waitFor();
  assert.equal(await toggle().getAttribute("aria-pressed"), "true");
  await toggle().click();
  await urlDone(null);
  await expectDone([]);

  // Beta has nothing waiting and nothing completed for you: no section, even with the toggle on.
  await page.goto(`${base}/needs-you?done=1&repo=beta`);
  await page.getByText(/Nothing needs you right now/).waitFor();

  // ---- Agent Queue ----
  await page.goto(`${base}/agent-queue`);
  await page.locator("[data-repo-section]").first().waitFor();
  assert.equal(await toggle().getAttribute("aria-pressed"), "false");
  assert.deepEqual(await cardIds(), ["al-agent-open"]);
  await page.getByText("1 queued for agents · all repos").waitFor();

  await toggle().click();
  await urlDone("1");
  // Newest first within a repo, from every agent identity; no closed_at falls back to updated_at.
  await expectDone(["al-noclosedat", "al-claude", "al-codex", "be-claude"]);
  assert.deepEqual((await cardIds()).slice(0, 1), ["al-agent-open"], "queued cards stay above the completed ones");
  await page.getByText("1 queued for agents · 4 completed · all repos").waitFor();
  await page.locator('[data-keyboard-bead-id="al-claude"]').getByText(/closed 10h ago/).waitFor();
  await page.locator('[data-keyboard-bead-id="al-claude"]').getByText("Closed", { exact: true }).waitFor();

  // The agent and repo filters apply to the completed list too.
  await page.getByLabel("Filter by agent").selectOption("codex");
  await expectDone(["al-noclosedat", "al-codex"]);
  await page.getByLabel("Filter by agent").selectOption("");
  await page.getByLabel("Filter by repo").selectOption("beta");
  await expectDone(["be-claude"]);
  await urlDone("1"); // changing a filter keeps the toggle

  // Nothing queued but something completed: the completed list is shown, not the empty state.
  await page.goto(`${base}/agent-queue?done=1&repo=beta`);
  await page.locator("[data-completed-card]").first().waitFor();
  assert.equal(await page.getByText(/Nothing is queued/).count(), 0);
  await page.goto(`${base}/agent-queue?repo=beta`);
  await page.getByText(/Nothing is queued for an agent in this repo/).waitFor();

  assert.deepEqual(errors, []);
  console.log("PASS: the queue pages list recently completed beads behind a toggle");
} finally {
  await browser.close();
}
