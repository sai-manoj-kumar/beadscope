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

`main` is protected, so the workflow does not commit the new version back. It creates the
tag itself and sets the version only inside the CI build. This means `package.json` on
`main` keeps its last hand-set value and can lag behind the newest tag. The tag, the
GitHub release and npm are the record of what was released.

For a **minor or major** release (or any release with hand-written notes):

1. In a pull request, raise `version` in `package.json` and add `docs/releases/vX.Y.Z.md`.
2. Merge it. The push to `main` releases exactly that version, using your notes file. No
   tag needs pushing by hand. The next merge goes back to patch bumps from there.

Pushing a `vX.Y.Z` tag by hand also still works. That path insists the tag matches
`package.json`, is on `main`, and has a notes file. Each step skips itself if its work is
already done, so a failed run can simply be re-run.

The workflow publishes with npm trusted publishing (no stored npm token) and updates the
tap with a write-enabled deploy key stored as the `TAP_DEPLOY_KEY` secret.
