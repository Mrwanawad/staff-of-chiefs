#!/usr/bin/env node
// Builds demo/data.js for demo/replay.html from a recorded run.
//
//   node demo/make-data.js <run-dir>
//
// <run-dir> is a copy of a real run, already scrubbed of personal paths:
//   <run-dir>/staff-of-chiefs/state/{mode.json,events.jsonl}
//   <run-dir>/transcripts/session.jsonl (+ session/subagents/*.jsonl)
// with the event log's transcript paths pointing into <run-dir>. For each second of the run it
// rebuilds the state as it was at that moment (transcript lines and events up to that time) and
// renders the real status line from it, so every number in the demo comes from the run.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const src = path.resolve(process.argv[2] || '');
if (!fs.existsSync(path.join(src, 'staff-of-chiefs', 'state', 'events.jsonl'))) {
  console.error('usage: node demo/make-data.js <run-dir>'); process.exit(1);
}

// One frame of state at time T, computed in a child process (config paths are fixed at load).
const FRAME = `
const fs = require('fs'), path = require('path');
const [src, T, out, root] = process.argv.slice(1);
const Tms = Date.parse(T);
const map = p => p.split(src).join(out);
function trunc(f) {
  const lines = fs.readFileSync(f, 'utf8').split('\\n').filter(Boolean).filter(l => {
    try { const e = JSON.parse(l); return !e.timestamp || Date.parse(e.timestamp) <= Tms; } catch { return false; } });
  if (!lines.length) return;
  const d = map(f); fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.writeFileSync(d, lines.join('\\n') + '\\n');
  let last = 0; for (const l of lines) { const e = JSON.parse(l); if (e.timestamp) last = Date.parse(e.timestamp); }
  if (last) fs.utimesSync(d, last / 1000, last / 1000);
}
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f);
  if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.jsonl') && !p.includes('staff-of-chiefs')) trunc(p); } })(src);
const st = path.join(out, 'staff-of-chiefs', 'state'); fs.mkdirSync(st, { recursive: true });
fs.copyFileSync(path.join(src, 'staff-of-chiefs/state/mode.json'), path.join(st, 'mode.json'));
const evs = fs.readFileSync(path.join(src, 'staff-of-chiefs/state/events.jsonl'), 'utf8').split('\\n').filter(Boolean)
  .filter(l => Date.parse(JSON.parse(l).ts) <= Tms).map(map);
fs.writeFileSync(path.join(st, 'events.jsonl'), evs.join('\\n') + '\\n');
process.env.CLAUDE_CONFIG_DIR = out;
const S = require(path.join(root, 'runtime/server.js'));
const status = S.statusFor(S.snapshot(Tms)); status.updated = new Date().toISOString();
const mode = JSON.parse(fs.readFileSync(path.join(st, 'mode.json'), 'utf8'));
process.stdout.write(require(path.join(root, 'runtime/statusline.js')).render(mode, status));
`;

const events = fs.readFileSync(path.join(src, 'staff-of-chiefs/state/events.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse);
const req = events.find(e => e.type === 'request');
const t0 = Date.parse(req.ts);
const tEnd = Date.parse(events[events.length - 1].ts) + 25000; // covers the lead's final report

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soc-demo-'));
const frames = [];
let prev = null;
for (let t = t0; t <= tEnd; t += 1000) {
  const iso = new Date(t).toISOString();
  const line = execFileSync(process.execPath, ['-e', FRAME, src, iso, path.join(tmp, 'f'), ROOT], { encoding: 'utf8' });
  fs.rmSync(path.join(tmp, 'f'), { recursive: true, force: true });
  if (line !== prev) frames.push({ t: (t - t0) / 1000, ansi: line });
  prev = line;
}

// The lead's messages, in order, with their time offsets.
const said = [];
for (const l of fs.readFileSync(path.join(src, 'transcripts/session.jsonl'), 'utf8').split('\n')) {
  if (!l) continue;
  let e; try { e = JSON.parse(l); } catch { continue; }
  if (e.type !== 'assistant') continue;
  for (const c of (e.message && e.message.content) || []) {
    const at = (Date.parse(e.timestamp) - t0) / 1000;
    if (c.type === 'text' && c.text.trim()) said.push({ t: at, kind: 'text', text: c.text.trim() });
    if (c.type === 'tool_use') {
      const i = c.input || {};
      const arg = c.name === 'Agent' ? `${String(i.subagent_type).replace(/^staff-of-chiefs:/, '')} · ${i.description}` : (i.command || i.file_path || i.description || '');
      said.push({ t: at, kind: 'tool', tool: c.name, arg: String(arg).replace(/\s+/g, ' ').slice(0, 90) });
    }
  }
}

// The user's own messages (the command, then e.g. the approval), from the request log.
events.filter(e => e.type === 'request').forEach((e, i) => {
  const flags = String(e.flags || '').split(/\s+/).filter(Boolean).map(f => '--' + f.replace(/^\+/, '')).join(' ');
  said.push({ t: (Date.parse(e.ts) - t0) / 1000, kind: 'user', text: i === 0 ? `/staff-of-chiefs ${flags} ${e.prompt}`.replace(/\s+/g, ' ') : e.prompt });
});
said.sort((a, b) => a.t - b.t);

fs.rmSync(tmp, { recursive: true, force: true });

const data = { prompt: req.prompt, flags: req.flags || '', said, frames };
fs.writeFileSync(path.join(__dirname, 'data.js'), '// generated by demo/make-data.js from a real run\nwindow.DEMO = ' +
  JSON.stringify(data, null, 1) + ';\n');
console.log(`demo/data.js: ${frames.length} status frames, ${said.length} lead messages`);
