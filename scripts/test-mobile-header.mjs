// Board and List page header at phone width (bead bui-4e1.13): the New button and the search field
// are on screen, the facet filters sit behind a Filters button, and desktop is unchanged.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const view of ["board", "list"]) {
    // Phone
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await phone.newPage();
    await page.goto(`${base}/p/demo?view=${view}`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor();
    const header = page.locator("header", { has: page.locator("h1") });
    const newBtn = header.getByRole("button", { name: "New", exact: true });
    const nb = await newBtn.boundingBox();
    assert.ok(nb && nb.x + nb.width <= 390, `${view}: New must be fully on screen, got ${JSON.stringify(nb)}`);
    assert.ok(nb.height >= 44, `${view}: New must be a 44px target, got ${nb.height}`);
    const search = header.locator("input[data-search]");
    assert.ok((await search.boundingBox()).width >= 280, `${view}: search must be full width on phones`);
    const filters = header.getByRole("button", { name: /^Filters/ });
    assert.equal(await filters.getAttribute("aria-expanded"), "false", `${view}: facets start collapsed`);
    assert.equal(await header.getByRole("button", { name: "Status" }).isVisible(), false, `${view}: Status hidden while collapsed`);
    await filters.click();
    assert.equal(await filters.getAttribute("aria-expanded"), "true");
    for (const name of ["Status", "Type", "Priority", "Archived"]) {
      const box = await header.getByRole("button", { name: new RegExp(`^${name}`) }).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `${view}: ${name} must be on screen once opened, got ${JSON.stringify(box)}`);
    }
    await filters.click();
    assert.equal(await header.getByRole("button", { name: "Status" }).isVisible(), false, `${view}: Filters toggles closed again`);
    await phone.close();

    // Desktop: facets inline, no Filters button
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const dpage = await desktop.newPage();
    await dpage.goto(`${base}/p/demo?view=${view}`, { waitUntil: "domcontentloaded" });
    await dpage.locator("h1").first().waitFor();
    const dheader = dpage.locator("header", { has: dpage.locator("h1") });
    assert.equal(await dheader.getByRole("button", { name: /^Filters/ }).isVisible(), false, `${view}: no Filters button on desktop`);
    assert.equal(await dheader.getByRole("button", { name: "Status" }).isVisible(), true, `${view}: Status inline on desktop`);
    await desktop.close();
  }
} finally {
  await browser.close();
}
console.log("mobile header: ok");
