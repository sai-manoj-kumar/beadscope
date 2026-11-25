// Decide which version the release workflow publishes for a push to main.
//
//   node scripts/next-version.mjs     prints X.Y.Z (run in a clone that has the tags)
//
// Rules, in order:
//   1. The commit already carries a vX.Y.Z tag (a re-run of the same push): reuse it.
//   2. No release tag exists yet: use package.json's version.
//   3. package.json is ahead of the newest tag (a pull request raised the version on
//      purpose, for a minor or major release): release exactly that version.
//   4. Otherwise: the newest tag with its patch number plus one.
//
// main is protected, so nothing commits the new version back. The workflow sets it in
// the CI checkout only; the tag is the record of what was released.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** "1.2.3" or "v1.2.3" -> [1, 2, 3], or null when it is not a plain release version. */
export function parse(version) {
  const m = TAG.exec(version.startsWith('v') ? version : `v${version}`);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const format = (v) => v.join('.');

/**
 * @param {{ tags: string[], headTags?: string[], packageVersion: string }} input
 * `tags` is every tag in the repository, `headTags` the tags on the commit being released.
 */
export function nextVersion({ tags, headTags = [], packageVersion }) {
  const onHead = headTags.map(parse).filter(Boolean).sort(compare).at(-1);
  if (onHead) return format(onHead);

  const pkg = parse(packageVersion);
  if (!pkg) throw new Error(`package.json version "${packageVersion}" is not X.Y.Z`);

  const latest = tags.map(parse).filter(Boolean).sort(compare).at(-1);
  if (!latest) return format(pkg);
  if (compare(pkg, latest) > 0) return format(pkg);
  return format([latest[0], latest[1], latest[2] + 1]);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  console.log(nextVersion({ tags: git('tag', '--list', 'v*'), headTags: git('tag', '--points-at', 'HEAD'), packageVersion }));
}
