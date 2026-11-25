# Server updater for a systemd install

For a Beadscope served by systemd from a root-owned `npm install -g` (the layout in the beads server runbook). It lets
**Update now** work without giving the web app write access to its own code.

- The app (user `beadscope`) only writes `request.json` (`{"version":"X.Y.Z"}`) into a folder it owns.
- `beadscope-updater.path` sees the file and starts `beadscope-updater.service`, which runs as root: it accepts a plain
  `X.Y.Z` newer than the installed version, stops the app, installs into `<prefix>.next` with `--ignore-scripts`,
  swaps it in (the old copy stays as `<prefix>.prev`), starts the app and waits for it to answer. If anything fails the
  old install is put back, and the reason lands in the status file, which the update dialog shows.
- While that runs, `beadscope-updating.service` answers on the app's port with an "Updating Beadscope" page (HTTP 503)
  that reloads itself when the app is back.

## Install (once, as root on the server)

Paths below match the runbook: prefix `/opt/beadscope`, app unit `beadscope.service`, user `beadscope`, Node in `/opt/node`.

```sh
# 1. Root-owned copies of the updater (not inside the folder it replaces)
install -d -m 755 /usr/local/lib/beadscope-updater
install -m 755 /opt/beadscope/lib/node_modules/beadscope/server-updater/beadscope-updater /usr/local/lib/beadscope-updater/
install -m 644 /opt/beadscope/lib/node_modules/beadscope/server-updater/updating.mjs /usr/local/lib/beadscope-updater/
for u in beadscope-updater.service beadscope-updater.path beadscope-updating.service; do
  install -m 644 /opt/beadscope/lib/node_modules/beadscope/server-updater/$u /etc/systemd/system/
done

# 2. The install folder is root-owned again; the app gets only a request folder
chown -R root:root /opt/beadscope
install -d -m 755 -o beadscope -g beadscope /var/lib/beadscope/update

# 3. In beadscope.service: remove /opt/beadscope from ReadWritePaths, and add
#      Environment=BEADSCOPE_SUPERVISED=1
#      Environment=BEADSCOPE_UPDATE_REQUEST_DIR=/var/lib/beadscope/update
#      Environment=BEADSCOPE_UPDATE_STATUS_FILE=/run/beadscope-updater/status.json
#    (the memory limit can go back down: npm no longer runs inside the app's cgroup)

systemctl daemon-reload
systemctl enable --now beadscope-updater.path
systemctl restart beadscope
```

The unit files assume those paths; edit them together if yours differ (`/opt/beadscope` is also in
`beadscope-updater.service`, the port in `beadscope-updating.service` and `BEADSCOPE_HEALTH_URL`).

## Operate

- `journalctl -u beadscope-updater -n 50` for the last update; `cat /run/beadscope-updater/status.json` for its state.
- Roll back by hand: `systemctl stop beadscope; mv /opt/beadscope /opt/beadscope.bad; mv /opt/beadscope.prev /opt/beadscope; systemctl start beadscope`.
- Without these environment variables Beadscope behaves as before: **Update now** runs `npm install -g` itself and
  needs write access to the install folder.

`scripts/test-server-updater.mjs` covers the script (with stubbed npm/systemctl/curl) and the page.
