// staff-of-chiefs: helpers shared by install.js and uninstall.js. Node >= 18, no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const paths = () => {
  const CLAUDE_DIR = claudeDir();
  const SOC_DIR = path.join(CLAUDE_DIR, 'staff-of-chiefs');
  return {
    CLAUDE_DIR, SOC_DIR,
    RUNTIME: path.join(SOC_DIR, 'runtime'),
    MANIFEST: path.join(SOC_DIR, 'install.json'),
    USER_CONFIG: path.join(SOC_DIR, 'config.json'),
    SETTINGS: path.join(CLAUDE_DIR, 'settings.json'),
    SKILL_DIR: path.join(CLAUDE_DIR, 'skills', 'staff-of-chiefs'),
    AGENTS_DIR: path.join(CLAUDE_DIR, 'agents'),
    PID: path.join(SOC_DIR, 'state', 'server.pid'),
    MODE: path.join(SOC_DIR, 'state', 'mode.json'),
  };
};

const HOOK_EVENTS = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PreToolUse', matcher: 'Agent|Task|Skill|Edit|Write|MultiEdit|NotebookEdit' },
  { event: 'SubagentStart' },
  { event: 'SubagentStop' },
];
const AGENTS = ['squad-fable.md', 'squad-opus.md', 'squad-sonnet.md', 'squad-haiku.md'];
const RUNTIME_FILES = ['config.js', 'hook.js', 'server.js', 'open.js', 'statusline.js', 'dashboard.html'];

const fwd = p => p.replace(/\\/g, '/');
const nodeCmd = file => `node "${fwd(file)}"`;
// A settings command belongs to us if it runs <...>staff-of-chiefs<...>/runtime/<file>.
const isOurs = (cmd, file) => typeof cmd === 'string' && /staff-of-chiefs/i.test(cmd) &&
  new RegExp(`[\\\\/]runtime[\\\\/]+${file.replace('.', '\\.')}`, 'i').test(cmd);

function readSettings(file) {
  let raw = null;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (raw === null) return { exists: false, raw: null, data: {} };
  const text = raw.replace(/^﻿/, '');
  let data;
  try { data = text.trim() ? JSON.parse(text) : {}; } catch (e) {
    throw new Error(`${file} is not valid JSON (${e.message}). Fix it first; nothing was changed.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file} is not a JSON object.`);
  return { exists: true, raw, data };
}

const clone = o => JSON.parse(JSON.stringify(o));
const stable = v => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
  ? Object.keys(v).sort().reduce((a, k) => ((a[k] = stable(v[k])), a), {}) : v);
const deepEqual = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

// Add our hook to each event, once. If an older entry of ours points elsewhere, repoint it.
function addHooks(settings, command) {
  const s = clone(settings);
  const changes = [];
  if (!s.hooks || typeof s.hooks !== 'object' || Array.isArray(s.hooks)) s.hooks = {};
  for (const { event, matcher } of HOOK_EVENTS) {
    const groups = Array.isArray(s.hooks[event]) ? s.hooks[event] : (s.hooks[event] = []);
    let found = false;
    for (const g of groups) for (const h of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
      if (h && isOurs(h.command, 'hook.js')) {
        found = true;
        if (h.command !== command) { h.command = command; changes.push(`repointed ${event} hook`); }
        if (matcher && g.matcher !== matcher) { g.matcher = matcher; changes.push(`updated ${event} matcher`); }
      }
    }
    if (!found) {
      const group = { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout: 5 }] };
      groups.push(group);
      changes.push(`added ${event} hook${matcher ? ` (matcher ${matcher})` : ''}`);
    }
  }
  return { settings: s, changes };
}

// Remove every hook handler of ours, then any group, event or hooks object left empty by that.
function removeHooks(settings) {
  const s = clone(settings);
  const changes = [];
  if (!s.hooks || typeof s.hooks !== 'object') return { settings: s, changes };
  for (const event of Object.keys(s.hooks)) {
    const groups = s.hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept = [];
    for (const g of groups) {
      if (!g || !Array.isArray(g.hooks)) { kept.push(g); continue; }
      const hs = g.hooks.filter(h => !(h && isOurs(h.command, 'hook.js')));
      if (hs.length !== g.hooks.length) changes.push(`removed ${event} hook`);
      if (hs.length || hs.length === g.hooks.length) kept.push({ ...g, hooks: hs });
    }
    if (kept.length) s.hooks[event] = kept; else if (groups.length) delete s.hooks[event];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return { settings: s, changes };
}

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function writeRaw(file, raw) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, raw);
  fs.renameSync(tmp, file);
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${file}.soc-backup-${ts}`;
  fs.copyFileSync(file, dest);
  return dest;
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function stopServer(pidFile) {
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    if (pid) process.kill(pid);
  } catch {}
  try { fs.unlinkSync(pidFile); } catch {}
}

function args(argv, known) {
  const set = new Set();
  for (const a of argv) {
    if (!known.includes(a)) throw new Error(`unknown option ${a}. Options: ${known.join(' ')}`);
    set.add(a);
  }
  return set;
}

module.exports = { REPO, paths, HOOK_EVENTS, AGENTS, RUNTIME_FILES, fwd, nodeCmd, isOurs, readSettings, clone,
  deepEqual, addHooks, removeHooks, readJson, writeJson, writeRaw, backup, copyFile, stopServer, args };
