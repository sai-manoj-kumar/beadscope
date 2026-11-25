// The root updater (server-updater/beadscope-updater) and the Updating page (server-updater/updating.mjs).
// npm, systemctl and curl are stubs; everything else (bash, sed, sort -V, mv) is real.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "beadscope-updater-"));
const bin = path.join(root, "bin"), prefix = path.join(root, "opt-beadscope"), requestDir = path.join(root, "request");
const statusFile = path.join(root, "run", "status.json"), calls = path.join(root, "calls.log");
fs.mkdirSync(bin); fs.mkdirSync(requestDir); fs.mkdirSync(path.dirname(statusFile));
const stub = (name, body) => { fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 }); };
stub("npm", `echo "npm $*" >> "${calls}"
[ -z "$FAKE_NPM_FAIL" ] || { echo "npm error code ETARGET" >&2; echo "npm error notarget No matching version" >&2; exit 1; }
while [ $# -gt 0 ]; do case "$1" in --prefix) P=$2; shift;; beadscope@*) V=\${1#beadscope@};; esac; shift; done
mkdir -p "$P/lib/node_modules/beadscope"; echo "{\\"name\\":\\"beadscope\\",\\"version\\":\\"\${FAKE_NPM_VERSION:-$V}\\"}" > "$P/lib/node_modules/beadscope/package.json"`);
stub("systemctl", `echo "systemctl $*" >> "${calls}"`);
if (process.platform !== "linux") stub("flock", "exit 0"); // the server is Linux; macOS has no flock
stub("curl", `echo "curl $*" >> "${calls}"; [ -z "$FAKE_CURL_FAIL" ]`);
const app = (dir = prefix) => path.join(dir, "lib", "node_modules", "beadscope");
const install = (dir, version) => { fs.mkdirSync(app(dir), { recursive: true }); fs.writeFileSync(path.join(app(dir), "package.json"), JSON.stringify({ name: "beadscope", version })); };
const version = dir => JSON.parse(fs.readFileSync(path.join(app(dir), "package.json"), "utf8")).version;
const status = () => JSON.parse(fs.readFileSync(statusFile, "utf8"));
const callLog = () => fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) : [];
function run(request, env = {}) {
  fs.rmSync(calls, { force: true }); fs.rmSync(path.join(requestDir, "request.json"), { force: true });
  if (typeof request === "string") fs.writeFileSync(path.join(requestDir, "request.json"), request);
  else if (request) request();
  return spawnSync("bash", [path.join(repo, "server-updater", "beadscope-updater")], { encoding: "utf8", env: {
    PATH: `${bin}:${process.env.PATH}`, BEADSCOPE_UPDATE_REQUEST_DIR: requestDir, BEADSCOPE_UPDATE_STATUS_FILE: statusFile,
    BEADSCOPE_UPDATE_LOCK_FILE: path.join(root, "run", "lock"), BEADSCOPE_PREFIX: prefix, BEADSCOPE_NPM: path.join(bin, "npm"), BEADSCOPE_HEALTH_SECONDS: "2", ...env } });
}
const systemctl = () => callLog().filter(l => l.startsWith("systemctl")).map(l => l.slice(10));
const reset = v => { fs.rmSync(prefix, { recursive: true, force: true }); for (const s of [".prev", ".next", ".failed"]) fs.rmSync(prefix + s, { recursive: true, force: true }); install(prefix, v); };

