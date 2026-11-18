#!/usr/bin/env bash
# Rebuild Beadscope and restart the launchd login service, then check that
# both the local and the Tailscale addresses answer 200.
#
# Usage: scripts/reinstall.sh [--clean]
#   --clean   also delete .next/cache first (use when a CSS token change does
#             not show up in the running app).
#
# Does NOT use `beadscope start/stop`: they do not manage the service and
# would fight it for port 3000.
set -euo pipefail

cd "$(dirname "$0")/.."

LABEL="com.saimanoj.beadscope"
TARGET="gui/$(id -u)/$LABEL"

if [[ "${1:-}" == "--clean" ]]; then
  echo "==> Clearing .next/cache"
  rm -rf .next/cache
fi

# `next build` stops once with a security-advisory notice (exit 1, no build
# done). Retry once; do not run the `next upgrade` it suggests.
echo "==> Building"
if ! npm run build; then
  echo "==> Build stopped; retrying once (Next.js advisory notice)"
  npm run build
fi

echo "==> Restarting $LABEL"
launchctl kickstart -k "$TARGET"

check() {
  local url="$1" code=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)
    [[ "$code" == "200" ]] && break
    sleep 1
  done
  echo "    $url -> ${code:-no response}"
  [[ "$code" == "200" ]]
}

echo "==> Checking"
ok=0
check "http://localhost:3000/" || ok=1

if command -v tailscale >/dev/null 2>&1; then
  dns=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' | sed 's/\.$//') || dns=""
  if [[ -n "$dns" ]]; then
    check "https://$dns/" || ok=1
  else
    echo "    Tailscale address not found; skipped"
  fi
fi

if [[ $ok -eq 0 ]]; then
  echo "==> Done: Beadscope is running the new build."
else
  echo "==> A check failed. See: tail ~/Library/Logs/beadscope.log" >&2
  exit 1
fi
