@AGENTS.md

## Launching Beadscope on macOS login

Beadscope runs as a login service (launchd), not through `beadscope start`.

- **Service:** `~/Library/LaunchAgents/com.saimanoj.beadscope.plist` (label `com.saimanoj.beadscope`). It
  runs `beadscope run --port 3000 --no-open` from this checkout's `.next` build, restarts itself if it dies, and logs
  to `~/Library/Logs/beadscope.log`.
- **Reachable from:** `http://localhost:3000/` and `http://beadscope.local:3000/` on the Mac only. It listens on
  `localhost`, never on the network. Do not start it with `--host 0.0.0.0`: Beadscope has no login.
- **Phone and remote access:** Tailscale. `tailscale serve` publishes HTTPS 443 to `http://localhost:3000`, for
  tailnet devices only, at `https://beads.<tailnet>.ts.net/`. The Mac is named `beads` in Tailscale; get the
  full name with `tailscale status --json | jq -r .Self.DNSName`. Check the front door with
  `tailscale serve status`.
- **Allowed hosts:** Beadscope refuses hostnames it was not told about. The plist sets
  `BEADSCOPE_ALLOWED_HOSTS=beadscope.local,beads.<tailnet>.ts.net`; a new name must be added there.
- **Adding a project:** run `beadscope add [path]` (the current folder if no path; the folder needs a
  `.beads` directory, so `bd init` first). It registers the repo with the running service on port 3000 and
  prints the project URL; add `--port <n>` if it is elsewhere. Or use **Add project…** in the project
  switcher, which also works from the phone. Never run `beadscope start` inside a repo to add it: it would
  start a second server on port 3001 next to the service.
- **After a code change:** run `scripts/reinstall.sh` (`--clean` also clears `.next/cache`, for a CSS token that
  does not show up). It builds, runs `launchctl kickstart -k gui/$(id -u)/com.saimanoj.beadscope`, and checks that
  `localhost:3000` and the Tailscale address both return 200. Do not use `beadscope stop` or `beadscope start` for
  this one: they do not manage the service and will fight it for port 3000.
- **After raising a PR:** run `scripts/reinstall.sh` from the PR branch, so the running Beadscope is the build
  under review, and do it again before merging if the branch changed since.
- **After editing the plist** (env or arguments), `kickstart` does not reload it. Run
  `launchctl bootout gui/$(id -u)/com.saimanoj.beadscope`, then
  `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.saimanoj.beadscope.plist`.
- **Renaming the Mac in Tailscale** (`tailscale set --hostname=<name>`) changes the address: run
  `tailscale serve reset && tailscale serve --bg http://localhost:3000`, then update the allowed hosts in the plist
  and reload it as above.
- **Actor name:** Claude Code sessions here run with `BEADS_ACTOR=claude-code`. Never put it in the service's
  environment: it would become Beadscope's human actor and clash with the agent of the same name. For any
  throwaway server started by hand, use `env -u BEADS_ACTOR`.

## Type system

Text uses five named sizes and three weights, defined once in `app/globals.css` (`--fs-*`, with phone sizes under 768px).

- Sizes: `text-page-title`, `text-section`, `text-body`, `text-label`, `text-meta`. Weights: `font-normal`, `font-medium`, `font-semibold`.
- Never write `text-[13px]`, `text-sm`, `font-[650]` or an inline `fontSize`. `scripts/test-type-system.mjs` (run in CI) fails on them. Every page title is the same `<h1>`.
- Form fields are 16px on phones so iOS Safari does not zoom. Geist Mono is for ids and code only.

## Phone layout

Phones are anything under 768px (Tailwind `md`). Use `md:` / `max-md:` in CSS; use `useIsMobile()` (`hooks/use-is-mobile.ts`, query in `lib/breakpoints.ts`) only when behaviour changes, not just styling.

- Tap targets are at least 44px on phones: add the `tap-target` utility to small icon buttons. Inside overlays (drawer, dialog, dropdown, select list) a rule in `app/globals.css` already gives every button and field 44px; opt a control out with `data-compact`.
- A deliberate sideways scroller must carry `data-allow-x-scroll`; nothing else may stick out past the right edge.
- Look at a view the way the tests do: `node scripts/mobile-audit.mjs http://localhost:3000/p/<project> [views...]` (390px; `MOBILE_WIDTH=360` to change). It lists overflow, text under 14px, fields under 16px and targets under 44px.
- `scripts/test-mobile-layout.mjs` enforces this on every view in `VIEWS` (`scripts/mobile-audit.mjs`) at 360, 390 and 430px. A new view must be added to `VIEWS` and pass.

## Shared controls

Buttons, fields and selects come from `components/controls.tsx`; do not hand-write their classes.

- `Button` (`variant` secondary|outline|ghost|dashed, `size` sm|md|lg, `icon`, `pressed` for on/off toggles), `IconButton` (needs a `label`), `LinkButton` (text-only, `tone`, `mono`), `TextInput`, `TextArea`, `SelectField`, `CheckInput`, `Segmented`.
- Main actions are `BrandButton`, small pills are `Chip`, the page header is `PageHeader`, the theme switch is `ThemeToggle`.
- They already carry the 44px phone targets and 16px phone fields. A raw `<button>` is only right for a whole clickable row, card, menu item or tile, a hidden file/colour/radio input, or an inline editor that must look unlike a field; say why in a comment.

## Quality gate

`scripts/test-quality-phone.mjs` and `test-quality-desktop.mjs` (run by `npm run test:browser`) walk every screen state in `scripts/ui-states.mjs` (each view, the bead drawer, create dialog, palette, project menu, folder browser, nav sheet) in the light and dark theme and fail on: an icon above its label, text squeezed into a sliver, a page that scrolls sideways, a control without an accessible name, duplicate ids, text below WCAG AA contrast (4.5:1; 3:1 for large text), and any console error. A state that can no longer be reached fails too.

- A new view goes in `VIEWS` in `scripts/ui-states.mjs`; a new overlay gets a step in `visitStates`.
- Text colours: use `--text`, `--text-2`, `--text-3` (all AA on every surface). For a hue on a tint use `Chip`, `tintStyle` or `readableColor` from `components/chip.tsx`; for a fill behind white text use `--brand-solid`, not `--brand`.
- To look at the states yourself: `node scripts/review-screenshots.mjs http://localhost:3000/p/<project> <dir> [bead-id]` writes screenshots and contact sheets. After a CSS token change, if the running app still shows the old value, `rm -rf .next/cache` and rebuild.
