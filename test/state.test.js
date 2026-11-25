'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir } = require('./helpers');
const dir = tmpDir();
process.env.CLAUDE_CONFIG_DIR = dir;
const C = require('../runtime/config');

test('missing state file reads as off', () => {
  assert.deepStrictEqual(C.readMode(), C.OFF);
});

test('write then read round-trips, with a single mode.json', () => {
  C.writeMode({ on: true, plan: true, fable: false, approve: false });
  assert.deepStrictEqual(C.readMode(), { on: true, plan: true, fable: false, approve: false });
  assert.strictEqual(C.MODE_FILE, path.join(dir, 'staff-of-chiefs', 'state', 'mode.json'));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(C.MODE_FILE)).filter(f => f.endsWith('.tmp')), []);
  C.writeMode({ on: false, plan: true });
  assert.deepStrictEqual(C.readMode(), C.OFF, 'off clears flags');
});

test('malformed state reads as off', () => {
  fs.writeFileSync(C.MODE_FILE, '{nope');
  assert.deepStrictEqual(C.readMode(), C.OFF);
  fs.writeFileSync(C.MODE_FILE, '"on"');
  assert.deepStrictEqual(C.readMode(), C.OFF);
});

test('symlinked state file is refused for read and write', t => {
  const target = path.join(dir, 'elsewhere.json');
  fs.writeFileSync(target, JSON.stringify({ on: true, plan: true }));
  fs.rmSync(C.MODE_FILE, { force: true });
  try { fs.symlinkSync(target, C.MODE_FILE); } catch { return t.skip('symlinks not permitted here'); }
  assert.deepStrictEqual(C.readMode(), C.OFF);
  assert.throws(() => C.writeMode({ on: true }), /symlink/);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), JSON.stringify({ on: true, plan: true }), 'target untouched');
  fs.rmSync(C.MODE_FILE);
});

test('event log appends and reads back', () => {
  C.logEvent({ type: 'mode', mode: 'on' });
  C.logEvent({ type: 'request', prompt: 'x' });
  const ev = C.readEvents();
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(ev[1].prompt, 'x');
  assert.ok(ev[0].ts);
});

test('transcript stats and runs from a fixture', () => {
  const tr = path.join(dir, 'session.jsonl');
  const sub = C.subagentPath(tr, 'abc');
  fs.mkdirSync(path.dirname(sub), { recursive: true });
  const line = (o) => JSON.stringify(o) + '\n';
  fs.writeFileSync(sub,
    line({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { content: 'write tests' } }) +
    line({ type: 'assistant', timestamp: '2026-01-01T00:00:01Z', message: { id: 'm1', model: 'claude-sonnet-5-5',
      usage: { input_tokens: 1000, output_tokens: 1000 }, content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } }) +
    line({ type: 'assistant', timestamp: '2026-01-01T00:00:01Z', message: { id: 'm1', model: 'claude-sonnet-5-5',
      usage: { input_tokens: 1000, output_tokens: 1000 }, content: [{ type: 'text', text: 'done' }] } }));
  const runs = C.buildRuns([
    { type: 'dispatch', agent: 'squad-sonnet', session: 's', desc: 'tests', ts: '2026-01-01T00:00:00Z' },
    { type: 'start', id: 'abc', agent: 'squad-sonnet', session: 's', parent: tr, ts: '2026-01-01T00:00:00Z' },
  ]);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].status, 'running');
  assert.strictEqual(runs[0].tier, 'sonnet');
  assert.strictEqual(runs[0].stats.opusEq, 1000, 'duplicate message ids count once, sonnet weight 0.5');
  assert.strictEqual(runs[0].stats.recent[0].tool, 'Bash');
});

test('a run with no stop and no transcript becomes lost after 90 s', () => {
  const old = new Date(Date.now() - 120e3).toISOString();
  const recent = new Date().toISOString();
  const runs = C.buildRuns([
    { type: 'start', id: 'gone', agent: 'squad-fable', session: 's', parent: path.join(dir, 'none.jsonl'), ts: old },
    { type: 'start', id: 'new', agent: 'squad-haiku', session: 's', parent: path.join(dir, 'none.jsonl'), ts: recent },
  ]);
  assert.strictEqual(runs.find(r => r.id === 'gone').status, 'lost');
  assert.strictEqual(runs.find(r => r.id === 'new').status, 'running');
});

test('the same ticket re-sent to another agent marks the first run lost (Fable fallback)', () => {
  const t = new Date().toISOString();
  const runs = C.buildRuns([
    { type: 'dispatch', agent: 'squad-fable', session: 's', desc: 'Review', ticket: 'T', ts: t },
    { type: 'start', id: 'f', agent: 'squad-fable', session: 's', parent: path.join(dir, 'x.jsonl'), ts: t },
    { type: 'dispatch', agent: 'squad-opus', session: 's', desc: 'Review', ticket: 'T', ts: t },
    { type: 'start', id: 'o', agent: 'squad-opus', session: 's', parent: path.join(dir, 'x.jsonl'), ts: t },
  ]);
  assert.strictEqual(runs.find(r => r.id === 'f').status, 'lost');
  assert.strictEqual(runs.find(r => r.id === 'o').status, 'running');
});
