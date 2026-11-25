<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- This section is project-owned and deliberately sits OUTSIDE the generated
     Beads blocks below, which `bd setup` may rewrite. If a generated block ever
     contradicts this section, THIS SECTION WINS. -->
# Beads data lives on a private server — never put it on GitHub

**Issue data for this repo is stored on a private Dolt SQL server. It is never in this
repository and never on a public host.** This is deliberate, not an unfinished setup.
Do not "fix" it. This file is public, so no credentials are written here.

How it is set up:

- **Server mode.** `bd` talks to the server rather than a database on this machine.
  `.beads/metadata.json` is committed (it is the only tracked file under `.beads/`): it
  names the server host, port, user and database, never a password. Leave those fields
  alone unless the server moves. The password comes from `~/.config/beads/credentials` or
  `BEADS_DOLT_PASSWORD`; never commit, print or paste it.
- **Private network only.** The server is reachable only from the maintainer's own devices.
  If `bd` reports that the server is unreachable, say so and stop. Do **not** work around
  it with `bd init`, `bd dolt start`, `bd migrate` or anything else that creates a local
  database or starts a local Dolt server: it would quietly diverge from the real data.
- **There is an off-site copy.** The server pushes every database to a private cloud
  storage remote called `origin` every few minutes, and the server's disk is snapshotted
  daily. You do not export or push anything yourself.
- **A fresh clone already has `.beads/metadata.json`**, so `bd` reaches the server once the
  credentials file is in place. If it cannot, ask the maintainer; do not run `bd init`.
- `dolt.local-only` is no longer set. Do not set it.

Never do any of these unless the user explicitly asks in the current session:

- `bd dolt remote add …` — above all, never add GitHub or any other public host as a remote
- `git push` of anything under `.beads/`, or of `refs/dolt/data` to this repo's GitHub origin
- un-ignoring anything else in `.beads/` in `.gitignore`, or force-adding any file inside it
  other than `.beads/metadata.json`

`bd dolt push` is not needed, because the server does it, and it only ever reaches the
private `origin`.

**Why:** this repository is public. Pushing issue data to it would publish internal planning
notes and `bd remember` memories alongside the source. External bug reports live in GitHub
Issues; beads is the private work tracker.

Git commits are unaffected by any of this — this section is only about bead/Dolt data.

## Commit often, keep commits small

Commit as you go. Do not wait to be asked, and do not batch a session's work into one
commit. This overrides the more cautious commit wording in the generated Beads blocks below.

- One logical change per commit: finish a step, run its checks, commit, then start the next.
- Commit as soon as something works and its checks pass. Several small commits are better
  than one large one, and a commit that moves one thing forward is easy to review and revert.
- Write the message in the repo's style: `type: summary (bead-id)`, with `type` one of `feat`,
  `fix`, `test`, `ci`, `docs`, `refactor`. Add a body only when the reason is not obvious.
- Commits are local and cheap. Pushing, opening a pull request and merging are separate steps:
  do those only when asked.

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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a Dolt database on a private server, backed up off-site by the server itself, and never go to GitHub — no `refs/dolt/data` sync (see "Beads data lives on a private server" above, which overrides this block); `.beads/issues.jsonl` is a passive local export and is gitignored.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Commit often in small commits (see "Commit often, keep commits small" above). Do not run git pushes or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: commit finished work in small commits, then report
   # status and wait for approval before pushing.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a Dolt database on a private server, backed up off-site by the server itself, and never go to GitHub — no `refs/dolt/data` sync (see "Beads data lives on a private server" above, which overrides this block); `.beads/issues.jsonl` is a passive local export and is gitignored.
<!-- END BEADS CODEX SETUP -->
