// The release workflow's version rule, without git or a network.
import assert from 'node:assert/strict';
import { compare, docsOnly, nextVersion, parse } from './next-version.mjs';

const tags = ['v0.3.1', 'v0.3.2', 'v0.4.0', 'v0.5.1', 'v0.6.0'];

// Patch bump of the newest tag; the order of the tag list does not matter.
assert.equal(nextVersion({ tags, packageVersion: '0.6.0' }), '0.6.1');
assert.equal(nextVersion({ tags: [...tags].reverse(), packageVersion: '0.6.0' }), '0.6.1');
// Numeric, not lexical: 0.6.10 is newer than 0.6.9.
assert.equal(nextVersion({ tags: ['v0.6.9', 'v0.6.10'], packageVersion: '0.6.0' }), '0.6.11');
// package.json behind the newest tag (the normal case once the first auto release is out).
assert.equal(nextVersion({ tags: [...tags, 'v0.6.4'], packageVersion: '0.6.0' }), '0.6.5');
// A pull request that raised the version on purpose releases exactly that version...
assert.equal(nextVersion({ tags, packageVersion: '0.7.0' }), '0.7.0');
assert.equal(nextVersion({ tags, packageVersion: '1.0.0' }), '1.0.0');
// ...and the push after it goes back to patch bumps.
assert.equal(nextVersion({ tags: [...tags, 'v0.7.0'], packageVersion: '0.7.0' }), '0.7.1');
// Re-running the workflow for a commit that is already tagged reuses its version.
assert.equal(nextVersion({ tags: [...tags, 'v0.6.1'], headTags: ['v0.6.1'], packageVersion: '0.6.0' }), '0.6.1');
// No release tags at all: start from package.json.
assert.equal(nextVersion({ tags: [], packageVersion: '0.1.0' }), '0.1.0');
// Tags that are not plain releases are ignored.
assert.equal(nextVersion({ tags: ['v0.6.0', 'v0.7.0-rc.1', 'latest', 'nightly-1'], packageVersion: '0.6.0' }), '0.6.1');
assert.equal(nextVersion({ tags, headTags: ['not-a-release'], packageVersion: '0.6.0' }), '0.6.1');
// A package.json version that is not X.Y.Z is an error, not a guess.
assert.throws(() => nextVersion({ tags, packageVersion: '0.7.0-beta.1' }), /not X\.Y\.Z/);

assert.deepEqual(parse('v1.2.3'), [1, 2, 3]);
assert.equal(parse('1.2'), null);
assert.ok(compare([0, 6, 10], [0, 6, 9]) > 0);

// Docs-only pushes do not release.
assert.equal(docsOnly(['docs/releases/README.md']), true);
assert.equal(docsOnly(['README.md', 'AGENTS.md', 'docs/a/b.png', 'LICENSE']), true);
assert.equal(docsOnly(['README.md', 'lib/bd.ts']), false); // one code file is enough to release
assert.equal(docsOnly(['package.json']), false);
assert.equal(docsOnly(['scripts/notes.md']), false); // markdown outside the root and docs/ is not docs
assert.equal(docsOnly(['.github/workflows/release.yml']), false);
assert.equal(docsOnly(['docs-extra/x.txt']), false); // "docs/" must be the whole first segment
assert.equal(docsOnly(['']), false); // nothing changed is not docs-only
assert.equal(docsOnly([]), false);

console.log('PASS: release rules (patch bump, deliberate bump, re-run, ignored tags, docs-only pushes)');
