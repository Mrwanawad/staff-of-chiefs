'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, run } = require('./helpers');

const hook = (dir, input) => run('runtime/hook.js', [], dir, input);
const modeOf = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'staff-of-chiefs', 'state', 'mode.json'), 'utf8')); } catch { return null; } };
const ctx = r => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '');

test('exits 0 on garbage stdin', () => {
  const dir = tmpDir();
  for (const input of ['', 'not json', '{', '[]', 'null', '42', '﻿{}', '{"hook_event_name":5}', Buffer.from([0xff, 0xfe, 0x00]).toString('latin1')]) {
    const r = hook(dir, input);
    assert.strictEqual(r.status, 0, JSON.stringify(input));
  }
});

test('prompt flow: on with flags, sticky task, status, off', () => {
  const dir = tmpDir();
  const ups = prompt => hook(dir, JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'abcdef123', prompt, cwd: dir }));

  assert.strictEqual(ups('hello').stdout, '', 'off: no output');
  let r = ups('/staff-of-chiefs --plan --fable add a /health endpoint');
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(modeOf(dir), { on: true, plan: true, fable: true, approve: false });
  assert.match(ctx(r), /STAFF-OF-CHIEFS ON \(\+plan \+fable\)/);

  assert.strictEqual(ups('<task-notification>\n<task-id>x</task-id>').stdout, '', 'agent notifications are not requests');
  r = ups('now also add metrics');
  assert.match(ctx(r), /\+plan \+fable/, 'protocol injected on normal prompts');

  r = ups('/staff-of-chiefs:staff-of-chiefs status');
  assert.match(ctx(r), /STATUS: on \+plan \+fable/);
  assert.deepStrictEqual(modeOf(dir), { on: true, plan: true, fable: true, approve: false });

  r = ups('/staff-of-chiefs off');
  assert.match(ctx(r), /OFF/);
  assert.deepStrictEqual(modeOf(dir), { on: false, plan: false, fable: false, approve: false });
  assert.strictEqual(ups('hello again').stdout, '');

  const events = fs.readFileSync(path.join(dir, 'staff-of-chiefs', 'state', 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(events.filter(e => e.type === 'request').map(e => e.prompt), ['add a /health endpoint', 'now also add metrics']);
});

test('Skill tool call switches the mode; dispatches are logged', () => {
  const dir = tmpDir();
  let r = hook(dir, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Skill', session_id: 's1',
    tool_input: { skill: 'staff-of-chiefs:staff-of-chiefs', args: '--approve build it' } }));
  assert.match(ctx(r), /STOP and wait/);
  assert.deepStrictEqual(modeOf(dir), { on: true, plan: true, fable: false, approve: true });
  hook(dir, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Agent', session_id: 's1',
    tool_input: { subagent_type: 'squad-haiku', description: 'find routes', prompt: '<script>x</script>' } }));
  hook(dir, JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a1', agent_type: 'staff-of-chiefs:squad-haiku' }));
  hook(dir, JSON.stringify({ hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'a1', agent_type: 'squad-haiku' }));
  const types = fs.readFileSync(path.join(dir, 'staff-of-chiefs', 'state', 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l).type);
  assert.deepStrictEqual(types, ['mode', 'request', 'dispatch', 'start', 'stop']);
  const start = fs.readFileSync(path.join(dir, 'staff-of-chiefs', 'state', 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).find(e => e.type === 'start');
  assert.strictEqual(start.agent, 'squad-haiku', 'plugin namespace stripped');
  r = hook(dir, JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's2' }));
  assert.match(ctx(r), /STAFF-OF-CHIEFS ON/);
});

test('other skills are ignored', () => {
  const dir = tmpDir();
  const r = hook(dir, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'crew', args: 'on' } }));
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(modeOf(dir), null);
});

test('--plan gate nudges once per request and never deadlocks', () => {
  const dir = tmpDir();
  const tr = path.join(dir, 'session.jsonl');
  fs.writeFileSync(tr, '');
  const base = { session_id: 'gate1234', transcript_path: tr, cwd: dir };
  const send = o => hook(dir, JSON.stringify({ ...base, ...o }));
  const decision = r => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow');
  const write = () => send({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'x.js' } });
  const say = text => fs.appendFileSync(tr, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(),
    message: { content: [{ type: 'text', text }] } }) + '\n');
  const tick = () => { const t = Date.now() + 5; while (Date.now() < t); };

  send({ hook_event_name: 'UserPromptSubmit', prompt: '/staff-of-chiefs --plan add auth' });
  tick();
  assert.strictEqual(decision(send({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'staff-of-chiefs:squad-haiku' } })), 'allow', 'scouting allowed');
  const first = write();
  assert.strictEqual(decision(first), 'deny', 'no plan yet: nudge');
  assert.match(first.stdout, /one-time reminder/);
  assert.strictEqual(decision(write()), 'allow', 'only one nudge per request');

  tick(); send({ hook_event_name: 'UserPromptSubmit', prompt: 'next task' }); tick();
  say('**Plan**\n| 1 | x | Lead |');
  assert.strictEqual(decision(write()), 'allow', 'plan shown: no nudge');
});

test('--approve: planning and build stages alternate', () => {
  const dir = tmpDir();
  const base = { session_id: 'appr1234', transcript_path: path.join(dir, 'none.jsonl'), cwd: dir };
  const send = o => hook(dir, JSON.stringify({ ...base, ...o }));
  const decision = r => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow');
  const write = () => send({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: {} });
  const tick = () => { const t = Date.now() + 5; while (Date.now() < t); };

  send({ hook_event_name: 'UserPromptSubmit', prompt: '/staff-of-chiefs --approve migrate users to UUIDs' }); tick();
  assert.strictEqual(decision(write()), 'deny', 'planning stage');
  assert.match(write().stdout, /wait for the user to approve/);
  assert.strictEqual(decision(write()), 'deny', 'still planning: no fail-open on approve');
  send({ hook_event_name: 'UserPromptSubmit', prompt: 'looks good, go' }); tick();
  assert.strictEqual(decision(write()), 'allow', 'approved: build stage');
  assert.strictEqual(decision(send({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'squad-sonnet' } })), 'allow');
  send({ hook_event_name: 'UserPromptSubmit', prompt: 'now add an index too' }); tick();
  assert.strictEqual(decision(write()), 'deny', 'a new task is planned again');
  send({ hook_event_name: 'UserPromptSubmit', prompt: '/staff-of-chiefs off' });
  assert.strictEqual(decision(write()), 'allow', 'off: no gate');
});

test('--plan gate is off without --plan', () => {
  const dir = tmpDir();
  hook(dir, JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: '/staff-of-chiefs --fable x' }));
  const r = hook(dir, JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Write', transcript_path: path.join(dir, 'none.jsonl'), tool_input: {} }));
  assert.strictEqual(r.stdout, '');
});
