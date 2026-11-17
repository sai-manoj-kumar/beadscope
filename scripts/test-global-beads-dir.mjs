// bd keeps per-user state (machine-id, an event queue) in ~/.beads. That folder is
// not a beads workspace, so it must never make a folder (usually the home
// directory) count as a project. Loads lib/config.ts in child processes with a
// throwaway config dir; never touches the real ~/.config.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configModule = fileURLToPath(new URL('../lib/config.ts', import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'beadscope-global-beads-'));
const mk = (name, files) => {
  const dir = path.join(scratch, name);
  fs.mkdirSync(path.join(dir, '.beads'), { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, '.beads', f), '');
  return dir;
};
const home = mk('home', ['machine-id']); // what ~/.beads looks like
const repo = mk('repo', ['config.yaml', 'metadata.json']); // a real workspace
const older = mk('older', ['machine-id', 'config.yaml']); // a workspace that also has a machine-id
const empty = mk('empty', []); // a freshly created .beads
const none = path.join(scratch, 'none');
fs.mkdirSync(none);

/** Run `body` (async JS using the config module's exports) in a fresh process. */
function run(body, { cwd = scratch, onDisk } = {}) {
  const xdg = fs.mkdtempSync(path.join(scratch, 'xdg-'));
  fs.mkdirSync(path.join(xdg, 'beadscope'), { recursive: true });
  if (onDisk) fs.writeFileSync(path.join(xdg, 'beadscope', 'config.json'), JSON.stringify(onDisk));
  const script = `const m = await import(${JSON.stringify(configModule)}); ${body}`;
  const env = { ...process.env, XDG_CONFIG_HOME: xdg };
  delete env.BEADS_REPO;
  const out = execFileSync(process.execPath, ['--conditions=react-server', '--no-warnings', '--input-type=module', '-e', script], { cwd, env, encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

try {
  const has = run(`console.log(JSON.stringify(${JSON.stringify([home, repo, older, empty, none])}.map((p) => m.hasBeads(p))));`);
  assert.deepEqual(has, [false, true, true, true, false], 'only the per-user state folder is refused');

  const refused = run(`try { m.addProject(${JSON.stringify(home)}); console.log('"added"'); } catch (e) { console.log(JSON.stringify(e.code)); }`);
  assert.equal(refused, 'no_beads', 'adding a folder whose only .beads is the per-user one fails');

  // First start from such a folder (the migration from cwd) registers nothing.
  const fromHome = run(`console.log(JSON.stringify(m.getConfig().projects));`, { cwd: home });
  assert.deepEqual(fromHome, [], 'launching from the home folder does not register it');
  const fromRepo = run(`console.log(JSON.stringify(m.getConfig().projects.map((p) => p.path)));`, { cwd: repo });
  assert.deepEqual(fromRepo.map((p) => fs.realpathSync(p)), [fs.realpathSync(repo)], 'a real workspace still registers');

  console.log('PASS: the per-user .beads folder is not a project');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
