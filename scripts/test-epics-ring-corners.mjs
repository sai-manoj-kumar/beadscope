// Epics screen: the highlight ring on a selected epic follows the card's rounded corners instead of
// being clipped by them (bead bui-ih7.6). Isolated demo server only; project data is intercepted.
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
const parent = (id, parentId) => ({ issue_id: id, depends_on_id: parentId, type: "parent-child" });
const beads = [
  bead("epic-a", "Epic A", { issue_type: "epic" }),
  bead("in-epic", "Inside the epic", { dependencies: [parent("in-epic", "epic-a")] }),
  bead("loose-open", "Loose open bead"),
];

// The card is rounded-[14px] with a 1px border, so its content box has a 13px radius.
const INNER_RADIUS = 13;

async function corners(locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      tl: parseFloat(s.borderTopLeftRadius),
      tr: parseFloat(s.borderTopRightRadius),
      bl: parseFloat(s.borderBottomLeftRadius),
      br: parseFloat(s.borderBottomRightRadius),
      shadow: s.boxShadow,
    };
  });
}

const browser = await chromium.launch();
try {
  for (const viewport of [
    { width: 1500, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.setDefaultTimeout(7000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/p/demo/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/beads/stream")) return route.abort();
      if (path.endsWith("/beads")) {
        return route.fulfill({
          json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"] } },
        });
      }
      return route.fulfill({ json: beads.find((item) => path.endsWith(`/beads/${item.id}`)) ?? {} });
    });

    await page.goto(`${base}/p/demo?view=epics`);
    await page.getByRole("heading", { name: "Epics", exact: true }).waitFor();
    const header = page.locator('[data-epic-id="epic-a"] [data-keyboard-bead-id="epic-a"]');
    await header.waitFor();

    // Selecting the collapsed epic (click expands it, so collapse again) shows the ring on all four corners.
    await header.click();
    await header.click();
    await page.locator('[data-epic-id="epic-a"] [aria-expanded="false"]').waitFor();
    assert.equal(await header.getAttribute("aria-current"), "true", "the epic is selected");
    let c = await corners(header);
    assert.match(c.shadow, /inset/, "the selection ring is drawn inside the header");
    assert.deepEqual([c.tl, c.tr, c.bl, c.br], Array(4).fill(INNER_RADIUS), "collapsed: ring is rounded on every corner");

    // Expanded: only the top corners round; the children list continues below the header.
    await header.click();
    await page.locator('[data-epic-id="epic-a"] [aria-expanded="true"]').waitFor();
    c = await corners(header);
    assert.deepEqual([c.tl, c.tr], [INNER_RADIUS, INNER_RADIUS], "expanded: top corners are rounded");
    assert.deepEqual([c.bl, c.br], [0, 0], "expanded: bottom corners stay square against the children");

    // The No epic header gets the same treatment for its keyboard focus ring.
    const noEpic = page.locator("[data-no-epic-section] > [role=button]");
    c = await corners(noEpic);
    assert.deepEqual([c.tl, c.tr], [INNER_RADIUS, INNER_RADIUS], "No epic header: top corners are rounded");

    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("PASS: selected epic ring follows the card's rounded corners on desktop and phone");
} finally {
  await browser.close();
}
