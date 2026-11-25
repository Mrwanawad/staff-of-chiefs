'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { tmpDir, env, ROOT } = require('./helpers');

const get = (port, p, host) => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port, path: p, headers: host ? { host } : {} }, res => {
    let b = ''; res.on('data', c => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
  });
  req.on('error', reject);
});

test('dashboard server: loopback only, state API, status.json', async () => {
  const dir = tmpDir();
  const port = 4300 + Math.floor(Math.random() * 90);
  const soc = path.join(dir, 'staff-of-chiefs', 'state');
  fs.mkdirSync(soc, { recursive: true });
  fs.writeFileSync(path.join(soc, 'mode.json'), JSON.stringify({ on: true, plan: true, fable: false, approve: false }));
  const child = spawn(process.execPath, [path.join(ROOT, 'runtime', 'server.js')], { env: { ...env(dir), SOC_PORT: String(port) }, stdio: 'ignore' });
  try {
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      try { ok = (await get(port, '/api/ping', `127.0.0.1:${port}`)).status === 200; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert.ok(ok, 'server came up');
    const st = await get(port, '/api/state', `127.0.0.1:${port}`);
    const s = JSON.parse(st.body);
    assert.strictEqual(s.active, true);
    assert.strictEqual(s.label, 'on +plan');
    assert.strictEqual((await get(port, '/', `localhost:${port}`)).status, 200);
    assert.strictEqual((await get(port, '/api/state', 'evil.example:80')).status, 421, 'foreign Host rejected');
    for (let i = 0; i < 30 && !fs.existsSync(path.join(soc, 'status.json')); i++) await new Promise(r => setTimeout(r, 100));
    const status = JSON.parse(fs.readFileSync(path.join(soc, 'status.json'), 'utf8'));
    assert.strictEqual(status.on, true);
    assert.strictEqual(status.budget, 150000);
  } finally { child.kill(); }
});
