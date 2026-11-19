// Needs You across every repo (bead bui-ih7.4): /needs-you gathers the human-flagged beads and ready
// human gates of all registered projects, groups them by repo, filters by repo, and acts on the
// right project. Bead bui-ih7.7 adds live updates over each repo's change stream and a single
// selection ring across repos. Isolated demo server only; all project requests are intercepted, nothing is written.
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
  // Registered but unreadable: its request fails. It must not hide the other repos.
  { id: "delta", name: "Delta Repo", path: "/tmp/delta", hasBeads: true },
  // Folder that lost its .beads: left out of the page and the filter.
  { id: "eps", name: "Eps Repo", path: "/tmp/eps", hasBeads: false },
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

  // Stand-in for EventSource: remembers every stream the page opens so the test can send a change.
  await page.addInitScript(() => {
    window.__streams = [];
    window.EventSource = class {
      constructor(url) {
        this.url = url;
        this.closed = false;
        this.listeners = {};
        window.__streams.push(this);
      }
      addEventListener(type, fn) {
        (this.listeners[type] ??= []).push(fn);
      }
      close() {
        this.closed = true;
      }
    };
  });
  const sendChange = (repo) =>
    page.evaluate((r) => {
      for (const es of window.__streams) {
        if (!es.closed && es.url === `/api/p/${r}/beads/stream`) (es.listeners.change ?? []).forEach((fn) => fn(new Event("change")));
      }
    }, repo);

  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly } }));
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects } }));
  await page.route(/\/api\/p\/(alpha|beta|gamma|delta|eps)\//, async (route) => {
    const url = new URL(route.request().url());
    const [, , , id, ...rest] = url.pathname.split("/");
    if (url.pathname.endsWith("/beads/stream")) return route.abort();
    assert.notEqual(id, "eps", "a repo without .beads is never requested");
    if (id === "delta") return route.fulfill({ status: 500, json: { error: "bd unavailable" } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      posts.push({ project: id, path: url.pathname, body });
      // Apply the write so the refetch drops the card.
      const target = decodeURIComponent(url.pathname.split("/")[5]);
      data[id] = data[id].map((b) =>
        b.id !== target ? b : body.action === "dismiss" ? { ...b, labels: [] } : { ...b, status: body.status },
      );
      return route.fulfill({ json: data[id].find((b) => b.id === target) });
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
  await page.getByText(/Couldn’t read Delta Repo/).waitFor();

  // All repos: flagged beads and ready gates from every repo that has any; repos with none are left out.
  assert.deepEqual((await cardIds()).sort(), ["al-1", "al-gate", "be-1"]);
  assert.equal(await page.locator('[data-repo-section="gamma"]').count(), 0, "a repo with nothing waiting has no section");
  assert.equal(await page.locator("[data-repo-section]").count(), 2);
  await page.getByRole("heading", { name: /^Alpha Repo/ }).waitFor();
  await page.getByRole("heading", { name: /^Beta Repo/ }).waitFor();
  await page.getByText("3 waiting on you · all repos").waitFor();

  // Repo filter lists every repo with its count.
  const filter = page.getByLabel("Filter by repo");
  assert.deepEqual(await filter.locator("option").allTextContents(), ["All repos", "Alpha Repo (2)", "Beta Repo (1)", "Gamma Repo", "Delta Repo"]);
  assert.equal(await page.getByText(/Couldn’t read/).count(), 1, "only the repo that failed is reported");

  // Filtering narrows the page and the URL carries it.
  await filter.selectOption("beta");
  assert.deepEqual(await cardIds(), ["be-1"]);
  assert.equal(new URL(page.url()).searchParams.get("repo"), "beta");
  await page.getByText("1 waiting on you · 1 repo").waitFor();
  await filter.selectOption("gamma");
  await page.getByText(/Nothing needs you right now in this repo/).waitFor();
  assert.equal(await page.getByText(/Couldn’t read/).count(), 0, "a failing repo is not reported while it is filtered out");
  await filter.selectOption("delta");
  await page.getByText(/Couldn’t read Delta Repo/).waitFor();
  await page.getByText(/Nothing waiting in the repos that could be read/).waitFor();
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
  assert.equal(await page.getByRole("button", { name: "Approve", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("textbox").first().isDisabled(), true);

  // Acting hits the card's own project, not the first or the filtered one.
  readOnly = false;
  await page.reload();
  await page.locator("[data-keyboard-bead-id]").first().waitFor();
  await page.locator('[data-keyboard-bead-id="be-1"]').getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.locator('[data-keyboard-bead-id="al-gate"]').getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-keyboard-bead-id="be-1"]') && !document.querySelector('[data-keyboard-bead-id="al-gate"]'));
  assert.deepEqual(await cardIds(), ["al-1"], "answered cards leave the page after the refetch");
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

  // Live (bui-ih7.7): a flag raised in a repo shows up when its stream signals a change, without
  // waiting for the (here five-minute) poll.
  assert.deepEqual(
    await page.evaluate(() => window.__streams.filter((es) => !es.closed).map((es) => es.url).sort()),
    ["alpha", "beta", "delta", "gamma"].map((r) => `/api/p/${r}/beads/stream`),
    "every repo on the page is streamed",
  );
  data.beta = [...data.beta, bead("be-3", "Beta new flag", { labels: ["human"] })];
  await page.waitForTimeout(500);
  assert.deepEqual(await cardIds(), ["al-1"], "nothing changes before the stream signals");
  await sendChange("beta");
  await page.locator('[data-keyboard-bead-id="be-3"]').waitFor();
  assert.deepEqual((await cardIds()).sort(), ["al-1", "be-3"]);

  // One selection ring across repos: focusing a card in another repo moves it.
  await page.locator('[data-keyboard-bead-id="al-1"]').focus();
  await page.locator('[data-keyboard-bead-id="be-3"]').focus();
  assert.deepEqual(
    await page.locator('[aria-current="true"][data-keyboard-bead-id]').evaluateAll((els) => els.map((e) => e.getAttribute("data-keyboard-bead-id"))),
    ["be-3"],
    "only the last-focused card is selected, even across repos",
  );
  // Filtering to one repo stops streaming the others.
  await page.getByLabel("Filter by repo").selectOption("alpha");
  await page.waitForFunction(() => window.__streams.filter((es) => !es.closed).length === 1);

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
