// Loading states (bead bui-4e1.19): while beads load, headers say "Loading…" instead of a count of 0 or
// "nothing waiting"; once loaded they show the real numbers. The Insights throughput chart draws
// its bars, including in the default human-vs-agent split (Recharts ignores children inside a Fragment).
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();

  // Hold the beads response until we have looked at the first paint.
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/api/p/demo/beads", async (route) => {
    await gate;
    // A navigation away cancels the held request; there is nothing left to continue then.
    await route.continue().catch(() => {});
  });

  const views = [
    ["list", "List", /0 beads/],
    ["needsyou", "Needs You", /nothing waiting|0 waiting/],
    ["epics", "Epics", /\b0 epics/],
    ["focus", "Focus", /0 in flight/],
  ];
  for (const [view, heading, wrong] of views) {
    await page.goto(`${base}/p/demo?view=${view}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    await page.waitForTimeout(500);
    const text = await page.locator("body").innerText();
    assert.ok(/loading/i.test(text), `${view}: header says Loading while beads load, got "${text.replace(/\s+/g, " ").slice(0, 120)}"`);
    assert.ok(!wrong.test(text), `${view}: header does not show an empty count while loading, got "${text.replace(/\s+/g, " ").slice(0, 120)}"`);
  }
  release();
  await page.unroute("**/api/p/demo/beads");

  // Loaded: List shows the real count.
  await page.goto(`${base}/p/demo?view=list`, { waitUntil: "domcontentloaded" });
  await page.getByText(/^[1-9]\d* beads/).first().waitFor();

  // Insights: give the chart some closed beads and check its bars draw, split on and off.
  await page.route("**/api/p/demo/insights*", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.throughput = json.throughput.map((p, i) => (i % 4 === 0 ? { ...p, human: 2, agent: 1, total: 3 } : p));
    await route.fulfill({ response: res, json });
  });
  await page.goto(`${base}/p/demo?view=insights`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Insights", exact: true }).waitFor();
  const chart = page.locator(".recharts-wrapper").first();
  await chart.waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".recharts-wrapper")[0]?.querySelectorAll(".recharts-bar-rectangle").length > 0, null, { timeout: 10000 });
  assert.ok(await chart.locator(".recharts-legend-wrapper").count(), "split mode shows the legend");
  const ticks = await chart.locator(".recharts-yAxis text").count();
  assert.ok(ticks > 0, "the throughput chart has Y axis labels");
  await page.getByLabel("Split by human/agent").uncheck();
  await page.waitForFunction(() => document.querySelectorAll(".recharts-wrapper")[0]?.querySelectorAll(".recharts-bar-rectangle").length > 0, null, { timeout: 10000 });
  await ctx.close();
} finally {
  await browser.close();
}
console.log("loading states: ok");
