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
- **After a code change:** `npm run build`, then `launchctl kickstart -k gui/$(id -u)/com.saimanoj.beadscope`.
  Do not use `beadscope stop` or `beadscope start` for this one: they do not manage the service and will fight it
  for port 3000. Check `localhost:3000` and the Tailscale address both return 200.
- **After editing the plist** (env or arguments), `kickstart` does not reload it. Run
  `launchctl bootout gui/$(id -u)/com.saimanoj.beadscope`, then
  `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.saimanoj.beadscope.plist`.
- **Renaming the Mac in Tailscale** (`tailscale set --hostname=<name>`) changes the address: run
  `tailscale serve reset && tailscale serve --bg http://localhost:3000`, then update the allowed hosts in the plist
  and reload it as above.
- **Actor name:** Claude Code sessions here run with `BEADS_ACTOR=claude-code`. Never put it in the service's
  environment: it would become Beadscope's human actor and clash with the agent of the same name. For any
  throwaway server started by hand, use `env -u BEADS_ACTOR`.
