// Needs You also lists the live beads assigned to the current user (bead bui-ih7.17.3): on the
// all-repos page and in a project's own Needs You view, and in the badge counts. Isolated demo
// server only; all project requests are intercepted, nothing is written.
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

const YOU = "reviewer";
const data = {
  alpha: [
    bead("al-mine", "Alpha mine open", { assignee: YOU }),
    bead("al-wip", "Alpha mine in progress", { assignee: YOU, status: "in_progress" }),
    // Flagged AND assigned to you: shown once, as the question card.
    bead("al-flag", "Alpha flagged and mine", { assignee: YOU, labels: ["human"] }),
    bead("al-done", "Alpha mine closed", { assignee: YOU, status: "closed" }),
    bead("al-later", "Alpha mine deferred", { assignee: YOU, status: "deferred" }),
    bead("al-agent", "Alpha assigned to an agent", { assignee: "claude-code" }),
    bead("al-none", "Alpha unassigned"),
  ],
  beta: [bead("be-mine", "Beta mine", { assignee: YOU }), bead("be-other", "Beta other", { assignee: "someone" })],
  gamma: [bead("ga-agent", "Gamma agent work", { assignee: "claude-code" })],
};
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  { id: "beta", name: "Beta Repo", path: "/tmp/beta", hasBeads: true },
  { id: "gamma", name: "Gamma Repo", path: "/tmp/gamma", hasBeads: true },
];
let actor = YOU;

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
        json: { beads: data[id], meta: { kind: "bd", humanActor: actor, humanAllowlist: [actor], pollIntervalMs: 300000 } },
      });
    }
    return route.fulfill({ json: {} });
  });

  const cardIds = () =>
    page.locator("[data-keyboard-bead-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));
  const badge = (scope) => scope.locator("[data-needs-you-total]");

  // All repos: your live beads join the flagged ones; closed, deferred, other people's and
  // unassigned beads stay out, and a flagged bead of yours is not listed twice.
  await page.goto(`${base}/needs-you`);
  await page.locator("[data-repo-section]").first().waitFor();
  assert.deepEqual((await cardIds()).sort(), ["al-flag", "al-mine", "al-wip", "be-mine"]);
  assert.equal(await page.locator("[data-assigned-card]").count(), 3, "three plain assigned cards; the flagged one is a question card");
  assert.equal(await page.locator('[data-repo-section="gamma"]').count(), 0, "a repo with nothing for you has no section");
  await page.getByText("4 waiting on you · all repos").waitFor();
  assert.deepEqual(
    await page.getByLabel("Filter by repo").locator("option").allTextContents(),
    ["All repos", "Alpha Repo (3)", "Beta Repo (1)", "Gamma Repo"],
  );
  // The assigned card shows what the work is.
  const mine = page.locator('[data-keyboard-bead-id="al-wip"]');
  await mine.getByText("Alpha mine in progress").waitFor();
  await mine.getByText("In progress", { exact: true }).waitFor();

  // Filtering to one repo.
  await page.getByLabel("Filter by repo").selectOption("beta");
  assert.deepEqual(await cardIds(), ["be-mine"]);

  // Opening one shows its drawer over the page, without leaving it (bui-ih7.17.2).
  await page.getByLabel("Filter by repo").selectOption("");
  await page.locator('[data-keyboard-bead-id="be-mine"]').getByRole("button", { name: "be-mine", exact: true }).click();
  await page.locator("[data-bead-drawer]").waitFor();
  assert.equal(new URL(page.url()).pathname, "/needs-you");
  await page.keyboard.press("Escape");
  await page.locator("[data-bead-drawer]").waitFor({ state: "detached" });

  // A project's own Needs You view lists the same.
  await page.goto(`${base}/p/alpha?view=needsyou`);
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  assert.deepEqual((await cardIds()).sort(), ["al-flag", "al-mine", "al-wip"]);
  await page.getByText("3 waiting on you", { exact: true }).waitFor();
  await page.goto(`${base}/p/gamma?view=needsyou`);
  await page.getByText(/Nothing needs you right now.*beads assigned to you are listed too/).waitFor();

  // The badges agree with the pages.
  await page.goto(`${base}/`);
  const launcherLink = page.getByRole("link", { name: /^Needs You/ });
  await badge(launcherLink).waitFor();
  assert.equal(await badge(launcherLink).textContent(), "4");
  await page.goto(`${base}/p/gamma`);
  const sidebarLink = page.locator('aside a[href="/needs-you"]');
  await badge(sidebarLink).waitFor();
  assert.equal(await badge(sidebarLink).textContent(), "4");

  // Someone else is the current user: only their beads are listed (plus the flagged bead, which
  // needs a human whoever they are).
  actor = "someone";
  await page.goto(`${base}/needs-you`);
  await page.locator("[data-repo-section]").first().waitFor();
  assert.deepEqual((await cardIds()).sort(), ["al-flag", "be-other"]);

  assert.deepEqual(errors, []);
  console.log("PASS: Needs You lists the live beads assigned to the current user");
} finally {
  await browser.close();
}
