// Shared controls (bead bui-4e1.22): buttons, fields and selects come from components/controls.tsx so
// the same job looks, sizes and behaves the same everywhere. A raw <button>, <select>, <textarea> or
// <input> is only for what the shared set cannot express; each file that still has one is listed here
// with the reason and the number allowed. Adding a raw control (or a new file with one) fails this
// test: use a shared control, or add the exception below and say why.
// Pure file scan: no server, no browser.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** file (relative to the repo) -> [allowed count, why a shared control does not fit] */
const ALLOWED = {
  "components/brand-button.tsx": [1, "this is the brand button"],
  "components/settings-card.tsx": [1, "ToggleButton is the settings on/off switch"],
  "components/read-only-banner.tsx": [4, "the banner bar is a full-width button; radio and colour inputs are native pickers"],
  "components/launcher.tsx": [1, "a whole project card is one button"],
  "components/publish-view.tsx": [1, "template tiles are whole-card buttons"],
  "components/epics-view.tsx": [1, "the epic row chevron must stay a <button> inside a role=button div (GH #10)"],
  "components/assignee-field.tsx": [1, "the assignee box is a combobox-style row, not a plain button"],
  "components/assignee-picker.tsx": [1, "the picker trigger is a combobox"],
  "components/update-indicator.tsx": [0, ""],
  "components/create-bead-modal.tsx": [1, "a hidden file input behind the Attach image button"],
  "components/copyable-id.tsx": [1, "an id that copies itself, styled as text"],
  "components/settings-view.tsx": [1, "a segmented swatch tile"],
  "components/agents-settings.tsx": [1, "an emoji/colour swatch tile"],
  "components/sidebar.tsx": [1, "the project switcher row"],
  "components/folder-browser-modal.tsx": [1, "a folder row is a whole-row button"],
  "components/list-view.tsx": [1, "the parent chip inside a list row"],
  "components/filter-bar.tsx": [1, "the search box is an input inside a styled wrapper"],
  "components/graph-view.tsx": [1, "the spotlight chip"],
  "components/needs-you-view.tsx": [0, ""],
  "components/activity-view.tsx": [1, "an activity row is one button"],
  "components/bead-detail-drawer.tsx": [4, "the epic link box, a hidden file input, dependency rows and the label chip input"],
  "components/board/board.tsx": [2, "inline pill selects inside the board header"],
  "components/board/column.tsx": [1, "the column header toggle"],
  "components/focus-view.tsx": [2, "the lane fold button and the LaneChip pill"],
};

const skip = (file) => file.startsWith("components/ui/") || file === "components/controls.tsx";

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const counts = {};
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name)) {
      const rel = path.relative(root, full);
      if (skip(rel)) continue;
      const n = (strip(fs.readFileSync(full, "utf8")).match(/<(button|select|textarea|input)(\s|>)/g) ?? []).length;
      if (n) counts[rel] = n;
    }
  }
})(path.join(root, "components"));
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name)) {
      const n = (strip(fs.readFileSync(full, "utf8")).match(/<(button|select|textarea|input)(\s|>)/g) ?? []).length;
      if (n) counts[path.relative(root, full)] = n;
    }
  }
})(path.join(root, "app"));

const problems = [];
for (const [file, n] of Object.entries(counts)) {
  const [allowed] = ALLOWED[file] ?? [0];
  if (n > allowed) problems.push(`${file}: ${n} raw control(s), ${allowed} allowed. Use components/controls.tsx, or list the exception in this test with a reason.`);
}
for (const [file, [allowed, why]] of Object.entries(ALLOWED)) {
  const n = counts[file] ?? 0;
  if (n < allowed) problems.push(`${file}: only ${n} raw control(s) left (allowed ${allowed}). Lower the number here${why ? ` (${why})` : ""}.`);
}
assert.equal(problems.length, 0, `${problems.length} shared-controls problem(s):\n${problems.join("\n")}`);
console.log(`shared controls: ok (${Object.values(counts).reduce((a, b) => a + b, 0)} raw controls, all listed)`);
