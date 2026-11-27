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

const RECENT_MS = 3 * 86_400_000; // RECENTLY_COMPLETED_DAYS in lib/beads-view.ts
const SHEET = '[data-slot="sheet-content"]';
const DIALOG = '[data-slot="dialog-content"]';
const MENU = '[data-slot="dropdown-menu-content"]';

export async function visitStates(page, { device, projectUrl, beadId = "", origin = new URL(projectUrl).origin, onState, onMissing, settleMs = 700, requireRename = false }) {
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

  // Bulk edit: the List's Select mode (checkboxes and the selection bar), then the dialog it opens.
  // The Board and Focus have the same Select mode on their cards.
  const selectMode = async (view) => {
    await page.goto(`${projectUrl}?view=${view}`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    await settle(900);
    // Phones have a Select button; on desktop a Cmd-click on a row starts the selection.
    if (phone) await page.getByRole("button", { name: "Select", exact: true }).click();
    else await page.locator("[data-keyboard-bead-id]").first().click({ modifiers: ["Meta"] });
    await page.getByRole("checkbox", { name: /^Select / }).first().check();
    await settle(300);
  };
  await attempt("bulk-edit", async () => {
    await selectMode("list");
    await onState("bulk-select", "");
    await page.getByRole("button", { name: "Bulk edit" }).click();
    await page.locator(DIALOG).waitFor({ timeout: 8000 });
    await settle(500);
    await onState("bulk-edit", DIALOG);
    // Closed adds a reason field; the same label in Add and Remove adds an error line.
    await page.locator(DIALOG).getByLabel("Status").selectOption("closed");
    await page.locator(DIALOG).getByLabel("Add labels").fill("urgent");
    await page.locator(DIALOG).getByLabel("Remove labels").fill("urgent");
    await settle(300);
    await onState("bulk-edit-close", DIALOG);
    // Set a date shows the date and time field, and a line asking to finish it.
    await page.locator(DIALOG).getByRole("combobox", { name: /^Due/ }).selectOption("set");
    await page.locator(DIALOG).getByRole("combobox", { name: /^Defer until/ }).selectOption("clear");
    await settle(300);
    await onState("bulk-edit-dates", DIALOG);
  });
  for (const view of ["board", "focus"]) {
    await attempt(`bulk-select-${view}`, async () => {
      await selectMode(view);
      await onState(`bulk-select-${view}`, "");
    });
  }

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
    // `requireRename` (the quality gate registers a throwaway project) makes a missing Rename an error.
    const rename = page.getByRole("menuitem", { name: /^Rename / }).first();
    if (requireRename && !(await rename.count())) throw new Error('no "Rename <project>" item in the project menu');
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

  // Needs You across every repo: a page of its own, outside any project.
  await attempt("needs-you-all", async () => {
    await page.goto(`${origin}/needs-you`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    await settle(1200);
    await onState("needs-you-all", "");
  });

  // Agent Queue across every repo: a page of its own, outside any project.
  await attempt("agent-queue-all", async () => {
    await page.goto(`${origin}/agent-queue`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    await settle(1200);
    await onState("agent-queue-all", "");
  });

  // The Completed toggle on the Needs You views (all-repos `?done=1`, a project's own `?completed=1`): the
  // heading and the completed cards only exist while it is on, so the gate has to visit it switched on.
  // The Demo data has nothing closed in the last few days, so a project that has none gets one sample
  // closed bead (flagged `human`, so it counts as "for you" without a known actor) added to its list in the
  // browser only; nothing is written.
  const completedStates = [
    ["needs-you-all-completed", `${origin}/needs-you?done=1`],
    ["needs-you-completed", `${projectUrl}?view=needsyou&completed=1`],
  ];
  const sampleCompleted = async (route) => {
    try {
      const response = await route.fetch();
      let body;
      try {
        body = await response.json();
      } catch {
        return await route.fulfill({ response });
      }
      if (!Array.isArray(body.beads)) return await route.fulfill({ response, json: body });
      // Mirrors `completedForYou` in lib/beads-view.ts minus the assignee: closed lately, not archived, and
      // a human gate or flagged `human`. Only then does a real completed card show up without a sample.
      const since = Date.now() - RECENT_MS;
      const hasRecent = body.beads.some(
        (b) =>
          b.status === "closed" &&
          Date.parse(b.closed_at ?? b.updated_at ?? "") > since &&
          !(b.labels ?? []).includes("archived") &&
          (b.issue_type === "gate" || (b.labels ?? []).includes("human")),
      );
      if (hasRecent) return await route.fulfill({ response, json: body });
      const closedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
      const projectId = new URL(route.request().url()).pathname.split("/")[3] ?? "x";
      const sample = {
        id: `qa-completed-${projectId}`,
        title: "Sample completed bead with a title long enough to wrap onto a second line on a phone",
        status: "closed",
        issue_type: "task",
        priority: 2,
        labels: ["human"],
        dependencies: [],
        created_at: closedAt,
        updated_at: closedAt,
        closed_at: closedAt,
      };
      return await route.fulfill({ response, json: { ...body, beads: [...body.beads, sample] } });
    } catch {
      // The page moved on while the request was in flight; there is nothing left to answer.
    }
  };
  await page.route(/\/api\/p\/[^/]+\/beads(\?.*)?$/, sampleCompleted);
  try {
    for (const [name, url] of completedStates) {
      await attempt(name, async () => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.locator("h1").first().waitFor({ timeout: 15000 });
        await page.locator("[data-completed-card]").first().waitFor({ timeout: 15000 });
        await settle(700);
        await onState(name, "");
      });
    }
  } finally {
    await page.unroute(/\/api\/p\/[^/]+\/beads(\?.*)?$/, sampleCompleted);
  }
}
