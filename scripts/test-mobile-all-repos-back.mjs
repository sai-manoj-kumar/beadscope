// Beads bui-4e1.28, bui-ih7.17.1: on the all-repos pages (Needs You, Agent Queue) the header shows the
// back arrow alone, with no "Projects" text beside it on any width. On phones it is a 44px target and
// "Repo" is hidden too. The names stay for screen readers. Every request is intercepted.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const projects = [
  { id: "alpha", name: "Alpha Repo", path: "/tmp/alpha", hasBeads: true },
  { id: "beta", name: "Beta Repo", path: "/tmp/beta", hasBeads: true },
];
const meta = { kind: "bd", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000 };

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

const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const path of ["/needs-you", "/agent-queue"]) {
    for (const width of [360, 390, 430]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
      const page = await open(ctx, path);
      const where = `${path} @${width}px`;
      const back = page.getByRole("link", { name: "Projects" });
      assert.equal(await back.getAttribute("href"), "/", `${where} the back link goes to the project list`);
      const box = await back.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${where} back link is 44px, got ${box.width}x${box.height}`);
      // No visible text beside the arrow: the link is only as wide as a tap target.
      assert.ok(box.width < 60, `${where} back link shows the arrow alone, got width ${box.width}`);
      // Nothing visible reads "Projects" or "Repo" (screen-reader-only text is clipped to 1px).
      const visible = await page.locator("main, body").first().evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("span")) {
          const t = el.textContent.trim();
          if ((t === "Projects" || t === "Repo") && el.getBoundingClientRect().width > 2) out.push(t);
        }
        return out;
      });
      assert.deepEqual(visible, [], `${where} no visible text beside the back arrow`);
      const a = await page.evaluate(pageAudit);
      assert.equal(a.pageScroll, false, `${where} no horizontal page scroll`);
      assert.deepEqual(a.overflow, [], `${where} past the right edge: ${a.overflow.slice(0, 3)}`);
      assert.deepEqual(a.smallTargets, [], `${where} targets under 44px: ${a.smallTargets.slice(0, 4)}`);
      await ctx.close();
    }
    // Desktop shows the arrow alone too (bui-ih7.17.1); the link keeps its name for screen readers.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await open(ctx, path);
    const back = page.getByRole("link", { name: "Projects" });
    assert.equal(await back.getAttribute("href"), "/", `${path} desktop back link goes to the project list`);
    const shown = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("span")) {
        if (el.textContent.trim() === "Projects" && el.getBoundingClientRect().width > 2) out.push("Projects");
      }
      return out;
    });
    assert.deepEqual(shown, [], `${path} desktop shows no "Projects" text beside the arrow`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log("mobile all-repos back link: ok");
