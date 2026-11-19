// Settings shows the running build's version (bead bui-82v): "Beadscope v<version>" read from
// package.json at build time, in a card with the shared look; `beadscope --version` prints the same.
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { pageAudit } from "./mobile-audit.mjs";

const base = process.env.BEADSCOPE_TEST_URL;
assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
const { version } = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// The CLI prints the version and exits 0, for both spellings.
for (const flag of ["--version", "-v"]) {
  const out = execFileSync("node", ["bin/beadscope.mjs", flag], { encoding: "utf8" }).trim();
  assert.equal(out, version, `beadscope ${flag} prints the package.json version`);
}

const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
try {
  for (const [name, viewport, mobile] of [["desktop", { width: 1280, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    await page.goto(`${base}/p/demo?view=settings`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    const line = page.getByTestId("app-version");
    await line.waitFor();
    assert.equal((await line.innerText()).trim(), `Beadscope v${version}`, `${name}: version line`);
    const inCard = await line.evaluate((el) => !!el.closest("section[data-phone-targets]"));
    assert.ok(inCard, `${name}: the version sits in a Settings card`);
    if (mobile) {
      const a = await page.evaluate(pageAudit);
      assert.equal(a.pageScroll, false, "no horizontal page scroll");
      assert.deepEqual(a.overflow, [], "nothing past the right edge");
    }
    await ctx.close();
  }
  console.log(`settings version ok: v${version}`);
} finally {
  await browser.close();
}
