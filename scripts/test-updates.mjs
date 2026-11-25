import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// Real temporary Git repositories; only GitHub HTTP and the expensive build are substituted.
import { createUpdater } from '../lib/update-service.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beadscope-update-'));
const remote = path.join(root, 'remote'); const clone = path.join(root, 'clone');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
let latest = 'v0.2.0', offline = false, status = 200;
const http = async url => {
 if (offline) throw Error('offline');
 if (status !== 200) return new Response('', {status});
 const tag = url.endsWith('/latest') ? latest : decodeURIComponent(url.split('/').at(-1));
 return Response.json({tag_name:tag, draft:false, prerelease:false});
};
try {
 fs.mkdirSync(remote); git(remote,'init','-b','main'); git(remote,'config','user.email','test@example.invalid'); git(remote,'config','user.name','Test');
 const commit = version => { fs.writeFileSync(path.join(remote,'package.json'), JSON.stringify({name:'beadscope',version})); git(remote,'add','.'); git(remote,'commit','-m',version); return git(remote,'rev-parse','HEAD'); };
 const old = commit('0.1.0');
 git(root,'clone',remote,clone); git(clone,'config','user.email','test@example.invalid'); git(clone,'config','user.name','Test');
 const release = commit('0.2.0'); git(remote,'tag','-a','v0.2.0','-m','release');
 const newest = commit('0.3.0'); git(remote,'tag','v0.3.0');
 const run = async (cmd,args,opts) => { if(cmd==='git') return {stdout:git(opts.cwd,...args),stderr:''}; fs.appendFileSync(path.join(root,'builds'),cmd+' '+args.join(' ')+'\n'); return {stdout:'ok',stderr:''}; };
 const options={cwd:clone,version:'0.1.0',repository:'sai-manoj-kumar/beadscope',remote,fetch:http,run};
 const updater=createUpdater(options);
 const s=await updater.check();
 assert.equal(s.channel,'stable'); assert.equal(s.updateAvailable,true); assert.equal(s.latestVersion,'0.2.0'); assert.equal(s.target.sha,release); assert.equal(s.target.tag,'v0.2.0');
 latest='v0.3.0'; // A later release after opening the dialog must not change the approved target.
 const result=await updater.update(s.target);
 assert.equal(result.toSha,release); assert.equal(git(clone,'rev-parse','HEAD'),release); assert.notEqual(result.toSha,newest);
 assert.match(fs.readFileSync(path.join(root,'builds'),'utf8'),/npm run build/);
 const nogit=path.join(root,'installed');fs.mkdirSync(nogit);
 const installed=createUpdater({...options,cwd:nogit});
 const notice=await installed.check();assert.equal(notice.updateAvailable,true);assert.equal(notice.canUpdate,false);assert.match(notice.releaseUrl,/releases\/tag\/v0.3.0$/);
 await assert.rejects(installed.update(s.target),/checkout/i);
 assert.equal((await createUpdater({...options,cwd:nogit,version:'0.3.0'}).check()).updateAvailable,false);
 assert.equal((await createUpdater({...options,cwd:nogit,version:'0.4.0'}).check()).updateAvailable,false,'never suggest a downgrade');
 assert.equal((await createUpdater({...options,cwd:nogit,version:'0.3.0-beta.1'}).check()).updateAvailable,true);
 status=404;assert.equal((await createUpdater({...options,cwd:nogit}).check()).updateAvailable,false);status=429;
 assert.match((await createUpdater({...options,cwd:nogit}).check()).error,/429/);status=200;
 offline=true;assert.match((await createUpdater({...options,cwd:nogit}).check()).error,/offline/);offline=false;
 fs.writeFileSync(path.join(clone,'local.txt'),'keep me');
 await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:newest}),/uncommitted/i);
 assert.equal(fs.readFileSync(path.join(clone,'local.txt'),'utf8'),'keep me');fs.unlinkSync(path.join(clone,'local.txt'));
 git(clone,'switch','-c','feature');await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:newest}),/branch/i);git(clone,'switch','main');
 await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:old}),/changed|match/i);
 await assert.rejects(updater.update({channel:'stable',tag:'--upload-pack=evil',sha:newest}),/invalid/i);
 const dev=await updater.check('development');assert.equal(dev.target.sha,newest);assert.equal(dev.updateAvailable,true);
 await updater.update(dev.target);assert.equal(git(clone,'rev-parse','HEAD'),newest);
 // Locally diverged work must not be overwritten by an exact release update.
 git(clone,'reset','--hard',release);fs.writeFileSync(path.join(clone,'custom'),'local');git(clone,'add','.');git(clone,'commit','-m','local');
 const localHead=git(clone,'rev-parse','HEAD');
 await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:newest}),/diverg|fast.forward/i);
 assert.equal(git(clone,'rev-parse','HEAD'),localHead);

 // A failed development build remains discoverable after the source advanced.
 git(clone,'reset','--hard',release);
 const failing=createUpdater({...options,buildSha:release,run:async(cmd,args,opts)=>{if(cmd==='npm')throw Error('build unavailable');return run(cmd,args,opts);}});
 const failureTarget=(await failing.check('development')).target;
 await assert.rejects(failing.update(failureTarget),/failed/);
 assert.equal(git(clone,'rev-parse','HEAD'),newest);
 assert.equal((await createUpdater({...options,buildSha:release}).check('development')).updateAvailable,true,'a failed build must remain retryable after reload');
 git(clone,'reset','--hard',release);
 const supervised=createUpdater({...options,supervised:true});
 await supervised.update({channel:'stable',tag:'v0.3.0',sha:newest});
 await assert.rejects(supervised.update({channel:'stable',tag:'v0.3.0',sha:newest}),/already running/,'the restart delay must not permit a second update');

 git(clone,'checkout','--detach',release);
 await createUpdater(options).update({channel:'stable',tag:'v0.3.0',sha:newest});
 assert.equal(git(clone,'rev-parse','HEAD'),newest,'detached release installs can advance safely');
 assert.equal(git(clone,'branch','--show-current'),'');
 const badRelease=createUpdater({...options,cwd:nogit,fetch:async()=>Response.json({tag_name:'v0.4.0-beta.1',draft:false,prerelease:true})});
 assert.equal((await badRelease.check()).updateAvailable,false);
 assert.match((await badRelease.check()).error,/Invalid/);
 git(remote,'tag','v0.4.0',newest);
 await assert.rejects(createUpdater(options).update({channel:'stable',tag:'v0.4.0',sha:newest}),/version do not match/);
 // A global npm install is updated in place with `npm install -g --prefix <its prefix> beadscope@<tag>`.
 const prefix=path.join(root,'npm-prefix');const app=path.join(prefix,'lib','node_modules','beadscope');
 fs.mkdirSync(app,{recursive:true});fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'beadscope',version:'0.1.0'}));
 const npmCalls=[];let npmFails=false,npmWrites=true;
 const npmRun=async(cmd,args,opts)=>{if(cmd!=='npm')throw Error('unexpected '+cmd);npmCalls.push(args);if(npmFails)throw Error('E404');
  if(npmWrites)fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'beadscope',version:args.find(a=>a.startsWith('beadscope@')).slice(10)}));return {stdout:'added 1 package',stderr:''};};
 latest='v0.3.0';
 const npmOpts={...options,cwd:app,run:npmRun};
 const npmUpdater=createUpdater(npmOpts);
 const ns=await npmUpdater.check();
 assert.equal(ns.installKind,'npm');assert.equal(ns.updateAvailable,true);assert.equal(ns.canUpdate,true);assert.equal(ns.manualReason,undefined);
 assert.deepEqual(ns.target,{channel:'stable',tag:'v0.3.0'});
 assert.equal((await npmUpdater.check('development')).canUpdate,false,'development needs a Git checkout');
 await assert.rejects(npmUpdater.update({channel:'stable',tag:'--prefix=/tmp/evil'}),/invalid/i);
 assert.equal(npmCalls.length,0);
 await assert.rejects(createUpdater({...npmOpts,version:'0.3.0'}).update(ns.target),/not newer/);
 npmFails=true;await assert.rejects(npmUpdater.update(ns.target),/npm could not install/);npmFails=false;
 npmWrites=false;await assert.rejects(npmUpdater.update(ns.target),/installed version/);npmWrites=true;
 npmCalls.length=0;
 const nr=await npmUpdater.update(ns.target);
 assert.equal(nr.ok,true);assert.equal(nr.restarting,false);assert.equal(nr.toSha,'0.3.0');
 assert.deepEqual(npmCalls,[['install','-g','--prefix',fs.realpathSync(prefix),'beadscope@0.3.0','--no-audit','--no-fund']]);
 assert.equal(JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8')).version,'0.3.0');
 fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'beadscope',version:'0.1.0'}));
 const sup=createUpdater({...npmOpts,supervised:true});
 assert.equal((await sup.update(ns.target)).restarting,true);
 await assert.rejects(sup.update(ns.target),/already running/);
 // Homebrew, npx and unrelated packages are never replaced from inside the app.
 const brew=path.join(root,'Cellar','beadscope','0.1.0','libexec','lib','node_modules','beadscope');fs.mkdirSync(brew,{recursive:true});fs.writeFileSync(path.join(brew,'package.json'),JSON.stringify({name:'beadscope',version:'0.1.0'}));
 const bs=await createUpdater({...npmOpts,cwd:brew}).check();assert.equal(bs.installKind,'manual');assert.equal(bs.canUpdate,false);assert.match(bs.manualReason,/manual update/);
 // A read-only install directory is reported, not attempted.
 fs.chmodSync(path.dirname(app),0o555);
 try{const ro=await createUpdater(npmOpts).check();if(process.getuid?.()!==0){assert.equal(ro.canUpdate,false);assert.match(ro.manualReason,/not writable/);await assert.rejects(createUpdater(npmOpts).update(ns.target),/not writable/);}}finally{fs.chmodSync(path.dirname(app),0o755);}
 console.log('PASS: stable notices, installed copies, semver, no-release/offline/rate-limit, exact tag update, in-place npm update, development channel, dirty/branch/divergence/target guards');
} finally {fs.rmSync(root,{recursive:true,force:true});}
