#!/usr/bin/env node
// staff-of-chiefs: local dashboard server. Binds to 127.0.0.1 only. Serves dashboard.html and
// /api/state, and writes state/status.json for the terminal status line every 2 s.
// Started detached by hook.js; exits on its own once the mode is off.
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const C = require('./config');

const page = path.join(__dirname, 'dashboard.html');
const HOSTS = new Set([`127.0.0.1:${C.PORT}`, `localhost:${C.PORT}`]);

const FLAG_INFO = [
  { name: 'plan', title: 'Plan', blurb: 'plan first, then build, then a who-did-what report' },
  { name: 'fable', title: 'Fable', blurb: 'adds squad-fable for hard plans, architecture, security' },
  { name: 'approve', title: 'Approve', blurb: 'with --plan: wait for your OK before building' },
];

function snapshot(nowMs = Date.now()) {
  const events = C.readEvents();
  const mode = C.readMode();
  const modes = events.filter(e => e.type === 'mode');
  // Window: since the mode was last switched on (from off); when off, the last 12 h.
  let since = new Date(nowMs - 12 * 3600e3).toISOString();
  if (mode.on) {
    let lastOff = -1;
    modes.forEach((e, i) => { if (e.mode === 'off') lastOff = i; });
    const firstOn = modes.slice(lastOff + 1).find(e => e.mode !== 'off');
    if (firstOn) since = firstOn.ts;
  }
  const win = events.filter(e => e.ts >= since);
  const runs = C.buildRuns(win, nowMs);

  const requests = win.filter(e => e.type === 'request');
  const cur = requests[requests.length - 1] || null;
  let lead = null, burn = 0, reqRuns = [];
  if (cur) {
    lead = C.transcriptStats(cur.transcript, cur.ts);
    reqRuns = runs.filter(r => r.started >= cur.ts && r.session === cur.session);
    burn = (lead ? lead.opusEq : 0) + reqRuns.reduce((a, r) => a + (r.stats ? r.stats.opusEq : 0), 0);
  }
  const firstReq = requests[0];
  const leadWin = firstReq ? C.transcriptStats(firstReq.transcript, firstReq.ts) : null;

  const tiers = {};
  let raw = 0, eq = 0, allOpus = 0, cacheRead = 0, inputAll = 0, tools = 0, errors = 0;
  const account = (s, model, isLead) => {
    if (!s) return;
    const tier = C.tierOf(model);
    const t = tiers[tier] = tiers[tier] || { tier, runs: 0, total: 0, opusEq: 0, output: 0, tools: 0, lead: 0 };
    if (isLead) t.lead = 1; else t.runs++;
    t.total += s.total; t.opusEq += s.opusEq; t.output += s.output; t.tools += s.toolCalls;
    raw += s.total; eq += s.opusEq; tools += s.toolCalls; errors += s.errors;
    allOpus += Math.round(s.input + s.cacheWrite + s.output + C.CACHE_READ * s.cacheRead);
    cacheRead += s.cacheRead; inputAll += s.input + s.cacheWrite + s.cacheRead;
  };
  if (leadWin) account(leadWin, leadWin.model, true);
  for (const r of runs) account(r.stats, r.model, false);

  // Burn curve: cumulative Opus-eq of agents by completion time.
  let cum = 0;
  const curve = runs.filter(r => r.stats).sort((a, b) => (a.ended || a.started).localeCompare(b.ended || b.started))
    .map(r => ({ ts: r.ended || new Date(nowMs).toISOString(), v: (cum += r.stats.opusEq) }));
  if (curve.length) curve.unshift({ ts: runs.reduce((a, r) => (r.started < a ? r.started : a), curve[0].ts), v: 0 });

  // Projects served: one row per session in the last 24 h.
  const dayAgo = new Date(nowMs - 24 * 3600e3).toISOString();
  const projMap = new Map();
  for (const e of events.filter(x => x.type === 'request' && x.ts >= dayAgo)) {
    const p = projMap.get(e.session) || { first: e.ts, requests: 0 };
    projMap.set(e.session, { session: e.session, cwd: e.cwd || null, flags: e.flags || '', last: e.ts,
      prompt: e.prompt, first: p.first, requests: p.requests + 1 });
  }
  const allRuns = C.buildRuns(events.filter(e => e.ts >= dayAgo), nowMs);
  const projects = [...projMap.values()].map(p => {
    const rs = allRuns.filter(r => r.session === p.session);
    return { ...p, agents: rs.length, live: rs.filter(r => r.status === 'running').length,
      agentEq: rs.reduce((a, r) => a + (r.stats ? r.stats.opusEq : 0), 0) };
  }).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 12);

  const running = runs.filter(r => r.status === 'running').length;
  const durations = runs.filter(r => r.ended).map(r => Date.parse(r.ended) - Date.parse(r.started));
  return {
    now: new Date(nowMs).toISOString(), active: mode.on, mode, label: C.modeLabel(mode), since, port: C.PORT,
    budget: C.BUDGET, weights: C.WEIGHTS, roster: C.rosterFor(mode.on ? mode : { fable: true }),
    flags: FLAG_INFO.map(f => ({ ...f, active: !!mode[f.name] })),
    request: cur ? { ts: cur.ts, prompt: cur.prompt, session: cur.session, cwd: cur.cwd || null,
      burn, agents: reqRuns.length } : null,
    lead: lead ? { ...pick(lead), model: lead.model || null } : null,
    totals: { raw, opusEq: eq, allOpus, saved: allOpus ? 1 - eq / allOpus : 0,
      cacheHit: inputAll ? cacheRead / inputAll : 0, tools, errors, runs: runs.length, running,
      meanMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      requests: requests.length },
    tiers: Object.values(tiers),
    runs: runs.map(r => ({ ...r, file: undefined, stats: r.stats ? pick(r.stats) : null })),
    curve, projects,
    log: win.slice(-150),
  };
}

