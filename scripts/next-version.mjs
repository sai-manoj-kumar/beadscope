// Release rules for a push to main, used by .github/workflows/release.yml.
//
//   node scripts/next-version.mjs                       prints X.Y.Z (run in a clone that has the tags)
//   git diff --name-only A B | node scripts/next-version.mjs --docs-only
//                                                       prints true when the push only touched docs
//
// A push that only touches documentation does not release (see docsOnly). Otherwise the
// version is chosen by these rules, in order:
//   1. The commit is already released (a re-run of the same push): reuse that version. That
//      means a vX.Y.Z tag on the commit itself, or on the "release: vX.Y.Z" commit the
//      workflow built directly on top of it.
//   2. No release tag exists yet: use package.json's version.
//   3. package.json is ahead of the newest tag (a pull request raised the version on
//      purpose, for a minor or major release): release exactly that version.
//   4. Otherwise: the newest tag with its patch number plus one.
//
// The workflow records each release as a "release: vX.Y.Z [skip ci]" commit that sets the
// version in package.json and package-lock.json. The tag sits on that commit, which then
// lands on main through a deploy key that the main ruleset lets bypass its rules.
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

// Paths that cannot change what gets published: the docs folder, markdown files in the
// repository root (README, AGENTS, CLAUDE, SECURITY...) and the license. The npm package
// ships only bin, .next, public and next.config.ts, and nothing in the app reads these.
const DOCS = [/^docs\//, /^[^/]+\.md$/i, /^LICENSE(\.[^/]*)?$/];

/** True when every changed path is documentation. No paths at all is not docs-only. */
export function docsOnly(paths) {
  const changed = paths.map((p) => p.trim()).filter(Boolean);
  return changed.length > 0 && changed.every((p) => DOCS.some((re) => re.test(p)));
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

/** Release tags that already cover HEAD: on it, or on the release commit built right above it. */
function tagsCoveringHead() {
  const head = git('rev-parse', 'HEAD')[0];
  return git('tag', '--list', 'v*').filter((tag) => {
    const commit = git('rev-parse', `${tag}^{commit}`)[0];
    if (commit === head) return true;
    try {
      const isReleaseCommit = git('log', '-1', '--format=%s', commit)[0] === `release: ${tag} [skip ci]`;
      return isReleaseCommit && git('rev-parse', `${commit}^`)[0] === head;
    } catch {
      return false; // a root commit has no parent
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--docs-only')) {
  console.log(docsOnly(readFileSync(0, 'utf8').split('\n')));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  console.log(nextVersion({ tags: git('tag', '--list', 'v*'), headTags: tagsCoveringHead(), packageVersion }));
}
