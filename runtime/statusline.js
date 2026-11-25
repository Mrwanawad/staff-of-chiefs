#!/usr/bin/env node
// staff-of-chiefs: terminal status line. Runs the user's previous status line command first (saved
// by install.js in config.json), then, while the mode is on, adds:
//   [STAFF-OF-CHIEFS +plan +fable | 2 live | 84k/150k]
//   lead   main session · opus-5-5   12k
//   ● sonnet   write tests for /health › Bash   3.1k
// Reads state/status.json (written by server.js every 2 s). Prints nothing of its own when off.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SOC_DIR = path.join(CLAUDE_DIR, 'staff-of-chiefs');
const MODE_FILE = path.join(SOC_DIR, 'state', 'mode.json');
const STATUS = path.join(SOC_DIR, 'state', 'status.json');
const USER_CONFIG = path.join(SOC_DIR, 'config.json');
const STALE_MS = 10000;

const E = '\x1b[';
const c = (code, text) => `${E}${code}m${text}${E}0m`;
const K = n => {
  n = Number(n) || 0;
  if (n >= 999500) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
};
const TIER = { fable: '38;5;177', opus: '38;5;208', sonnet: '38;5;45', haiku: '38;5;84', other: '38;5;250' };
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// Strip control characters from anything that came from logs, so it cannot inject terminal escapes.
const clean = s => String(s == null ? '' : s).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

function readStdin() {
  if (process.stdin.isTTY) return '';
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function previous(stdin) {
  const cfg = readJson(USER_CONFIG);
  const prev = cfg && cfg.previousStatusLine;
  const cmd = prev && typeof prev === 'object' ? prev.command : null;
  if (!cmd || typeof cmd !== 'string' || /staff-of-chiefs.*[\\/]runtime[\\/]+statusline\.js/i.test(cmd)) return '';
  try {
    const r = spawnSync(cmd, { shell: true, input: stdin, encoding: 'utf8', timeout: 3000, windowsHide: true });
    return String(r.stdout || '').replace(/\s+$/, '');
  } catch { return ''; }
}

function render(mode, s, now = Date.now()) {
  if (!mode || mode.on !== true) return '';
  const flags = ['plan', 'fable', 'approve'].filter(f => mode[f]).map(f => ' +' + f).join('');
  const fresh = s && Date.parse(s.updated) > now - STALE_MS;
  let head = `[STAFF-OF-CHIEFS${flags}`;
  let color = '38;5;51';
  if (fresh) {
    head += ` | ${Number(s.live) || 0} live | ${K(s.burn)}/${K(s.budget)}`;
    if (s.burn > s.budget) color = '38;5;203';
    else if (s.burn > 0.75 * s.budget) color = '38;5;214';
  }
  head += ']';
  const lines = [c(color, head)];
  if (fresh) {
    const lead = s.lead || {};
    const model = clean(lead.model || 'session model').replace(/^claude-/, '');
    lines.push('  ' + c(TIER.opus, 'lead     ') + ' ' + c('38;5;244', `main session · ${model}`) + '  ' + c('38;5;250', K(lead.eq)));
    for (const a of Array.isArray(s.agents) ? s.agents : []) {
      const running = a.status === 'running';
      const dot = running ? c('38;5;84', '●') : a.status === 'lost' ? c('38;5;203', '✗') : c('38;5;240', '✓');
      const name = clean(a.agent).replace(/^squad-/, '').padEnd(9);
      let task = clean(a.task);
      if (task.length > 46) task = task.slice(0, 45) + '…';
      const tool = running && a.last ? c('38;5;244', ' › ' + clean(a.last)) : '';
      lines.push(`${dot} ${c(TIER[a.tier] || TIER.other, name)} ${task}${tool}  ${c('38;5;250', K(a.eq))}`);
    }
  }
  return lines.join('\n');
}

module.exports = { render, K };

if (require.main === module) {
  let text = '';
  try {
    const prev = previous(readStdin());
    const mine = render(readJson(MODE_FILE), readJson(STATUS));
    text = prev && mine ? prev + ' ' + mine : prev || mine;
  } catch {}
  if (text) process.stdout.write(text + '\n');
}