function pick(s) {
  return { turns: s.turns, input: s.input, cacheWrite: s.cacheWrite, cacheRead: s.cacheRead, output: s.output,
    total: s.total, opusEq: s.opusEq, contextPeak: s.contextPeak, cacheHit: s.cacheHit, tools: s.tools,
    toolCalls: s.toolCalls, errors: s.errors, recent: s.recent, lastText: s.lastText, first: s.first, last: s.last };
}

// Compact status for the terminal status line: header numbers, lead, and this request's agents.
function statusFor(s) {
  const req = s.request;
  const agents = s.runs.filter(r => !req || r.started >= req.ts)
    .sort((a, b) => (a.status === b.status ? b.started.localeCompare(a.started) : a.status === 'running' ? -1 : 1))
    .slice(0, 6).map(r => ({ agent: r.agent, tier: r.tier, status: r.status,
      task: String(r.desc || (r.ticket || '').split('\n')[0] || '').slice(0, 60),
      eq: r.stats ? r.stats.opusEq : 0,
      last: r.stats && r.stats.recent.length ? r.stats.recent[r.stats.recent.length - 1].tool : '' }));
  return { on: s.active, flags: C.flagLabel(s.mode), budget: C.BUDGET, burn: req ? req.burn : 0,
    live: s.totals.running, lead: s.lead ? { model: s.lead.model, eq: s.lead.opusEq } : null,
    agents, updated: s.now };
}

function writeStatus(s) {
  const tmp = C.STATUS + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(statusFor(s)));
  fs.renameSync(tmp, C.STATUS);
}

let offTicks = 0;
function tick() {
  try {
    const mode = C.readMode();
    if (!mode.on) {
      try { fs.unlinkSync(C.STATUS); } catch {}
      if (++offTicks >= 3) shutdown();
      return;
    }
    offTicks = 0;
    writeStatus(snapshot());
  } catch {}
}

function shutdown() {
  try { if (Number(fs.readFileSync(C.PID, 'utf8')) === process.pid) fs.unlinkSync(C.PID); } catch {}
  process.exit(0);
}

const server = http.createServer((req, res) => {
  // Only answer requests addressed to this machine's loopback name (blocks DNS-rebinding pages).
  if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) { res.writeHead(421); return res.end(); }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (req.url === '/api/ping') { res.writeHead(200, headers); return res.end('ok'); }
  if (req.url.startsWith('/api/state')) {
    let body;
    try { body = JSON.stringify(snapshot()); } catch (e) { body = JSON.stringify({ error: String(e && e.message || e) }); }
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(body);
  }
  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" });
    return fs.createReadStream(page).pipe(res);
  }
  res.writeHead(404, headers);
  res.end();
});

if (require.main === module) {
  server.on('error', () => process.exit(0)); // port taken: another instance already serves it
  server.listen(C.PORT, '127.0.0.1', () => {
    C.ensureState();
    fs.writeFileSync(C.PID, String(process.pid));
    setInterval(tick, 2000);
    tick();
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { snapshot, statusFor };
