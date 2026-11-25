'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { tmpDir } = require('./helpers');
process.env.CLAUDE_CONFIG_DIR = tmpDir();
const C = require('../runtime/config');

const F = (plan, fable, approve) => ({ on: true, plan, fable, approve });

test('non-commands are ignored', () => {
  for (const p of ['', 'hello', '/staff', '/staff-of-chiefsx', 'run /staff-of-chiefs', '/other:staff-of-chiefs on', '/crew on'])
    assert.strictEqual(C.parseCommand(p), null, p);
});

test('plain and plugin-namespaced names', () => {
  for (const p of ['/staff-of-chiefs', '/staff-of-chiefs:staff-of-chiefs', '/STAFF-OF-CHIEFS', '  /staff-of-chiefs  '])
    assert.deepStrictEqual(C.parseCommand(p), { action: 'on', flags: null, task: '' }, p);
  assert.deepStrictEqual(C.parseCommand('/staff-of-chiefs:staff-of-chiefs --plan fix it'),
    { action: 'task', flags: { plan: true }, task: 'fix it' });
});

test('actions', () => {
  assert.strictEqual(C.parseCommand('/staff-of-chiefs on').action, 'on');
  assert.strictEqual(C.parseCommand('/staff-of-chiefs OFF').action, 'off');
  assert.strictEqual(C.parseCommand('/staff-of-chiefs status').action, 'status');
  assert.deepStrictEqual(C.parseCommand('/staff-of-chiefs turn off the lights'),
    { action: 'task', flags: null, task: 'turn off the lights' });
  assert.deepStrictEqual(C.parseCommand('/staff-of-chiefs add\nmultiline task'),
    { action: 'task', flags: null, task: 'add\nmultiline task' });
});

test('every flag combination, with every action', () => {
  const names = ['plan', 'fable', 'approve'];
  for (let mask = 0; mask < 8; mask++) {
    const set = names.filter((_, i) => mask & (1 << i));
    const fl = set.map(f => '--' + f).join(' ');
    for (const tail of ['', 'on', 'off', 'status', 'add a /health endpoint']) {
      const p = `/staff-of-chiefs ${fl} ${tail}`;
      const r = C.parseCommand(p);
      assert.ok(r, p);
      assert.deepStrictEqual(r.flags, set.length ? Object.fromEntries(set.map(f => [f, true])) : null, p);
      assert.strictEqual(r.action, tail === '' || tail === 'on' ? 'on' : tail === 'off' ? 'off' : tail === 'status' ? 'status' : 'task', p);
      if (r.action === 'task') assert.strictEqual(r.task, tail);
    }
  }
});

test('flags after the task are part of the task; unknown flags are task text', () => {
  assert.deepStrictEqual(C.parseCommand('/staff-of-chiefs fix --plan'), { action: 'task', flags: null, task: 'fix --plan' });
  assert.deepStrictEqual(C.parseCommand('/staff-of-chiefs --verbose x'), { action: 'task', flags: null, task: '--verbose x' });
  assert.deepStrictEqual(C.parseCommand('/staff-of-chiefs --planner x'), { action: 'task', flags: null, task: '--planner x' });
});

test('flags are sticky; new flags replace; off clears; status keeps', () => {
  const off = C.OFF;
  const cmd = s => C.parseCommand('/staff-of-chiefs ' + s);
  assert.deepStrictEqual(C.nextMode(off, cmd('')), F(false, false, false));
  assert.deepStrictEqual(C.nextMode(off, cmd('do x')), F(false, false, false));
  const pf = C.nextMode(off, cmd('--plan --fable do x'));
  assert.deepStrictEqual(pf, F(true, true, false));
  assert.deepStrictEqual(C.nextMode(pf, cmd('on')), pf, 'on keeps flags');
  assert.deepStrictEqual(C.nextMode(pf, cmd('next task')), pf, 'task keeps flags');
  assert.deepStrictEqual(C.nextMode(pf, cmd('--fable')), F(false, true, false), 'new flags replace');
  assert.deepStrictEqual(C.nextMode(pf, cmd('status')), pf);
  assert.deepStrictEqual(C.nextMode(off, cmd('status')), off);
  assert.deepStrictEqual(C.nextMode(pf, cmd('off')), off);
  assert.deepStrictEqual(C.nextMode(C.nextMode(pf, cmd('off')), cmd('on')), F(false, false, false), 'off clears flags');
  assert.deepStrictEqual(C.nextMode(off, cmd('--approve x')), F(true, false, true), '--approve implies --plan');
});

test('protocol reflects flags', () => {
  const auto = C.protocol(F(false, false, false));
  assert.match(auto, /Autopilot/);
  assert.doesNotMatch(auto, /squad-fable/);
  const pf = C.protocol(F(true, true, false));
  assert.match(pf, /\+plan \+fable/);
  assert.match(pf, /squad-fable/);
  assert.match(pf, /re-send the same ticket to squad-opus/);
  assert.match(pf, /Then build it right away/);
  assert.match(pf, /FIRST output, before any file edit or agent dispatch/);
  assert.match(C.protocol(F(true, false, true)), /STOP and wait for the user's OK/);
});

test('tiers and Opus-eq weights', () => {
  assert.strictEqual(C.tierOf('claude-fable-5-2'), 'fable');
  assert.strictEqual(C.tierOf('claude-haiku-5-5'), 'haiku');
  assert.strictEqual(C.tierOf('gpt'), 'other');
  assert.strictEqual(C.opusEq({ input: 1000, output: 1000 }, 'claude-opus-5-5'), 2000);
  assert.strictEqual(C.opusEq({ input: 1000, output: 1000 }, 'claude-sonnet-5-5'), 1000);
  assert.strictEqual(C.opusEq({ cacheRead: 100000 }, 'claude-opus-5-5'), 5000);
});
