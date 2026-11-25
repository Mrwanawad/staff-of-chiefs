'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const made = [];
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'soc-test-')); made.push(d); return d; };
process.on('exit', () => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } });
const env = dir => ({ ...process.env, CLAUDE_CONFIG_DIR: dir, SOC_NO_SERVER: '1', SOC_NO_BROWSER: '1', SOC_PORT: '4399' });
const run = (rel, args, dir, input) => spawnSync(process.execPath, [path.join(ROOT, rel), ...args],
  { env: env(dir), input: input == null ? '' : input, encoding: 'utf8', timeout: 15000 });

module.exports = { ROOT, tmpDir, env, run };
