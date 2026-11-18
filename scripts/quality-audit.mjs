// Layout and accessibility audit for whatever is on screen. Works at any width and in either
// theme; scripts/quality-gate.mjs runs it on every screen state (scripts/ui-states.mjs).
//
// `qualityAudit(scopeSelector)` runs in the page and returns plain data:
//   stackedIcons   a button or link whose icon sits above its label instead of beside it
//   crushedText    a sentence squeezed into a sliver, a few characters per line
//   unnamed        a button, link or field a screen reader cannot name
//   duplicateIds   two elements with the same id
//   noAlt          an image with no alt attribute
//   pageScroll     the document scrolls sideways
//   lowContrast    text under WCAG AA against its background (4.5:1, or 3:1 for large text)
//
// Contrast is measured on rendered colours (canvas turns any CSS colour into rgba), and skipped
// over images and gradients, where the real background cannot be read from the DOM.

export function qualityAudit(scopeSelector) {
  const scope = (scopeSelector && document.querySelector(scopeSelector)) || document.body;
  const vw = document.documentElement.clientWidth;
  const label = (el) => {
    const text = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 32);
    return `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ""}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
      if (n.getAttribute("aria-hidden") === "true") return false; // decorative or deliberately skipped by screen readers
    }
    return true;
  };

  // --- icon above its label -------------------------------------------------------------------
  const stackedIcons = [];
  for (const el of scope.querySelectorAll("button, a[href], [role=button], [role=menuitem]")) {
    if (!visible(el)) continue;
    const icon = el.querySelector("svg");
    if (!icon || !visible(icon)) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textRect = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width && r.height) {
        textRect = r;
        break;
      }
    }
    if (!textRect) continue;
    const i = icon.getBoundingClientRect();
    const overlapsHorizontally = i.left < textRect.right && i.right > textRect.left;
    if (overlapsHorizontally && i.bottom <= textRect.top + 2) stackedIcons.push(label(el));
  }

  // --- text squeezed into a sliver --------------------------------------------------------------
  const crushedText = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (text.length < 14 || !node.parentElement || !visible(node.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top / 4)));
    if (lines.size >= 3 && text.length / lines.size < 9) crushedText.push(`"${text.slice(0, 32)}" in ${lines.size} lines`);
  }

  // --- accessible names --------------------------------------------------------------------------
  const unnamed = [];
  const named = (el) => {
    if (el.getAttribute("aria-label")?.trim() || el.getAttribute("title")?.trim()) return true;
    const by = el.getAttribute("aria-labelledby");
    if (by && by.split(/\s+/).some((id) => document.getElementById(id)?.textContent.trim())) return true;
    if (el.textContent.trim()) return true;
    if (el.querySelector("img[alt]:not([alt=''])")) return true;
    if (el.labels && [...el.labels].some((l) => l.textContent.trim())) return true;
    if (el.closest("label")?.textContent.trim()) return true;
    return !!el.getAttribute("placeholder")?.trim();
  };
  for (const el of scope.querySelectorAll("button, a[href], [role=button], [role=menuitem], [role=tab], input:not([type=hidden]), select, textarea")) {
    if (visible(el) && !named(el)) unnamed.push(label(el) || el.tagName.toLowerCase());
  }

  // --- ids and images ------------------------------------------------------------------------------
  const seen = new Map();
  for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  const duplicateIds = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  const noAlt = [...scope.querySelectorAll("img:not([alt])")].filter(visible).map((el) => el.getAttribute("src")?.slice(0, 40) ?? "img");

  // --- contrast ------------------------------------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t, u) => (t * top.a + u * under.a * (1 - top.a)) / a;
    return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const backdrop = (el) => {
    let acc = { r: 0, g: 0, b: 0, a: 0 };
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none") return null; // gradient or image: unknown
      acc = over(acc, rgba(cs.backgroundColor));
      if (acc.a >= 0.999) return acc;
    }
    return over(acc, rgba(getComputedStyle(document.body).backgroundColor === "rgba(0, 0, 0, 0)" ? "#fff" : getComputedStyle(document.body).backgroundColor));
  };
  const lowContrast = [];
  const cw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const checked = new Set();
  for (let node = cw.nextNode(); node; node = cw.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || checked.has(el) || !visible(el)) continue;
    checked.add(el);
    if (el.closest("[disabled], [aria-disabled='true'], svg, option")) continue; // disabled controls are exempt in WCAG
    if (getComputedStyle(el).textShadow !== "none") continue;
    const bg = backdrop(el);
    if (!bg) continue;
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const px = parseFloat(getComputedStyle(el).fontSize);
    const bold = parseInt(getComputedStyle(el).fontWeight, 10) >= 700;
    const needed = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5; // WCAG AA: large text 3:1, other text 4.5:1
    if (ratio < needed) lowContrast.push(`${ratio.toFixed(2)}:1 (needs ${needed}) "${node.textContent.trim().slice(0, 28)}" in <${el.tagName.toLowerCase()} class="${String(el.getAttribute("class") ?? "").slice(0, 70)}">`);
  }

  return {
    vw,
    pageScroll: document.documentElement.scrollWidth > vw,
    stackedIcons,
    crushedText,
    unnamed,
    duplicateIds,
    noAlt,
    lowContrast,
  };
}

/** Flattens an audit result into printable problem lines. */
export function describe(a) {
  const out = [];
  if (a.pageScroll) out.push("page scrolls sideways");
  for (const [key, text] of [
    ["stackedIcons", "icon above its label"],
    ["crushedText", "text squeezed into a sliver"],
    ["unnamed", "no accessible name"],
    ["duplicateIds", "duplicate id"],
    ["noAlt", "image without alt"],
    ["lowContrast", "contrast below WCAG AA"],
  ]) {
    if (a[key].length) out.push(`${text}: ${a[key].slice(0, 4).join("; ")}${a[key].length > 4 ? ` (+${a[key].length - 4})` : ""}`);
  }
  return out;
}
