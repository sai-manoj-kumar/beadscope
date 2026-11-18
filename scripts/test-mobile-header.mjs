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
    // Desktop header stays compact (bead bui-4e1.24): at 1280px the title, search, facets, Sort
    // and New must not push the actions onto a second row. Compare against the search field's row.
    const hb = await dheader.boundingBox();
    const sb = await dheader.locator("input[data-search]").boundingBox();
    const nbd = await dheader.getByRole("button", { name: "New", exact: true }).boundingBox();
    assert.ok(Math.abs(nbd.y + nbd.height / 2 - (sb.y + sb.height / 2)) < 8, `${view}: New must share the search row at 1280px, got New ${JSON.stringify(nbd)} search ${JSON.stringify(sb)}`);
    if (view === "board") {
      const sort = await dheader.getByLabel("Sort board cards").boundingBox();
      assert.ok(Math.abs(sort.y + sort.height / 2 - (sb.y + sb.height / 2)) < 8, `board: Sort must share the search row at 1280px, got ${JSON.stringify(sort)}`);
    }
    assert.ok(hb.height < 130, `${view}: desktop header must fit in at most two rows, got ${hb.height}px`);
    if (view === "board") {
      // Below 1440px the facets sit on their own row under the title, search, Sort and New.
      const status = await dheader.getByRole("button", { name: "Status" }).boundingBox();
      assert.ok(status.y > nbd.y + nbd.height, `board: facets must sit on their own row at 1280px, got Status ${JSON.stringify(status)}`);
    }
    await desktop.close();

    // Wide desktop: the Board keeps its single header row.
    const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wpage = await wide.newPage();
    await wpage.goto(`${base}/p/demo?view=${view}`, { waitUntil: "domcontentloaded" });
    await wpage.locator("h1").first().waitFor();
    const wheader = wpage.locator("header", { has: wpage.locator("h1") });
    const wb = await wheader.boundingBox();
    assert.ok(wb.height < 85, `${view}: header must stay one row at 1440px, got ${wb.height}px`);
    await wide.close();
  }
} finally {
  await browser.close();
}
console.log("mobile header: ok");
