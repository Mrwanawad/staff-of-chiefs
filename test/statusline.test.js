'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, run } = require('./helpers');
const { render } = require('../runtime/statusline');

const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const fixture = () => ({ ...JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'status.json'), 'utf8')),
  updated: new Date().toISOString() });

test('prints nothing when off or no state', () => {
  assert.strictEqual(render(null, fixture()), '');
  assert.strictEqual(render({ on: false }, fixture()), '');
  const dir = tmpDir();
  const r = run('runtime/statusline.js', [], dir, '{}');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('renders header, lead and agents from a fixture', () => {
  const out = strip(render({ on: true, plan: true, fable: true }, fixture())).split('\n');
  assert.strictEqual(out[0], '[STAFF-OF-CHIEFS +plan +fable | 2 live | 84k/150k]');
  assert.match(out[1], /^ {2}lead\s+main session · opus-5-5 {2}12k$/);
  assert.match(out[2], /^● sonnet {4}write tests for the \/health endpoint › Bash {2}3\.1k$/);
  assert.match(out[3], /^● haiku {5}find all route registrations in src\/server\/ro… › Grep {2}450$/);
  assert.match(out[4], /^✓ fable {5}threat model for health endpoint {2}21k$/);
  assert.strictEqual(out.length, 5);
});

test('header colour follows the budget', () => {
  const s = fixture();
  assert.match(render({ on: true }, { ...s, burn: 10000 }), /\x1b\[38;5;51m\[STAFF/);
  assert.match(render({ on: true }, { ...s, burn: 120000 }), /\x1b\[38;5;214m\[STAFF/);
  assert.match(render({ on: true }, { ...s, burn: 160000 }), /\x1b\[38;5;203m\[STAFF/);
});

test('stale status shows only the header; control characters are stripped', () => {
  const s = { ...fixture(), updated: '2000-01-01T00:00:00Z' };
  assert.strictEqual(strip(render({ on: true }, s)), '[STAFF-OF-CHIEFS]');
  const evil = fixture();
  evil.agents = [{ agent: 'x', tier: 'opus', status: 'done', task: 'a\x1b]0;pwn\x07b', eq: 1 }];
  assert.ok(!render({ on: true }, evil).includes('\x07'));
});

test('runs the previous status line first and appends to it', () => {
  const dir = tmpDir();
  const soc = path.join(dir, 'staff-of-chiefs');
  fs.mkdirSync(path.join(soc, 'state'), { recursive: true });
  fs.writeFileSync(path.join(soc, 'config.json'), JSON.stringify({ previousStatusLine: { type: 'command', command: 'echo prev-line' } }));
  let r = run('runtime/statusline.js', [], dir, '{}');
  assert.strictEqual(r.stdout.trim(), 'prev-line', 'off: only the previous line');
  fs.writeFileSync(path.join(soc, 'state', 'mode.json'), JSON.stringify({ on: true, plan: false, fable: false, approve: false }));
  fs.writeFileSync(path.join(soc, 'state', 'status.json'), JSON.stringify(fixture()));
  r = run('runtime/statusline.js', [], dir, '{}');
  const lines = strip(r.stdout).trim().split('\n');
  assert.strictEqual(lines[0], 'prev-line [STAFF-OF-CHIEFS | 2 live | 84k/150k]');
});

test('is fast', () => {
  const dir = tmpDir();
  const t = Date.now();
  run('runtime/statusline.js', [], dir, '{}');
  assert.ok(Date.now() - t < 1000, 'process including node startup well under 1 s');
  const s = fixture(); const t2 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) render({ on: true }, s);
  assert.ok(Number(process.hrtime.bigint() - t2) / 1e6 / 100 < 5, 'render < 5 ms');
});