try {
  // A valid request: installed into a staging prefix, swapped in, old copy kept, app restarted after the Updating page.
  reset("0.1.0");
  let r = run(JSON.stringify({ version: "0.2.0", requestedAt: "now" }));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(version(prefix), "0.2.0"); assert.equal(version(prefix + ".prev"), "0.1.0");
  assert.equal(status().state, "done"); assert.equal(status().version, "0.2.0");
  assert.equal(fs.existsSync(path.join(requestDir, "request.json")), false, "the request is consumed");
  assert.deepEqual(systemctl(), ["stop beadscope", "start beadscope-updating", "stop beadscope-updating", "start beadscope"]);
  assert.match(callLog().find(l => l.startsWith("npm")), /install -g --prefix .*opt-beadscope\.next --ignore-scripts .* beadscope@0\.2\.0$/);
  assert.equal(fs.existsSync(prefix + ".next"), false);

  // Never the same version, a downgrade, or anything that is not a plain X.Y.Z: nothing is touched.
  for (const [req, why] of [[`{"version":"0.2.0"}`, /not newer/], [`{"version":"0.1.9"}`, /not newer/], [`{"version":"0.2.0-beta.1"}`, /plain/],
    [`{"version":"0.3.0 --prefix=/tmp/x"}`, /plain/], [`{"version":"$(touch ${root}/pwned)"}`, /plain/], ["garbage", /plain/], ["", /plain/]]) {
    r = run(req); assert.equal(r.status, 0); assert.equal(status().state, "failed"); assert.match(status().message, why);
    assert.equal(version(prefix), "0.2.0"); assert.deepEqual(callLog(), [], `no commands for ${JSON.stringify(req)}`);
  }
  assert.equal(fs.existsSync(path.join(root, "pwned")), false);
  // A symlinked request (the app owns that folder) is refused, not followed.
  fs.writeFileSync(path.join(root, "target.json"), `{"version":"9.9.9"}`);
  r = run(() => fs.symlinkSync(path.join(root, "target.json"), path.join(requestDir, "request.json")));
  assert.equal(status().state, "failed"); assert.deepEqual(callLog(), []); assert.equal(version(prefix), "0.2.0");
  // No request: a no-op.
  fs.rmSync(statusFile); r = run(null); assert.equal(r.status, 0); assert.equal(fs.existsSync(statusFile), false);

  // npm fails (a release not on the registry yet): the old install stays, the app comes back, the reason is recorded.
  r = run(`{"version":"0.3.0"}`, { FAKE_NPM_FAIL: "1" });
  assert.equal(r.status, 1); assert.equal(version(prefix), "0.2.0"); assert.equal(fs.existsSync(prefix + ".next"), false);
  assert.equal(status().state, "failed"); assert.match(status().message, /ETARGET/);
  assert.deepEqual(systemctl().slice(-2), ["stop beadscope-updating", "start beadscope"]);
  // npm installs something other than what was asked for.
  r = run(`{"version":"0.3.0"}`, { FAKE_NPM_VERSION: "0.2.5" });
  assert.equal(r.status, 1); assert.equal(version(prefix), "0.2.0"); assert.match(status().message, /0\.2\.5/);
  // The new version does not answer: the previous install is put back.
  r = run(`{"version":"0.3.0"}`, { FAKE_CURL_FAIL: "1" });
  assert.equal(r.status, 1); assert.equal(version(prefix), "0.2.0"); assert.equal(version(prefix + ".failed"), "0.3.0");
  assert.equal(status().state, "failed"); assert.match(status().message, /did not answer/);
  assert.equal(systemctl().at(-1), "start beadscope");
  // And a later good update still works, replacing the old backup.
  r = run(`{"version":"0.3.0"}`); assert.equal(r.status, 0); assert.equal(version(prefix), "0.3.0"); assert.equal(version(prefix + ".prev"), "0.2.0");
  // 0.9 -> 0.10 is newer (numeric, not alphabetical).
  reset("0.9.0"); r = run(`{"version":"0.10.0"}`); assert.equal(r.status, 0); assert.equal(version(prefix), "0.10.0");

  // The Updating page.
  const free = await new Promise(res => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
  const child = spawn("node", [path.join(repo, "server-updater", "updating.mjs")], { env: { ...process.env, HOST: "127.0.0.1", PORT: String(free), BEADSCOPE_UPDATE_STATUS_FILE: statusFile } });
  try {
    await new Promise((res, rej) => { child.stdout.on("data", res); child.on("error", rej); setTimeout(() => rej(Error("no start")), 5000); });
    fs.writeFileSync(statusFile, JSON.stringify({ state: "installing", version: "0.10.0", message: "", since: Math.floor(Date.now() / 1000) }));
    const base = `http://127.0.0.1:${free}`;
    for (const p of ["/", "/p/some-project?bead=x", "/anything/else"]) {
      const res = await fetch(base + p);
      assert.equal(res.status, 503); assert.equal(res.headers.get("retry-after"), "5"); assert.match(res.headers.get("content-type"), /text\/html/);
      const html = await res.text(); assert.match(html, /Updating Beadscope/); assert.match(html, /to 0\.10\.0/); assert.match(html, /Downloading and installing/);
    }
    const api = await fetch(base + "/api/telemetry"); assert.equal(api.status, 503);
    const body = await api.json(); assert.equal(body.updating, true); assert.equal(body.version, "0.10.0");
    assert.equal((await fetch(base + "/api/p/x/beads", { method: "POST", body: "{}" })).status, 503);
    assert.equal((await fetch(base, { method: "HEAD" })).status, 503);
    // A hostile or missing status file never breaks the page or reaches the HTML unescaped.
    fs.writeFileSync(statusFile, JSON.stringify({ state: "installing", version: "<script>alert(1)</script>", since: "x" }));
    const hostile = await (await fetch(base)).text(); assert.doesNotMatch(hostile, /<script>alert/);
    fs.rmSync(statusFile); assert.equal((await fetch(base)).status, 503);
    fs.writeFileSync(statusFile, JSON.stringify({ state: "starting", version: "0.10.0", since: 1 }));
    assert.match(await (await fetch(base)).text(), /Starting the new version/);
  } finally { child.kill(); }
  console.log("PASS: updater requests (valid, same/older/odd versions, symlink, none), npm failure, wrong version, failed health check rolls back, numeric ordering, Updating page (503 html/json, escaping, states)");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
