#!/usr/bin/env node
// staff-of-chiefs: open the dashboard in the system browser. Started detached by hook.js.
// Waits up to 4 s for the local server, then opens the URL with the platform's opener:
// macOS `open`, Linux `xdg-open`, Windows `cmd /c start`, WSL `wslview` then `cmd.exe /c start`.
// Failing to open a browser is never an error.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const url = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(String(url || ''))) process.exit(0);

function which(cmd) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
    }
  }
  return null;
}

function isWsl() {
  if (process.platform !== 'linux') return false;
  try { return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')); } catch { return false; }
}

function openerFor() {
  if (process.platform === 'darwin') return ['open', [url], {}];
  if (process.platform === 'win32') return ['cmd', ['/c', 'start', '""', url], { windowsVerbatimArguments: true }];
  if (isWsl()) {
    if (which('wslview')) return ['wslview', [url], {}];
    const cmd = which('cmd.exe') || '/mnt/c/Windows/System32/cmd.exe';
    // cmd.exe needs a Windows working directory, or it prints a UNC warning.
    return [cmd, ['/c', 'start', '""', url], { cwd: fs.existsSync('/mnt/c') ? '/mnt/c' : undefined }];
  }
  if (which('xdg-open')) return ['xdg-open', [url], {}];
  return null;
}

function launch() {
  const o = openerFor();
  if (!o) return process.exit(0);
  try {
    const child = spawn(o[0], o[1], { detached: true, stdio: 'ignore', windowsHide: true, ...o[2] });
    child.on('error', () => process.exit(0));
    child.unref();
  } catch {}
  setTimeout(() => process.exit(0), 300);
}

const ping = url.replace(/\/?$/, '/api/ping');
const deadline = Date.now() + 4000;
(function wait() {
  const req = http.get(ping, res => { res.resume(); launch(); });
  req.on('error', () => (Date.now() > deadline ? launch() : setTimeout(wait, 150)));
  req.setTimeout(500, () => req.destroy());
})();
