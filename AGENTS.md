<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Issue data stays off GitHub

This repository is public. Its issues live on a private Dolt server and are never committed here. The only
tracked files under `.beads/` are `metadata.json` (host, user, database) and `dolt-server.port` (the port).
Neither holds a password. Never un-ignore or force-add anything else in `.beads/`, and never push
`refs/dolt/data` to this repo's GitHub origin. External bug reports live in GitHub Issues.

## Landing changes

`main` takes pull requests only: push a branch, open a PR and squash-merge it once the `check` status passes.
Do not write the skip-ci marker in a PR title or description: it suppresses CI and the release for the
squash commit (see `docs/releases/README.md`).

## Commit often, keep commits small

Commit as you go. Do not wait to be asked, and do not batch a session's work into one
commit.

- One logical change per commit: finish a step, run its checks, commit, then start the next.
- Commit as soon as something works and its checks pass. Several small commits are better
  than one large one, and a commit that moves one thing forward is easy to review and revert.
- Write the message in the repo's style: `type: summary (bead-id)`, with `type` one of `feat`,
  `fix`, `test`, `ci`, `docs`, `refactor`. Add a body only when the reason is not obvious.

## Work assigned to you

The maintainer assigns beads to an agent from Beadscope (Settings → Agents lists the
names; the assignee picker offers the ones that are switched on). The assignee is just the
agent's `bd` actor name, and Claude Code's is `claude-code`.

- Run with that name, so `bd` records your work under it: `BEADS_ACTOR=claude-code`.
- Find your queue with `bd ready --assignee claude-code` (add `bd list --assignee claude-code
  --status=in_progress` for work you already started).
- Take a bead with `bd update <id> --claim`. Do not take one assigned to someone else, and do
  not overwrite another actor's live claim (`--force`) unless the maintainer says so.
- Beadscope's Focus view has an Agent filter that shows the same queue.
