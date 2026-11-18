// The quality gate (see scripts/test-quality-phone.mjs and test-quality-desktop.mjs, which run it):
// every screen state in scripts/ui-states.mjs, on one device size, in the light and the dark theme,
// is audited by scripts/quality-audit.mjs:
//
//   - no icon above its label, no text squeezed into a sliver, no sideways page scroll
//   - every button, link and field has an accessible name; no duplicate ids; no image without alt
//   - no text below WCAG AA contrast (4.5:1, 3:1 for large text) against its background
//   - nothing logs a console error or throws
//   - every state can still be reached (a renamed button fails the test instead of shrinking coverage)
//
// Each state is loaded once and audited in both themes (the app follows prefers-color-scheme live).
// The phone rules that need a sized viewport (44px targets, 16px fields, nothing past the edge) stay
// in test-mobile-layout.mjs and test-mobile-shell.mjs. To aim this at a real project while
// developing:
//   BEADSCOPE_TEST_URL=http://localhost:3000 QUALITY_PROJECT=beadscope QUALITY_BEAD=<id> node scripts/test-quality-desktop.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { DEVICES, visitStates } from "./ui-states.mjs";
import { describe, qualityAudit } from "./quality-audit.mjs";

export async function runQualityGate(device) {
  const base = process.env.BEADSCOPE_TEST_URL;
  assert.ok(base, "BEADSCOPE_TEST_URL is required; use an isolated demo server");
  const projectUrl = `${base}/p/${process.env.QUALITY_PROJECT ?? "demo"}`;
  const beadId = process.env.QUALITY_BEAD ?? "bd-1a09.1";

  const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
  const problems = [];
  let audited = 0;
  try {
    const context = await browser.newContext({ ...DEVICES[device], colorScheme: "light" });
    // Audit the settled state: colour and slide transitions would otherwise be measured half-way.
    await context.addInitScript(() => {
      const add = () => {
        const style = document.createElement("style");
        style.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
        document.head.appendChild(style);
      };
      if (document.head) add();
      else document.addEventListener("DOMContentLoaded", add);
    });
    const page = await context.newPage();
    let current = "load";
    page.on("pageerror", (e) => problems.push(`${device}/${current}: uncaught error: ${e.message.split("\n")[0]}`));
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`${device}/${current}: console error: ${m.text().split("\n")[0].slice(0, 140)}`);
    });
    await visitStates(page, {
      device,
      projectUrl,
      beadId,
      origin: base,
      settleMs: 350,
      onMissing: (state, error) => problems.push(`${device}/${state}: could not reach this state: ${String(error.message).split("\n")[0]}`),
      onState: async (state, scope) => {
        current = state;
        if (process.env.QUALITY_VERBOSE) console.log(`${device}/${state}`);
        audited++;
        for (const scheme of ["light", "dark"]) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.waitForTimeout(150);
          for (const issue of describe(await page.evaluate(qualityAudit, scope))) problems.push(`${device}/${scheme}/${state}: ${issue}`);
        }
        await page.emulateMedia({ colorScheme: "light" });
        await page.waitForTimeout(80);
      },
    });
    await context.close();
  } finally {
    await browser.close();
  }
  assert.ok(audited >= 18, `expected to audit at least 18 states on ${device}, got ${audited}`);
  assert.equal(problems.length, 0, `${problems.length} quality problem(s):\n${problems.join("\n")}`);
  console.log(`quality gate (${device}): ok (${audited} states × 2 themes)`);
}
