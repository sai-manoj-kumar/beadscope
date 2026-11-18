// Takes a screenshot of every screen state (scripts/ui-states.mjs), for a person to look at.
//
//   node scripts/review-screenshots.mjs http://localhost:3000/p/beadscope <out-dir> [bead-id]
//
// Phone (390x844, touch) and desktop (1280x860), light and dark. One PNG per state, named
// <device>-<theme>-<state>.png, and contact sheets (sheet-*.png) that put several states side by
// side so a whole pass can be read in a few images. scripts/quality-gate.mjs audits the same
// states automatically; this is for the things a script cannot judge.
//
// It never creates or edits anything: overlays are opened and left open for the photo only.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEVICES, visitStates } from "./ui-states.mjs";

const [projectUrl, outDir, beadId = ""] = process.argv.slice(2);
if (!projectUrl || !outDir) {
  console.error("usage: node scripts/review-screenshots.mjs <http://host/p/project> <out-dir> [bead-id]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BEADSCOPE_BROWSER_EXECUTABLE || undefined });
const problems = [];
const all = {};

for (const device of Object.keys(DEVICES)) {
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ ...DEVICES[device], colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 160)}`));
    const files = (all[`${device}-${scheme}`] = []);
    await visitStates(page, {
      device,
      projectUrl,
      beadId,
      onMissing: (state, e) => problems.push(`${device}/${scheme}/${state}: ${String(e.message).split("\n")[0]}`),
      onState: async (state) => {
        const file = `${device}-${scheme}-${state}.png`;
        await page.screenshot({ path: path.join(outDir, file) });
        files.push(file);
      },
    });
    await context.close();
    if (errors.length) problems.push(`${device}/${scheme}: ${errors.length} console/page error(s), e.g. ${errors[0]}`);
  }
}

// Contact sheets: a few states side by side, labelled.
const per = { phone: 3, desktop: 2 };
const sheetPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
for (const [key, files] of Object.entries(all)) {
  const device = key.split("-")[0];
  for (let i = 0, n = 0; i < files.length; i += per[device], n++) {
    const group = files.slice(i, i + per[device]);
    const cell = device === "phone" ? 390 : 780;
    const html = `<body style="margin:0;background:#888;display:flex;gap:8px;align-items:flex-start;width:${group.length * (cell + 8)}px">${group
      .map(
        (f) =>
          `<figure style="margin:0;width:${cell}px"><div style="font:12px sans-serif;color:#fff;background:#222;padding:3px 6px">${f}</div><img src="file://${path.resolve(outDir, f)}" style="width:${cell}px;display:block"></figure>`,
      )
      .join("")}</body>`;
    writeFileSync(path.join(outDir, "_sheet.html"), html);
    await sheetPage.setViewportSize({ width: group.length * (cell + 8), height: 900 });
    await sheetPage.goto(`file://${path.resolve(outDir, "_sheet.html")}`);
    await sheetPage.waitForTimeout(300);
    await sheetPage.screenshot({ path: path.join(outDir, `sheet-${key}-${n + 1}.png`), fullPage: true });
  }
}
await browser.close();

console.log(readdirSync(outDir).filter((f) => f.startsWith("sheet-")).join("\n"));
if (problems.length) {
  console.log(`\n${problems.length} problem(s) while capturing:`);
  for (const p of problems) console.log(`  ${p}`);
}
