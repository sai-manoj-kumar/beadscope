// One type system for every page (bead bui-4e1.12): five named text sizes and three
// weights, defined once in app/globals.css. Components must use them instead of
// hard-coded sizes or weights, so the same kind of text looks the same everywhere.
// Pure file scan: no server, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');

const STEPS = { 'page-title': [16, 20], section: [14, 16], body: [13, 15], label: [12, 14], meta: [11, 14] };

// 1. The scale is defined once: desktop size, phone size (<768px), and a utility name.
for (const [name, [desktop, phone]] of Object.entries(STEPS)) {
  assert.match(css, new RegExp(`--fs-${name}:\\s*${desktop}px`), `--fs-${name} should be ${desktop}px on desktop`);
  assert.match(
    css,
    new RegExp(`@media \\(max-width: 767px\\)[^}]*?--fs-${name}:\\s*${phone}px`, 's'),
    `--fs-${name} should be ${phone}px on phones`,
  );
  assert.match(css, new RegExp(`--text-${name}:\\s*var\\(--fs-${name}\\)`), `--text-${name} should expose text-${name}`);
}

// 2. Form fields are 16px on phones, otherwise iOS Safari zooms the page when one is focused.
assert.match(css, /@media \(max-width: 767px\)[^@]*?(input|textarea|select)[^{]*\{[^}]*font-size:\s*16px/s, 'inputs should be 16px on phones');

// 3. No view or component hard-codes a size or weight.
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name)) files.push(full);
  }
})(path.join(root, 'components'));
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name)) files.push(full);
  }
})(path.join(root, 'app'));

const forbidden = [
  [/(?<![\w-])text-\[[0-9.]+(px|rem|em)\]/, 'arbitrary text size'],
  [/(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/, 'Tailwind default text size'],
  [/(?<![\w-])font-\[[0-9]+\]/, 'numeric font weight'],
  [/fontSize:\s*["']?[0-9]/, 'inline font size (use var(--fs-*))'],
  [/fontWeight:\s*[0-9]/, 'inline numeric font weight'],
  [/(?<![\w-])font-(thin|extralight|light|bold|extrabold|black)(?![\w-])/, 'font weight outside regular/medium/semibold'],
];
const offenders = [];
for (const file of files) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, what] of forbidden) {
      if (re.test(line)) offenders.push(`${path.relative(root, file)}:${i + 1} ${what}: ${line.trim().slice(0, 90)}`);
    }
  });
}
assert.equal(offenders.length, 0, `${offenders.length} hard-coded type values:\n${offenders.slice(0, 25).join('\n')}`);

// 4. Page titles all use the same classes.
const titleClasses = new Set();
for (const file of files) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/<h1 className="([^"]*)"/g)) titleClasses.add(m[1]);
}
assert.equal(titleClasses.size, 1, `page titles (<h1>) should share one class list, found ${titleClasses.size}: ${[...titleClasses].join(' | ')}`);

console.log('type system: ok');
