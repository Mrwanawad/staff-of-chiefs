#!/usr/bin/env node
// staff-of-chiefs uninstaller: the exact reverse of install.js.
//
//   node scripts/uninstall.js              remove hooks, status line, skill, agents, runtime and state
//   node scripts/uninstall.js --keep-state keep <config dir>/staff-of-chiefs/state (event log)
//   node scripts/uninstall.js --dry-run    print what would change, write nothing
//
// It removes only entries it added and restores the status line you had before. If you did not
// change settings.json in between, it is restored byte for byte.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

function main(argv) {
  const opt = L.args(argv, ['--dry-run', '--keep-state']);
  const dry = opt.has('--dry-run');
  const P = L.paths();
  const out = [`${dry ? '[dry run] ' : ''}staff-of-chiefs uninstall from ${P.CLAUDE_DIR}`];
  const manifest = L.readJson(P.MANIFEST, null);
  const userCfg = L.readJson(P.USER_CONFIG, {});

  if (!dry) L.stopServer(P.PID);

  // 1. settings.json
  const st = L.readSettings(P.SETTINGS);
  let { settings, changes } = L.removeHooks(st.data);
  if (settings.statusLine && L.isOurs(settings.statusLine.command, 'statusline.js')) {
    settings = L.clone(settings);
    if (userCfg.previousStatusLine) {
      settings.statusLine = userCfg.previousStatusLine;
      changes.push('restored your previous status line');
    } else {
      delete settings.statusLine;
      changes.push('removed status line');
    }
  }
  if (st.exists && changes.length) {
    const orig = manifest && manifest.settings;
    let origData = null;
    if (orig && orig.existed && typeof orig.raw === 'string') {
      try { origData = JSON.parse(orig.raw.replace(/^﻿/, '') || '{}'); } catch {}
    }
    if (!dry) {
      const b = L.backup(P.SETTINGS);
      if (b) changes.push(`backup: ${path.basename(b)}`);
      if (orig && !orig.existed && !Object.keys(settings).length) {
        fs.unlinkSync(P.SETTINGS); // we created it; it holds nothing else
        changes.push('deleted settings.json (the installer created it)');
      } else if (origData && L.deepEqual(origData, settings)) {
        L.writeRaw(P.SETTINGS, orig.raw); // nothing else changed: restore the exact original bytes
      } else {
        L.writeJson(P.SETTINGS, settings);
      }
    }
  }
  if (changes.length) { out.push('  settings.json:'); for (const c of changes) out.push('    - ' + c); }
  else out.push('  - settings.json: nothing of ours found');

  // 2. files
  const files = manifest && Array.isArray(manifest.files) ? manifest.files : [];
  for (const rel of files) {
    const f = path.resolve(P.CLAUDE_DIR, rel);
    if (!f.startsWith(path.resolve(P.CLAUDE_DIR) + path.sep)) continue; // never outside the config dir
    if (fs.existsSync(f)) { out.push(`  - removed ${rel}`); if (!dry) fs.rmSync(f, { force: true }); }
  }
  const dirs = [P.SKILL_DIR, P.RUNTIME];
  for (const d of dirs) {
    try { if (!dry && fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch {}
  }
  if (manifest && manifest.backups && manifest.backups.length) {
    out.push('  - kept backups of files you had before:');
    for (const b of manifest.backups) out.push('      ' + b);
  }

  // 3. state, config and manifest
  if (!dry) {
    try { fs.rmSync(P.USER_CONFIG, { force: true }); } catch {}
    try { fs.rmSync(P.MANIFEST, { force: true }); } catch {}
    if (!opt.has('--keep-state')) {
      fs.rmSync(path.join(P.SOC_DIR, 'state'), { recursive: true, force: true });
      try { fs.rmdirSync(P.SOC_DIR); } catch {}
    }
  }
  out.push(opt.has('--keep-state') ? '  - kept state (event log)' : '  - removed state, config and install record');
  out.push('');
  out.push(dry ? 'Nothing was written.' : 'Done. Restart Claude Code to unload the hooks. settings.json backups (*.soc-backup-*) were kept.');
  return out.join('\n');
}

module.exports = { main };

if (require.main === module) {
  try { console.log(main(process.argv.slice(2))); } catch (e) {
    console.error('staff-of-chiefs uninstall failed: ' + e.message);
    process.exit(1);
  }
}
