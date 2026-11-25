# Release notes

Release notes live here as `vX.Y.Z.md`, one file per release. Releases are published
on this repository's
[GitHub Releases](https://github.com/sai-manoj-kumar/beadscope/releases) page.

## Versions

Beadscope's version numbers continue from the release this fork was started from
(**v0.4.0**) instead of restarting at 0.1.0.

`package.json` is at **0.6.0**. **0.5.0** was the first Beadscope release, published to npm by
hand before the release workflow existed, so it has notes but no git tag or GitHub
Release page. It was a breaking release (new command name, new environment variable
names, new config directory), so it took a minor-version bump while the project is
pre-1.0. **0.5.1** is the first release made by the workflow.

## Releasing

Every merge to `main` publishes a release, except one that only changes documentation
(`docs/`, markdown files in the repository root, or `LICENSE`), which cannot change the
published package. [`release.yml`](../../.github/workflows/release.yml)
runs the CI checks, publishes the package to npm, creates the GitHub release, and bumps
the Homebrew tap formula. You do nothing for an ordinary change: the next **patch** version
is chosen from the newest `vX.Y.Z` tag (see
[`scripts/next-version.mjs`](../../scripts/next-version.mjs)), and the release notes are
generated from the merged pull requests.

Each release is a `release: vX.Y.Z [skip ci]` commit that sets the version in `package.json`
and `package-lock.json` on top of the merged commit. The package is built from that commit
and the tag goes on it. A final `land` step then pushes the commit to `main`, so `package.json`
always shows the newest release. `main` only takes pull requests, so that push uses a deploy
key that the `main` ruleset lets bypass its rules; if `main` moved on in the meantime, only
the version change is replayed on top of it. The `[skip ci]` marker stops that push from
starting another run, so leave it in the message.

**Never write that marker in a pull request title or description.** `main` takes squash merges
only, so the description becomes the commit message, and GitHub then skips every workflow for
the push: no CI and no release. Call it "the skip-ci marker" in prose. If a merge was skipped
this way, the next merge to `main` that changes anything beyond documentation releases it.

For a **minor or major** release (or any release with hand-written notes):

1. In a pull request, raise `version` in `package.json` and add `docs/releases/vX.Y.Z.md`.
2. Merge it. The push to `main` releases exactly that version, using your notes file. No
   tag needs pushing by hand. The next merge goes back to patch bumps from there.

Pushing a `vX.Y.Z` tag by hand also still works. That path insists the tag matches
`package.json`, is on `main`, and has a notes file. Each step skips itself if its work is
already done, so a failed run can simply be re-run.

The workflow publishes with npm trusted publishing (no stored npm token) and updates the
tap with a write-enabled deploy key stored as the `TAP_DEPLOY_KEY` secret. It lands the
release commit with a second deploy key on this repository, stored as `RELEASE_DEPLOY_KEY`.

## Protecting `main`

`main` is protected by a repository ruleset named **main** (Settings → Rules → Rulesets), not
by classic branch protection. It requires a pull request, the `check` status, a linear
history and conversation resolution, and it blocks force pushes and deletion. There is no
administrator bypass. The only bypass is **deploy keys**, so the one write-enabled deploy key
on this repository (the one behind `RELEASE_DEPLOY_KEY`) can push straight to `main`. Do not
add another write-enabled deploy key to this repository without meaning to give it the same
power, and rotate `RELEASE_DEPLOY_KEY` by replacing both the key and the secret.
