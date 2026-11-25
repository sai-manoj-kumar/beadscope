// Bead bui-ih7.17.6: on the all-repos pages (Needs You, Agent Queue) the Repo dropdown sits in the
// middle of the top bar, not against the left edge. Desktop: its centre is the header's centre.
// Phone: it is centred on its own row (no back arrow; the Completed toggle is on the title row), and nothing overflows or shrinks
// below a 44px target. Every request is intercepted. Set SHOTS_DIR to also save screenshots.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  // A very long name: the dropdown must stay capped so it cannot squeeze the buttons at the right.
  { id: "beta", name: "Beta Repo With An Extremely Long Name That Keeps Going And Going For Ages", path: "/tmp/beta", hasBeads: true },
];
const meta = { kind: "bd", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000 };
const shots = process.env.SHOTS_DIR;

async function open(ctx, path) {
  const page = await ctx.newPage();
  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly: true } }));
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects } }));
  await page.route(/\/api\/p\/(alpha|beta)\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/beads/stream")) return route.abort();
    if (url.pathname.endsWith("/beads")) return route.fulfill({ json: { beads: [], meta } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Filter by repo").waitFor();
  return page;
}

/**
 * Horizontal centre of the dropdowns and of the header. Needs You has the Repo dropdown alone; the
 * Agent Queue centres the Repo and Agent pair together, so the pair's outer edges are measured.
 */
const centres = (page) =>
  page.evaluate(() => {
    const boxes = ["repo", "agent"]
      .map((name) => document.querySelector(`select[aria-label='Filter by ${name}']`)?.getBoundingClientRect())
      .filter(Boolean);
    const rows = new Set(boxes.map((b) => Math.round(b.top)));
    // A pair wrapped onto two lines is centred line by line; measure the Repo dropdown then.
    const used = rows.size > 1 ? [boxes[0]] : boxes;
    const left = Math.min(...used.map((b) => b.left));
    const right = Math.max(...used.map((b) => b.right));
    const header = document.querySelector("header").getBoundingClientRect();
    return { select: (left + right) / 2, header: header.left + header.width / 2 };
  });

/** Pairs of visible header items whose boxes overlap, and items that stick out of the header's sides. */
const overlaps = (page) =>
  page.evaluate(() => {
    const header = document.querySelector("header").getBoundingClientRect();
    const items = [...document.querySelectorAll("header h1, header a, header button, header select")]
      .map((el) => ({ name: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 20), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width >= 2 && r.height >= 2);
    const out = [];
    for (const { name, r } of items) if (r.left < header.left - 1 || r.right > header.right + 1) out.push(`${name} sticks out`);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].r;
        const b = items[j].r;
        if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) out.push(`${items[i].name} overlaps ${items[j].name}`);
      }
    }
    return out;
  });

const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const path of ["/needs-you", "/agent-queue"]) {
    for (const [width, mobile] of [[1280, false], [1024, false], [768, false], [360, true], [390, true], [430, true]]) {
      const ctx = await browser.newContext({
        viewport: { width, height: mobile ? 844 : 800 },
        ...(mobile ? { hasTouch: true, isMobile: true } : {}),
      });
      const page = await open(ctx, path);
      const where = `${path} @${width}px`;
      const c = await centres(page);
      assert.ok(Math.abs(c.select - c.header) <= 1.5, `${where} dropdown is centred in the top bar: select ${c.select}, header ${c.header}`);

      // The Completed toggle stays in the header and reachable. The back arrow is desktop only (bui-ih7.21).
      const header = page.locator("header");
      assert.equal(await header.getByRole("link", { name: "Projects" }).count(), mobile ? 0 : 1, `${where} back arrow ${mobile ? "hidden on phones" : "shown on desktop"}`);
      assert.equal(await header.locator("[data-completed-toggle]").count(), 1, `${where} one Completed toggle in the header`);

      if (mobile) {
        // Bead bui-ih7.21: the toggle shares the title's row (no row of its own) and the dropdowns sit on the next row.
        const t = await page.locator("header [data-completed-toggle]").boundingBox();
        const h1 = await page.locator("header h1").boundingBox();
        const sel = await page.locator("header select").first().boundingBox();
        assert.ok(t.y < h1.y + h1.height && t.y + t.height > h1.y, `${where} Completed toggle sits on the title row`);
        assert.ok(sel.y >= t.y + t.height, `${where} dropdowns are on the row below the toggle`);
        assert.ok(t.x + t.width <= width - 8, `${where} toggle inside the right edge`);
      }
      const a = await page.evaluate(pageAudit);
      if (mobile) {
        assert.equal(a.pageScroll, false, `${where} no horizontal page scroll`);
        assert.deepEqual(a.overflow, [], `${where} past the right edge: ${a.overflow.slice(0, 3)}`);
        assert.deepEqual(a.smallTargets, [], `${where} targets under 44px: ${a.smallTargets.slice(0, 4)}`);
        assert.deepEqual(a.smallInputs, [], `${where} fields under 16px: ${a.smallInputs.slice(0, 3)}`);
      }
      // No two items in the header overlap (the dropdowns, title, back arrow, Completed and theme buttons).
      assert.deepEqual(await overlaps(page), [], `${where} header items overlap`);

      // Choosing a repo narrows the page and keeps the dropdown centred (the long name widens it).
      await page.getByLabel("Filter by repo").selectOption("beta");
      const after = await centres(page);
      assert.ok(Math.abs(after.select - after.header) <= 1.5, `${where} still centred after choosing a long repo name`);
      assert.deepEqual(await overlaps(page), [], `${where} header items overlap after choosing a long repo name`);
      if (mobile) {
        const a2 = await page.evaluate(pageAudit);
        assert.equal(a2.pageScroll, false, `${where} long repo name: no horizontal page scroll`);
        assert.deepEqual(a2.overflow, [], `${where} long repo name: past the right edge: ${a2.overflow.slice(0, 3)}`);
      }
      if (shots) await page.screenshot({ path: `${shots}/${path.slice(1)}-${width}.png`, clip: { x: 0, y: 0, width, height: mobile ? 260 : 140 } });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log("queue repo dropdown centred: ok");
