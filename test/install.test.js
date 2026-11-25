'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, run } = require('./helpers');

const ORIGINAL = `{
    "model": "opus",
  "hooks": {
    "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo mine" } ] } ]
  },
  "statusLine": { "type": "command", "command": "echo my-status" }
}
`;

const ok = r => { assert.strictEqual(r.status, 0, r.stderr + r.stdout); return r.stdout; };

test('install -> install -> uninstall leaves settings.json byte-identical', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, ORIGINAL);
  ok(run('scripts/install.js', ['--statusline'], dir));
  const once = fs.readFileSync(file, 'utf8');
  const s = JSON.parse(once);
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'SubagentStart', 'SubagentStop'])
    assert.ok(JSON.stringify(s.hooks[ev]).includes('staff-of-chiefs/runtime/hook.js'), ev);
  assert.strictEqual(s.hooks.PreToolUse.length, 2, 'user hook kept');
  assert.strictEqual(s.hooks.PreToolUse[1].matcher, 'Agent|Task|Skill|Edit|Write|MultiEdit|NotebookEdit');
  assert.strictEqual(s.hooks.PreToolUse[1].hooks[0].timeout, 5);
  assert.match(s.statusLine.command, /statusline\.js"$/);
  assert.strictEqual(s.statusLine.refreshInterval, 2);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'staff-of-chiefs', 'config.json'), 'utf8'));
  assert.strictEqual(cfg.previousStatusLine.command, 'echo my-status');
  for (const f of ['skills/staff-of-chiefs/SKILL.md', 'agents/squad-opus.md', 'staff-of-chiefs/runtime/hook.js'])
    assert.ok(fs.existsSync(path.join(dir, f)), f);
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('settings.json.soc-backup-')), 'backup made');

  const out2 = ok(run('scripts/install.js', ['--statusline'], dir));
  assert.strictEqual(fs.readFileSync(file, 'utf8'), once, 'second install changes nothing');
  assert.match(out2, /already up to date/);

  ok(run('scripts/uninstall.js', [], dir));
  assert.strictEqual(fs.readFileSync(file, 'utf8'), ORIGINAL);
  assert.ok(!fs.existsSync(path.join(dir, 'skills', 'staff-of-chiefs')));
  assert.ok(!fs.existsSync(path.join(dir, 'agents', 'squad-opus.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'staff-of-chiefs')));
});

test('no settings.json before -> none after uninstall', () => {
  const dir = tmpDir();
  ok(run('scripts/install.js', [], dir));
  assert.ok(fs.existsSync(path.join(dir, 'settings.json')));
  ok(run('scripts/uninstall.js', [], dir));
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json')));
});

test('dry run writes nothing', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), ORIGINAL);
  const out = ok(run('scripts/install.js', ['--dry-run', '--statusline'], dir));
  assert.match(out, /dry run/);
  assert.deepStrictEqual(fs.readdirSync(dir), ['settings.json']);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), ORIGINAL);
});

test('user edits in between are kept on uninstall', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, ORIGINAL);
  ok(run('scripts/install.js', [], dir));
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  s.theme = 'dark';
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
  ok(run('scripts/uninstall.js', [], dir));
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(after.theme, 'dark');
  assert.deepStrictEqual(after.hooks, JSON.parse(ORIGINAL).hooks);
  assert.ok(!JSON.stringify(after).includes('staff-of-chiefs'));
});

test('--statusline-only and --no-agents', () => {
  const dir = tmpDir();
  ok(run('scripts/install.js', ['--statusline-only'], dir));
  const s = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  assert.ok(!s.hooks, 'no hooks');
  assert.ok(s.statusLine);
  assert.ok(fs.existsSync(path.join(dir, 'staff-of-chiefs', 'runtime', 'statusline.js')));
  ok(run('scripts/uninstall.js', [], dir));
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json')));

  const d2 = tmpDir();
  ok(run('scripts/install.js', ['--no-agents'], d2));
  assert.ok(!fs.existsSync(path.join(d2, 'agents')));
});

test('a user agent with the same name is backed up, not lost', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'agents'));
  fs.writeFileSync(path.join(dir, 'agents', 'squad-haiku.md'), 'mine');
  ok(run('scripts/install.js', [], dir));
  const b = fs.readdirSync(path.join(dir, 'agents')).find(f => f.startsWith('squad-haiku.md.soc-backup-'));
  assert.ok(b);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'agents', b), 'utf8'), 'mine');
});

test('invalid settings.json aborts without writing', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ broken');
  const r = run('scripts/install.js', [], dir);
  assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(fs.readdirSync(dir), ['settings.json']);
});
