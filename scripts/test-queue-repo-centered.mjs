// Bead bui-ih7.17.6: on the all-repos pages (Needs You, Agent Queue) the Repo dropdown sits in the
// middle of the top bar, not against the left edge. Desktop: its centre is the header's centre.
// Phone: it is centred on its own row beside the back arrow, and nothing overflows or shrinks
// below a 44px target. Every request is intercepted. Set SHOTS_DIR to also save screenshots.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  { id: "beta", name: "Beta Repo With A Fairly Long Name", path: "/tmp/beta", hasBeads: true },
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

      // The back arrow and the Completed toggle stay in the header, and the toggle is still reachable.
      const header = page.locator("header");
      await header.getByRole("link", { name: "Projects" }).waitFor();
      assert.equal(await header.locator("[data-completed-toggle]").count(), 1, `${where} one Completed toggle in the header`);

      const a = await page.evaluate(pageAudit);
      if (mobile) {
        assert.equal(a.pageScroll, false, `${where} no horizontal page scroll`);
        assert.deepEqual(a.overflow, [], `${where} past the right edge: ${a.overflow.slice(0, 3)}`);
        assert.deepEqual(a.smallTargets, [], `${where} targets under 44px: ${a.smallTargets.slice(0, 4)}`);
        assert.deepEqual(a.smallInputs, [], `${where} fields under 16px: ${a.smallInputs.slice(0, 3)}`);
      }
      // Nothing in the header overlaps the dropdown.
      const overlaps = await page.evaluate(() => {
        const select = document.querySelector("select[aria-label='Filter by repo']").getBoundingClientRect();
        const out = [];
        for (const el of document.querySelectorAll("header h1, header a, header button, header [data-completed-toggle]")) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.left < select.right - 1 && r.right > select.left + 1 && r.top < select.bottom - 1 && r.bottom > select.top + 1) {
            out.push(el.tagName.toLowerCase() + " " + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20));
          }
        }
        return out;
      });
      assert.deepEqual(overlaps, [], `${where} header items overlap the dropdown`);

      // Choosing a repo narrows the page and keeps the dropdown centred (the long name widens it).
      await page.getByLabel("Filter by repo").selectOption("beta");
      const after = await centres(page);
      assert.ok(Math.abs(after.select - after.header) <= 1.5, `${where} still centred after choosing a long repo name`);
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
