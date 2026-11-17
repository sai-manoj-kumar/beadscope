// Phone-layout audit for a loaded page: what the mobile beads (bui-4e1.*) are fixing.
// Used by scripts/test-mobile-layout.mjs, and from the command line for a quick look:
//
//   node scripts/mobile-audit.mjs http://localhost:3000/p/beadscope board list settings
//   node scripts/mobile-audit.mjs <base-url-with-project> [views...]   (width: MOBILE_WIDTH, default 390)
//
// It reports, in page pixels:
//   pageScroll   the document scrolls sideways
//   overflow     visible elements whose right edge is past the screen (unless inside an element
//                marked data-allow-x-scroll, the opt-in for a deliberate sideways scroller)
//   smallText    visible text under 14px (ignores aria-hidden text such as avatar initials)
//   smallInputs  text fields under 16px (iOS Safari zooms the page on focus)
//   smallTargets buttons, links and fields under 44px in either direction
import { chromium } from "playwright";

/** Runs in the page. Returns plain data. */
export function pageAudit() {
  const vw = document.documentElement.clientWidth;
  const label = (el) => {
    const text = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ""}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const inAllowedScroller = (el) => !!el.closest("[data-allow-x-scroll]");

  const overflow = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (!visible(el) || inAllowedScroller(el)) continue;
    if (getComputedStyle(el).position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.left < vw) overflow.push(`${label(el)} right=${Math.round(r.right)}`);
  }

  const smallText = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || el.closest("[aria-hidden='true']") || !visible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 14) (smallText[size] ??= []).push(node.textContent.trim().slice(0, 24));
  }

  const smallInputs = [...document.querySelectorAll("input, textarea, select")]
    .filter((el) => visible(el) && !["checkbox", "radio", "range", "file", "hidden"].includes(el.type))
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
    .map(label);

  const targetSelector = "button, a[href], [role=button], [role=tab], [role=menuitem], [role=option], [role=combobox], input, select, textarea, summary";
  const smallTargets = [];
  for (const el of document.querySelectorAll(targetSelector)) {
    if (!visible(el)) continue;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue; // a link inside a sentence
    const box = ["checkbox", "radio"].includes(el.type) || ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ? el.closest("label") || el : el; // a field inside a label is tapped through the label
    const r = box.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) smallTargets.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  return { vw, pageScroll: document.documentElement.scrollWidth > vw, overflow, smallText, smallInputs, smallTargets };
}

export const VIEWS = ["board", "focus", "list", "epics", "insights", "activity", "needsyou", "achievements", "publish", "settings"];

export async function auditView(page, projectUrl, view) {
  await page.goto(`${projectUrl}?view=${view}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800); // data and charts settle
  return page.evaluate(pageAudit);
}

export function summarize(view, a) {
  const small = Object.entries(a.smallText).map(([size, list]) => `${size}px×${list.length}`).join(" ");
  return `${view.padEnd(13)} pageScroll=${a.pageScroll} overflow=${a.overflow.length} smallText=[${small}] smallInputs=${a.smallInputs.length} smallTargets=${a.smallTargets.length}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [projectUrl, ...rest] = process.argv.slice(2);
  if (!projectUrl) {
    console.error("usage: node scripts/mobile-audit.mjs <http://host/p/project> [views...]");
    process.exit(2);
  }
  const browser = await chromium.launch();
  const width = Number(process.env.MOBILE_WIDTH || 390);
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  for (const view of rest.length ? rest : VIEWS) {
    const a = await auditView(page, projectUrl, view);
    console.log(summarize(view, a));
    for (const o of a.overflow.slice(0, 5)) console.log(`    past edge: ${o}`);
    for (const t of a.smallTargets.slice(0, 5)) console.log(`    small target: ${t}`);
  }
  await browser.close();
}
