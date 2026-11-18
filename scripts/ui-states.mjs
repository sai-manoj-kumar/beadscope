// Every screen state worth looking at: each view, the bead drawer (reading and editing), the create
// dialog, the command palette, the project menu, the folder browser, and on phones the nav sheet and
// the Filters row. One list, walked by two scripts:
//
//   scripts/review-screenshots.mjs   photographs each state for a person to look at
//   scripts/quality-gate.mjs    audits each state for layout and accessibility defects
//
// `visitStates` drives the page into each state and calls `onState(name, scopeSelector)`; the scope
// is the overlay to audit ("" for the whole page). A state that cannot be reached is reported through
// `onMissing` so a broken button or a renamed control fails loudly instead of silently shrinking the
// coverage.

export const VIEWS = ["board", "focus", "list", "epics", "graph", "insights", "activity", "needsyou", "achievements", "publish", "settings"];
export const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 860 } },
};

const SHEET = '[data-slot="sheet-content"]';
const DIALOG = '[data-slot="dialog-content"]';
const MENU = '[data-slot="dropdown-menu-content"]';

export async function visitStates(page, { device, projectUrl, beadId = "", origin = new URL(projectUrl).origin, onState, onMissing, settleMs = 700 }) {
  const settle = (ms = settleMs) => page.waitForTimeout(ms);
  const phone = device === "phone";
  const attempt = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      onMissing(name, error);
    }
  };
  const openBoard = async () => {
    await page.goto(`${projectUrl}?view=board`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    await settle(900);
  };

  for (const view of VIEWS) {
    if (phone && view === "graph") continue; // hidden on phones by design
    await attempt(view, async () => {
      await page.goto(`${projectUrl}?view=${view}`, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor({ timeout: 15000 });
      await settle(view === "insights" && settleMs > 500 ? 2200 : 700); // chart animations finish
      await onState(view, "");
    });
  }

  if (beadId) {
    await attempt("drawer", async () => {
      await page.goto(`${projectUrl}?view=board&bead=${beadId}`, { waitUntil: "domcontentloaded" });
      await page.locator(SHEET).waitFor({ timeout: 15000 });
      await settle(1200);
      await onState("drawer", SHEET);
      await page.locator(`${SHEET} .overflow-y-auto`).first().evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await settle(400);
      await onState("drawer-bottom", SHEET);
    });
    await attempt("drawer-edit", async () => {
      await page.getByRole("button", { name: /^edit/i }).or(page.getByTitle(/edit/i)).first().click();
      await settle(500);
      await onState("drawer-edit", SHEET);
    });
  }

  if (phone) {
    await attempt("filters-open", async () => {
      await openBoard();
      await page.getByRole("button", { name: /^Filters/ }).click();
      await settle(300);
      await onState("filters-open", "");
    });
  }

  await attempt("create", async () => {
    await openBoard();
    await page.getByRole("button", { name: /^New\b|New bead|Create bead/i }).first().click();
    await page.locator(DIALOG).waitFor({ timeout: 8000 });
    await settle(500);
    await onState("create", DIALOG);
  });

  await attempt("palette", async () => {
    await openBoard();
    if (phone) await page.getByRole("button", { name: "Search and commands" }).click();
    else await page.keyboard.press("Meta+k");
    await page.locator("[cmdk-input]").first().waitFor({ timeout: 8000 });
    await settle(400);
    await onState("palette", '[role="dialog"]');
  });

  await attempt("project-menu", async () => {
    await openBoard();
    if (phone) await page.getByRole("button", { name: "Open navigation and project menu" }).click();
    await settle(400);
    await page.getByRole("button", { name: /Select project/ }).click();
    await settle(300);
    await onState("project-menu", MENU);
    // The Demo project cannot be renamed, so Rename only exists when a real project is registered.
    const rename = page.getByRole("menuitem", { name: /^Rename / }).first();
    if (await rename.count()) {
      await rename.click();
      await page.locator(DIALOG).waitFor({ timeout: 8000 });
      await settle(600);
      await onState("rename", DIALOG);
      await page.keyboard.press("Escape");
      await page.locator(DIALOG).waitFor({ state: "detached", timeout: 8000 });
      await settle(300);
      if (phone) await page.getByRole("button", { name: /Select project/ }).waitFor();
      await page.getByRole("button", { name: /Select project/ }).click();
      await settle(300);
    }
    await page.getByRole("menuitem", { name: /Add project/ }).click();
    await page.locator(DIALOG).waitFor({ timeout: 8000 });
    await settle(900);
    await onState("folders", DIALOG);
  });

  if (phone) {
    await attempt("nav", async () => {
      await openBoard();
      await page.getByRole("button", { name: "Open navigation and project menu" }).click();
      await page.locator(SHEET).waitFor();
      await settle(500);
      await onState("nav", SHEET);
    });
  }

  await attempt("launcher", async () => {
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    await page.locator("h1, [data-slot]").first().waitFor({ timeout: 15000 }).catch(() => {});
    await settle(1200);
    await onState("launcher", "");
  });
}
