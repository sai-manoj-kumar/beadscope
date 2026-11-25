#!/bin/bash
# Put a release's version commit on main, so package.json matches what was published.
#
# Run by the "land" job of .github/workflows/release.yml with the release tag checked out.
# The tag sits on a "release: vX.Y.Z [skip ci]" commit built directly on top of the commit
# that was pushed to main. main only takes pull requests, so the workflow pushes with a
# deploy key that the main ruleset lets bypass its rules (the caller sets GIT_SSH_COMMAND).
#
#   TAG=v0.6.1 REMOTE=git@github.com:owner/repo.git scripts/land-release.sh
#
# If main moved on while the release was running, the release commit is no longer a
# fast-forward. The version change is then replayed on top of the new tip and pushed instead.
# The tag stays on the commit that was published. Safe to run again: it exits quietly when
# the release commit, or a commit with the same version, is already on main.
set -euo pipefail
: "${TAG:?TAG is required, e.g. v0.6.1}"
: "${REMOTE:?REMOTE is required, the URL to push main to}"

release="$(git rev-parse HEAD)"
if [ "$(git log -1 --format=%s)" != "release: $TAG [skip ci]" ]; then
  echo "$TAG is on a commit that already carries its version; nothing to land"
  exit 0
fi

for attempt in 1 2 3 4 5; do
  candidate="$release"
  git fetch -q origin main
  tip="$(git rev-parse origin/main)"

  if git merge-base --is-ancestor "$release" "$tip"; then
    echo "The release commit is already on main"
    exit 0
  fi

  if [ "$(git rev-parse "$release^")" != "$tip" ]; then
    echo "main moved on to ${tip:0:10}; replaying the version change on top of it"
    git checkout -q --detach "$tip"
    npm version "${TAG#v}" --no-git-tag-version --allow-same-version >/dev/null
    if git diff --quiet; then
      echo "main already says ${TAG#v}; nothing to land"
      exit 0
    fi
    git commit -q -am "release: $TAG [skip ci]"
    candidate="$(git rev-parse HEAD)"
  fi

  if git push "$REMOTE" "$candidate:refs/heads/main"; then
    echo "Landed $TAG on main as ${candidate:0:10}"
    exit 0
  fi
  echo "Push rejected (attempt $attempt of 5); fetching and trying again"
  sleep "${LAND_RETRY_SLEEP:-5}"
done

echo "::error::Could not land the release commit for $TAG on main after 5 attempts"
exit 1
