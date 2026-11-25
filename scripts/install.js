#!/usr/bin/env node
// staff-of-chiefs installer (manual path). Idempotent: running it again changes nothing new.
//
//   node scripts/install.js                  skill + agents + runtime + hooks
//   node scripts/install.js --statusline     ... and the terminal status line
//   node scripts/install.js --statusline-only  only the status line (for plugin installs)
//   node scripts/install.js --no-agents      skip the four squad-* agent files
//   node scripts/install.js --dry-run        print what would change, write nothing
//
// Config dir: $CLAUDE_CONFIG_DIR or ~/.claude. settings.json is backed up before it is changed.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

function main(argv) {
  const opt = L.args(argv, ['--dry-run', '--statusline', '--statusline-only', '--no-agents']);
  const dry = opt.has('--dry-run');
  const only = opt.has('--statusline-only');
  const wantStatus = only || opt.has('--statusline');
  const P = L.paths();
  const log = [];
  const say = s => log.push(s);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) throw new Error(`Node ${process.versions.node} is too old; staff-of-chiefs needs Node 18 or newer.`);

  const st = L.readSettings(P.SETTINGS);
  const prior = L.readJson(P.MANIFEST, null);
  // The settings.json as it was before the FIRST install, so uninstall can restore it byte for byte.
  const original = prior && prior.settings ? prior.settings
    : { existed: st.exists, raw: st.raw };

  // 1. files
  const files = new Set(prior && Array.isArray(prior.files) ? prior.files : []);
  const backups = [];
  const plan = [];
  if (!only) {
    plan.push([path.join(L.REPO, 'skills', 'staff-of-chiefs', 'SKILL.md'), path.join(P.SKILL_DIR, 'SKILL.md')]);
    for (const f of L.RUNTIME_FILES) plan.push([path.join(L.REPO, 'runtime', f), path.join(P.RUNTIME, f)]);
    if (!opt.has('--no-agents')) for (const a of L.AGENTS) plan.push([path.join(L.REPO, 'agents', a), path.join(P.AGENTS_DIR, a)]);
  } else {
    // Plugin installs: copy just the status line script to a stable path (the plugin cache path
    // changes with every plugin version).
    plan.push([path.join(L.REPO, 'runtime', 'statusline.js'), path.join(P.RUNTIME, 'statusline.js')]);
  }
  for (const [src, dest] of plan) {
    const rel = L.fwd(path.relative(P.CLAUDE_DIR, dest));
    const same = fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(src));
    if (same) { files.add(rel); continue; }
    // A file we did not install (a user's own agent with the same name): keep a copy.
    if (fs.existsSync(dest) && !files.has(rel)) {
      const b = `${dest}.soc-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      backups.push(b);
      say(`backed up your existing ${rel} to ${path.basename(b)}`);
      if (!dry) fs.copyFileSync(dest, b);
    }
    say(`${fs.existsSync(dest) ? 'updated' : 'copied'} ${rel}`);
    if (!dry) L.copyFile(src, dest);
    files.add(rel);
  }

  // 2. settings.json
  let settings = st.data;
  const changes = [];
  if (!only) {
    const r = L.addHooks(settings, L.nodeCmd(path.join(P.RUNTIME, 'hook.js')));
    settings = r.settings; changes.push(...r.changes);
  }
  const userCfg = L.readJson(P.USER_CONFIG, {});
  let cfgChanged = false;
  if (wantStatus) {
    const command = L.nodeCmd(path.join(P.RUNTIME, 'statusline.js'));
    const cur = settings.statusLine;
    const curIsOurs = cur && L.isOurs(cur.command, 'statusline.js');
    if (cur && !curIsOurs && !userCfg.previousStatusLine) {
      userCfg.previousStatusLine = cur; cfgChanged = true;
      changes.push('saved your existing status line; it still runs, first');
    }
    const want = { type: 'command', command, refreshInterval: 2 };
    if (!cur || !L.deepEqual(cur, curIsOurs ? want : null)) {
      settings = { ...settings, statusLine: want };
      changes.push(curIsOurs ? 'updated status line' : 'set status line (refreshInterval 2)');
    }
  }
  const settingsChanged = !L.deepEqual(settings, st.data);
  let backupFile = null;
  if (settingsChanged && !dry) {
    backupFile = L.backup(P.SETTINGS);
    L.writeJson(P.SETTINGS, settings);
  }
  if (cfgChanged && !dry) L.writeJson(P.USER_CONFIG, userCfg);

  // 3. manifest, used by uninstall.js
  const manifest = {
    name: 'staff-of-chiefs',
    installedAt: (prior && prior.installedAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    files: [...files].sort(),
    backups: [...new Set([...(prior && prior.backups || []), ...backups])],
    statusline: !!(wantStatus || (prior && prior.statusline)),
    hooks: !only || !!(prior && prior.hooks),
    settings: original,
  };
  if (!dry) L.writeJson(P.MANIFEST, manifest);

  // 4. summary
  const out = [];
  out.push(`${dry ? '[dry run] ' : ''}staff-of-chiefs ${only ? 'status line ' : ''}install into ${P.CLAUDE_DIR}`);
  for (const l of log) out.push('  - ' + l);
  if (!log.length) out.push('  - files already up to date');
  if (changes.length) {
    out.push(`  settings.json${dry ? ' would change' : ''}:`);
    for (const c of changes) out.push('    - ' + c);
    if (backupFile) out.push(`    backup: ${path.basename(backupFile)}`);
  } else out.push('  - settings.json already up to date');
  if (!wantStatus && !(prior && prior.statusline)) out.push('  - status line not added (run again with --statusline to add it)');
  out.push('');
  out.push(dry ? 'Nothing was written. Run without --dry-run to install.'
    : 'Done. Restart Claude Code, then run: /staff-of-chiefs status');
  return out.join('\n');
}

module.exports = { main };

if (require.main === module) {
  try { console.log(main(process.argv.slice(2))); } catch (e) {
    console.error('staff-of-chiefs install failed: ' + e.message);
    process.exit(1);
  }
}
