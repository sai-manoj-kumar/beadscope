#!/usr/bin/env node
/**
 * The "Updating Beadscope" page. While the updater replaces the install, this stands in for the app on its port, so
 * opening Beadscope shows what is happening instead of a connection error. Every request gets HTTP 503 with
 * Retry-After: pages get the HTML below, /api/* gets JSON. The page polls /api/telemetry and reloads itself the
 * moment the real app answers 200 there. Node stdlib only: it runs while the app's own files are being replaced.
 *
 * Env: HOST (127.0.0.1), PORT (3000), BEADSCOPE_UPDATE_STATUS_FILE (the updater's status.json).
 */
import http from "node:http";
import fs from "node:fs";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const statusFile = process.env.BEADSCOPE_UPDATE_STATUS_FILE || "/run/beadscope-updater/status.json";

const STEPS = { installing: "Downloading and installing the new version", starting: "Starting the new version", failed: "The update failed; restoring the previous version", done: "Almost done" };

function readStatus() {
  try {
    const s = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    const version = /^\d+\.\d+\.\d+$/.test(s.version) ? s.version : "";
    const state = Object.hasOwn(STEPS, s.state) ? s.state : "installing";
    const since = Number.isFinite(s.since) ? s.since : Math.floor(Date.now() / 1000);
    return { state, version, step: STEPS[state], since };
  } catch { return { state: "installing", version: "", step: STEPS.installing, since: Math.floor(Date.now() / 1000) }; }
}

const page = ({ version, step }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Updating Beadscope</title>
<style>
:root{--bg:#f6f6f8;--surface:#fff;--border:#e7e7ec;--text:#16161a;--text-2:#4d4d58;--brand:#5f50e6}
@media (prefers-color-scheme:dark){:root{--bg:#0c0c0f;--surface:#16161b;--border:#2a2a33;--text:#f2f2f5;--text-2:#b4b4bf;--brand:#8b7ff5}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:440px;padding:32px;background:var(--surface);border:1px solid var(--border);border-radius:14px;text-align:center}
.spin{width:36px;height:36px;margin:0 auto 20px;border:3px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spin{animation:none;border-top-color:var(--brand);border-right-color:var(--brand)}}
h1{margin:0 0 8px;font-size:22px;font-weight:600}
p{margin:0 0 8px;color:var(--text-2)}
#step{color:var(--text);font-weight:500}
</style></head><body><main role="status" aria-live="polite">
<div class="spin" aria-hidden="true"></div>
<h1>Updating Beadscope<span id="to">${version ? ` to ${version}` : ""}</span></h1>
<p id="step">${step}</p>
<p>This takes a few minutes. You do not need to do anything: this page reloads when Beadscope is back. <span id="clock"></span></p>
</main>
<script>
const started = Date.now();
const clock = document.getElementById("clock");
setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); clock.textContent = "(" + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + ")"; }, 1000);
async function poll() {
  try {
    const r = await fetch("/api/telemetry", { cache: "no-store" });
    if (r.ok) { location.reload(); return; }
    const s = await r.json();
    if (s && s.step) document.getElementById("step").textContent = s.step;
    if (s && s.version) document.getElementById("to").textContent = " to " + s.version;
  } catch {}
  setTimeout(poll, 2000);
}
setTimeout(poll, 2000);
</script></body></html>
`;

http.createServer((req, res) => {
  const status = readStatus();
  const headers = { "Retry-After": "5", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if ((req.url || "").startsWith("/api/")) {
    res.writeHead(503, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ updating: true, ...status }));
    return;
  }
  res.writeHead(503, { ...headers, "Content-Type": "text/html; charset=utf-8" });
  res.end(req.method === "HEAD" ? undefined : page(status));
}).listen(port, host, () => console.log(`Updating page on http://${host}:${port}/`));
