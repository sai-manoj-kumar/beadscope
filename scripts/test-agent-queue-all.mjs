// Agent Queue across every repo (bead bui-ih7.5): /agent-queue gathers the open beads assigned to an
// agent identity from all registered projects, groups them by repo, and filters by repo and by agent.
// Isolated demo server only; all project requests are intercepted, nothing is written.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "Set BEADSCOPE_TEST_URL to an isolated app server");

const bead = (id, title, extra = {}) => ({
  id,
  title,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

const agents = [
  { id: "claude-code", name: "claude-code", enabled: true },
  { id: "codex", name: "codex", enabled: true },
  { id: "gemini", name: "gemini", enabled: false },
];
const data = {
  alpha: [
    bead("al-1", "Alpha claude work", { assignee: "claude-code", priority: 2 }),
    bead("al-2", "Alpha claude in flight", { assignee: "claude-code", status: "in_progress", priority: 3 }),
    bead("al-3", "Alpha codex work", { assignee: "codex" }),
    bead("al-human", "Alpha human work", { assignee: "reviewer" }),
    bead("al-none", "Alpha unassigned"),
    bead("al-done", "Alpha finished", { assignee: "claude-code", status: "closed" }),
    bead("al-old", "Alpha archived", { assignee: "claude-code", labels: ["archived"] }),
    bead("al-off", "Alpha for a switched-off agent", { assignee: "gemini" }),
  ],
  beta: [
    bead("be-1", "Beta claude work", { assignee: "claude-code", priority: 0 }),
    bead("be-blocked", "Beta claude blocked", {
      assignee: "claude-code",
      dependencies: [{ issue_id: "be-blocked", depends_on_id: "be-1", type: "blocks" }],
    }),
  ],
  gamma: [bead("ga-plain", "Gamma plain work")],
};
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  { id: "beta", name: "Beta Repo", path: "/tmp/beta", hasBeads: true },
  { id: "gamma", name: "Gamma Repo", path: "/tmp/gamma", hasBeads: true },
  // Registered but unreadable: its request fails. It must not hide the other repos.
  { id: "delta", name: "Delta Repo", path: "/tmp/delta", hasBeads: true },
  // Folder that lost its .beads: left out of the page and the filter.
  { id: "eps", name: "Eps Repo", path: "/tmp/eps", hasBeads: false },
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
  await page.route(/\/api\/p\/(alpha|beta|gamma|delta|eps)\//, async (route) => {
    const url = new URL(route.request().url());
    const [, , , id, ...rest] = url.pathname.split("/");
    if (url.pathname.endsWith("/beads/stream")) return route.abort();
    assert.notEqual(id, "eps", "a repo without .beads is never requested");
    if (id === "delta") return route.fulfill({ status: 500, json: { error: "bd unavailable" } });
    if (rest.join("/") === "beads") {
      return route.fulfill({
        json: { beads: data[id], meta: { kind: "bd", humanActor: "reviewer", humanAllowlist: ["reviewer"], agents, pollIntervalMs: 300000 } },
      });
    }
    return route.fulfill({ json: {} });
  });

  const cardIds = () =>
    page.locator("[data-keyboard-bead-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));

  await page.goto(`${base}/agent-queue`);
  await page.getByRole("heading", { name: "Agent Queue", exact: true }).first().waitFor();
  await page.locator("[data-repo-section]").first().waitFor();
  await page.getByText(/Couldn’t read Delta Repo/).waitFor();

  // All repos, all agents: open work of every agent identity (even a switched-off one), in flight
  // first, then blocked, then ready by priority. Closed, archived, human and unassigned beads are left out.
  assert.deepEqual(await cardIds(), ["al-2", "al-1", "al-3", "al-off", "be-blocked", "be-1"]);
  assert.equal(await page.locator('[data-repo-section="gamma"]').count(), 0, "a repo with nothing queued has no section");
  await page.getByText("6 queued for agents · all repos").waitFor();
  assert.equal(await page.locator('[data-keyboard-bead-id="be-blocked"]').getByText("Blocked", { exact: true }).count(), 1);

  // Repo filter lists every readable repo with its count; agent filter lists the enabled identities only.
  const repoFilter = page.getByLabel("Filter by repo");
  const agentFilter = page.getByLabel("Filter by agent");
  assert.deepEqual(await repoFilter.locator("option").allTextContents(), ["All repos", "Alpha Repo (4)", "Beta Repo (2)", "Gamma Repo", "Delta Repo"]);
  assert.deepEqual(await agentFilter.locator("option").allTextContents(), ["All agents", "claude-code (4)", "codex (1)"]);

  // Agent filter narrows the page; counts for the repos follow it; the URL carries it.
  await agentFilter.selectOption("codex");
  assert.deepEqual(await cardIds(), ["al-3"]);
  assert.equal(new URL(page.url()).searchParams.get("agent"), "codex");
  assert.deepEqual(await repoFilter.locator("option").allTextContents(), ["All repos", "Alpha Repo (1)", "Beta Repo", "Gamma Repo", "Delta Repo"]);
  await agentFilter.selectOption("claude-code");
  assert.deepEqual((await cardIds()).sort(), ["al-1", "al-2", "be-1", "be-blocked"]);

  // Repo and agent filters combine.
  await repoFilter.selectOption("beta");
  assert.deepEqual(await cardIds(), ["be-blocked", "be-1"]);
  assert.equal(new URL(page.url()).searchParams.get("repo"), "beta");
  await page.getByText("2 queued for agents · 1 repo").waitFor();
  await agentFilter.selectOption("codex");
  await page.getByText(/Nothing is queued for an agent in this repo for codex/).waitFor();
  await agentFilter.selectOption("");
  await repoFilter.selectOption("gamma");
  await page.getByText(/Nothing is queued for an agent in this repo/).waitFor();
  assert.equal(await page.getByText(/Couldn’t read/).count(), 0, "a failing repo is not reported while it is filtered out");
  await repoFilter.selectOption("delta");
  await page.getByText(/Nothing queued in the repos that could be read/).waitFor();
  await repoFilter.selectOption("");
  assert.equal((await cardIds()).length, 6);
  assert.equal(new URL(page.url()).searchParams.has("repo"), false);

  // Links with a repo / agent open already filtered; unknown or switched-off values fall back to All.
  await page.goto(`${base}/agent-queue?repo=alpha&agent=claude-code`);
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  assert.deepEqual((await cardIds()).sort(), ["al-1", "al-2"]);
  await page.goto(`${base}/agent-queue?repo=nope&agent=gemini`);
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  assert.equal((await cardIds()).length, 6);

  // Opening a bead goes to its repo with the drawer on it.
  await page.locator('[data-keyboard-bead-id="be-1"]').click();
  await page.waitForURL(/\/p\/beta\?bead=be-1/);

  // Entry point: the launcher links here.
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: "Agent Queue" }).click();
  await page.waitForURL(/\/agent-queue$/);

  assert.deepEqual(errors, []);
  console.log("PASS: /agent-queue lists every repo's agent-assigned beads and filters by repo and by agent");
} finally {
  await browser.close();
}
