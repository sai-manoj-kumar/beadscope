// Needs You across every repo (bead bui-ih7.4): /needs-you gathers the human-flagged beads and ready
// human gates of all registered projects, groups them by repo, filters by repo, and acts on the
// right project. Isolated demo server only; all project requests are intercepted, nothing is written.
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

const data = {
  alpha: [
    bead("al-1", "Alpha question", { labels: ["human"] }),
    bead("al-gate", "Approve alpha release", { issue_type: "gate", await_type: "human" }),
    bead("al-plain", "Alpha plain work"),
    bead("al-done", "Alpha answered", { labels: ["human"], status: "closed" }),
  ],
  beta: [bead("be-1", "Beta question", { labels: ["human"] })],
  gamma: [bead("ga-plain", "Gamma plain work")],
};
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  { id: "beta", name: "Beta Repo", path: "/tmp/beta", hasBeads: true },
  { id: "gamma", name: "Gamma Repo", path: "/tmp/gamma", hasBeads: true },
];
const posts = [];
let readOnly = true;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly } }));
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects } }));
  await page.route(/\/api\/p\/(alpha|beta|gamma)\//, async (route) => {
    const url = new URL(route.request().url());
    const [, , , id, ...rest] = url.pathname.split("/");
    if (url.pathname.endsWith("/beads/stream")) return route.abort();
    if (route.request().method() === "POST") {
      posts.push({ project: id, path: url.pathname, body: route.request().postDataJSON() });
      return route.fulfill({ json: data[id][0] });
    }
    if (rest.join("/") === "beads") {
      return route.fulfill({
        json: { beads: data[id], meta: { kind: "bd", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000 } },
      });
    }
    return route.fulfill({ json: {} });
  });

  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const cardIds = () =>
    page.locator("[data-keyboard-bead-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id")));

  await page.goto(`${base}/needs-you`);
  await heading("Needs You").first().waitFor();
  await page.locator("[data-repo-section]").first().waitFor();

  // All repos: flagged beads and ready gates from every repo that has any; repos with none are left out.
  assert.deepEqual((await cardIds()).sort(), ["al-1", "al-gate", "be-1"]);
  assert.equal(await page.locator('[data-repo-section="gamma"]').count(), 0, "a repo with nothing waiting has no section");
  assert.equal(await page.locator("[data-repo-section]").count(), 2);
  await page.getByRole("heading", { name: /^Alpha Repo/ }).waitFor();
  await page.getByRole("heading", { name: /^Beta Repo/ }).waitFor();
  await page.getByText("3 waiting on you · all repos").waitFor();

  // Repo filter lists every repo with its count.
  const filter = page.getByLabel("Filter by repo");
  assert.deepEqual(await filter.locator("option").allTextContents(), ["All repos", "Alpha Repo (2)", "Beta Repo (1)", "Gamma Repo"]);

  // Filtering narrows the page and the URL carries it.
  await filter.selectOption("beta");
  assert.deepEqual(await cardIds(), ["be-1"]);
  assert.equal(new URL(page.url()).searchParams.get("repo"), "beta");
  await page.getByText("1 waiting on you · 1 repo").waitFor();
  await filter.selectOption("gamma");
  await page.getByText(/Nothing needs you right now in this repo/).waitFor();
  await filter.selectOption("");
  assert.equal((await cardIds()).length, 3);
  assert.equal(new URL(page.url()).searchParams.has("repo"), false);

  // A link with a repo opens already filtered; an unknown repo falls back to All.
  await page.goto(`${base}/needs-you?repo=alpha`);
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  assert.deepEqual((await cardIds()).sort(), ["al-1", "al-gate"]);
  await page.goto(`${base}/needs-you?repo=nope`);
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  assert.equal((await cardIds()).length, 3);

  // Read-only viewers cannot act.
  assert.equal(await page.getByRole("button", { name: "Dismiss", exact: true }).first().isDisabled(), true);

  // Acting hits the card's own project, not the first or the filtered one.
  readOnly = false;
  await page.reload();
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  await page.locator('[data-keyboard-bead-id="be-1"]').getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.locator('[data-keyboard-bead-id="al-gate"]').getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(posts.length, 2, "one write per action");
  assert.deepEqual(
    { project: posts[0].project, path: posts[0].path, action: posts[0].body.action },
    { project: "beta", path: "/api/p/beta/beads/be-1/human", action: "dismiss" },
  );
  assert.deepEqual(
    { project: posts[1].project, status: posts[1].body.status },
    { project: "alpha", status: "closed" },
    "approving a gate closes it in its own repo",
  );

  // Opening a bead goes to its repo with the drawer on it.
  await page.locator('[data-keyboard-bead-id="al-1"]').getByRole("button", { name: "al-1", exact: true }).click();
  await page.waitForURL(/\/p\/alpha\?bead=al-1/);

  // Entry points: the launcher and a project's sidebar both link here.
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: "Needs You" }).click();
  await page.waitForURL(/\/needs-you$/);

  assert.deepEqual(errors, []);
  console.log("PASS: /needs-you lists every repo's waiting beads and gates, filters by repo, and acts on the right project");
} finally {
  await browser.close();
}
