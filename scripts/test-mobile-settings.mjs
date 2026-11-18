// Phone Settings and Publish (beads bui-4e1.10, bui-4e1.18): every Settings card shares one padding
// and title style, each on/off control sits under its explanation at 44px, and the Publish form's
// controls are 44px. Desktop keeps the control beside the text.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });

async function openSettings(page) {
  await page.goto(`${base}/p/demo?view=settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Agents", exact: true }).waitFor();
  await page.waitForTimeout(400);
}

try {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await openSettings(page);
    const where = `@${width}px`;

    // One look for every card.
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll("section[data-phone-targets]")].map((s) => {
        const h = s.querySelector("h2");
        const cs = getComputedStyle(s);
        const hs = getComputedStyle(h);
        return { title: h.textContent, pad: cs.padding, size: hs.fontSize, weight: hs.fontWeight };
      }),
    );
    assert.ok(cards.length >= 8, `${where} expected the Settings cards, got ${cards.length}`);
    for (const c of cards) {
      assert.deepEqual({ pad: c.pad, size: c.size, weight: c.weight }, { pad: cards[0].pad, size: cards[0].size, weight: cards[0].weight }, `${where} card "${c.title}" matches the first card`);
    }

    // Each toggle sits under its explanation, full text width, 44px tall.
    for (const [role, name] of [["button", /(Enable|Disable) read-only mode/], ["switch", "Check for new versions"]]) {
      const btn = page.getByRole(role, { name }).first();
      const row = btn.locator("xpath=ancestor::div[contains(@class,'justify-between')][1]");
      const desc = row.locator("div.text-meta").first();
      const b = await btn.boundingBox();
      const d = await desc.boundingBox();
      assert.ok(b.height >= 44, `${where} ${name} is 44px, got ${b.height}`);
      assert.ok(b.y >= d.y + d.height - 1, `${where} ${name} sits under its explanation`);
      if (role === "switch") assert.ok(d.width >= width - 80, `${where} explanation uses the card width, got ${d.width}`);
    }

    const a = await page.evaluate(pageAudit);
    assert.equal(a.pageScroll, false, `${where} no horizontal page scroll`);
    assert.deepEqual(a.overflow, [], `${where} past the right edge: ${a.overflow.slice(0, 3)}`);
    assert.deepEqual(a.smallTargets, [], `${where} small targets: ${a.smallTargets.slice(0, 3)}`);

    await page.goto(`${base}/p/demo?view=publish`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Publish", exact: true }).waitFor();
    await page.waitForTimeout(400);
    const p = await page.evaluate(pageAudit);
    assert.deepEqual(p.overflow, [], `${where} publish past the right edge: ${p.overflow.slice(0, 3)}`);
    assert.deepEqual(p.smallTargets, [], `${where} publish small targets: ${p.smallTargets.slice(0, 3)}`);
    await ctx.close();
  }

  // Desktop keeps the control beside the text.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openSettings(page);
  const btn = page.getByRole("button", { name: /(Enable|Disable) read-only mode/ });
  const row = btn.locator("xpath=ancestor::div[contains(@class,'justify-between')][1]");
  const b = await btn.boundingBox();
  const d = await row.locator("div.text-meta").first().boundingBox();
  assert.ok(b.x >= d.x + d.width - 1, "desktop: the control sits beside the explanation");
  await ctx.close();
} finally {
  await browser.close();
}
console.log("mobile settings: ok");
