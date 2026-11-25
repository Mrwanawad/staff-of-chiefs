// staff-of-chiefs: shared config. Paths, flags, state file, roster, injected protocol,
// event log and transcript token accounting (Opus-eq).
// Used by hook.js, server.js, statusline.js and the install scripts. Node >= 18, no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SOC_DIR = path.join(CLAUDE_DIR, 'staff-of-chiefs');
const STATE_DIR = path.join(SOC_DIR, 'state');
const MODE_FILE = path.join(STATE_DIR, 'mode.json');
const EVENTS = path.join(STATE_DIR, 'events.jsonl');
const STATUS = path.join(STATE_DIR, 'status.json');
const PID = path.join(STATE_DIR, 'server.pid');
const USER_CONFIG = path.join(SOC_DIR, 'config.json');
const NAME = 'staff-of-chiefs';

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const PORT = num(process.env.SOC_PORT, 4317);
const BUDGET = num(process.env.SOC_BUDGET, 150000); // Opus-eq tokens per user request (a warning, not enforced)
const URL = `http://127.0.0.1:${PORT}`;

// ---------- user config (<CLAUDE_DIR>/staff-of-chiefs/config.json) ----------
function readUserConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(USER_CONFIG, 'utf8'));
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  } catch { return {}; }
}

// Relative cost weight per model tier, Opus = 1. From Anthropic list prices (claude-api skill
// model table, cached 2026-11-03; input/output per MTok): Fable 5.2 $8/$40, Opus 5.5 $4/$20,
// Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50. Input and output have the same ratio in each tier, so
// one weight per tier is exact. Override with { "weights": { ... } } in config.json.
const DEFAULT_WEIGHTS = { fable: 2, opus: 1, sonnet: 0.5, haiku: 0.025, other: 1 };
// Cache reads cost $0.20/MTok on Opus 5.5 = 5% of fresh input. Override with "cacheReadFactor".
const DEFAULT_CACHE_READ = 0.05;

const userCfg = readUserConfig();
const WEIGHTS = { ...DEFAULT_WEIGHTS };
for (const [k, v] of Object.entries(userCfg.weights || {})) {
  if (k in WEIGHTS && Number.isFinite(Number(v)) && Number(v) >= 0) WEIGHTS[k] = Number(v);
}
const CACHE_READ = Number.isFinite(Number(userCfg.cacheReadFactor)) ? Number(userCfg.cacheReadFactor) : DEFAULT_CACHE_READ;

const tierOf = model => {
  const m = String(model || '').toLowerCase();
  for (const t of ['fable', 'opus', 'sonnet', 'haiku']) if (m.includes(t)) return t;
  return 'other';
};
// Opus-eq: fresh input, cache writes and output count fully, cache reads at CACHE_READ, then the tier weight.
const opusEq = (u, model) => Math.round(WEIGHTS[tierOf(model)] *
  ((u.input || 0) + (u.cacheWrite || 0) + (u.output || 0) + CACHE_READ * (u.cacheRead || 0)));

// ---------- roster ----------
const ROSTER = [
  { tier: 'fable', agent: 'squad-fable', model: 'fable', role: 'Strategist', fableOnly: true,
    work: 'hard plans · architecture · security review · bugs Opus failed' },
  { tier: 'lead', agent: 'main session', model: 'session model', role: 'Lead',
    work: 'plan · file layout · interfaces · writes core code · self-review' },
  { tier: 'opus', agent: 'squad-opus', model: 'opus', role: 'Senior',
    work: 'review of risky diffs · hard bugs · parallel core modules' },
  { tier: 'sonnet', agent: 'squad-sonnet', model: 'sonnet', role: 'Builder',
    work: 'tests · lint/types · configs · docs · boilerplate · mechanical refactors · fixtures · scripts' },
  { tier: 'haiku', agent: 'squad-haiku', model: 'haiku', role: 'Scout',
    work: 'search · call sites · parse logs/CSV/JSON · renames · commit messages' },
];
// Plugin agents arrive namespaced (`staff-of-chiefs:squad-opus`); compare on the bare name.
const agentName = a => String(a || 'general-purpose').replace(/^staff-of-chiefs:/i, '');
const rosterFor = flags => ROSTER.filter(r => !r.fableOnly || (flags && flags.fable));
const modelFor = agentType => {
  const r = ROSTER.find(x => x.agent === agentType);
  return r && r.tier !== 'lead' ? r.model : 'inherit';
};

// ---------- flags and the state file ----------
const OFF = Object.freeze({ on: false, plan: false, fable: false, approve: false });
const FLAG_NAMES = ['plan', 'fable', 'approve'];

function normalize(m) {
  const s = { on: !!(m && m.on), plan: !!(m && m.plan), fable: !!(m && m.fable), approve: !!(m && m.approve) };
  if (s.approve) s.plan = true; // an approval gate only makes sense with a visible plan
  if (!s.on) return { ...OFF };
  return s;
}

function isSymlink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } }

function ensureState() {
  for (const d of [SOC_DIR, STATE_DIR]) {
    if (isSymlink(d)) throw new Error(`refusing to use symlinked directory ${d}`);
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Read mode.json. Missing, unreadable, symlinked or malformed -> off.
function readMode() {
  try {
    const st = fs.lstatSync(MODE_FILE);
    if (!st.isFile() || st.isSymbolicLink()) return { ...OFF };
    return normalize(JSON.parse(fs.readFileSync(MODE_FILE, 'utf8')));
  } catch { return { ...OFF }; }
}

// Safe write: refuse symlinks, write a temp file in the same dir, then rename over the target.
function writeMode(m) {
  ensureState();
  if (isSymlink(MODE_FILE)) throw new Error(`refusing to write through symlink ${MODE_FILE}`);
  const s = normalize(m);
  const tmp = path.join(STATE_DIR, `.mode.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(s) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(tmp, MODE_FILE); } catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
  return s;
}

const flagLabel = m => (m && m.on ? FLAG_NAMES.filter(f => m[f]).map(f => '+' + f).join(' ') : '');
const modeLabel = m => (m && m.on ? ['on', flagLabel(m)].filter(Boolean).join(' ') : 'off');

// ---------- command parsing ----------
// `/staff-of-chiefs [--plan] [--fable] [--approve] <task | on | off | status>`, also the
// plugin-namespaced `/staff-of-chiefs:staff-of-chiefs ...`. Returns null for any other prompt.
const CMD = /^\/(?:staff-of-chiefs:)?staff-of-chiefs(?=\s|$)([\s\S]*)$/i;
const SKILL_NAME = /^(?:staff-of-chiefs:)?staff-of-chiefs$/i;

function parseArgs(argText) {
  let rest = String(argText || '').trim();
  const flags = {};
  let any = false;
  for (;;) {
    const m = /^--(plan|fable|approve)(?=\s|$)\s*/i.exec(rest);
    if (!m) break;
    flags[m[1].toLowerCase()] = true;
    any = true;
    rest = rest.slice(m[0].length);
  }
  const word = rest.toLowerCase();
  let action = 'task';
  if (!rest || word === 'on') action = 'on';
  else if (word === 'off') action = 'off';
  else if (word === 'status') action = 'status';
  return { action, flags: any ? flags : null, task: action === 'task' ? rest : '' };
}

function parseCommand(prompt) {
  const m = CMD.exec(String(prompt || '').trim());
  return m ? parseArgs(m[1]) : null;
}

// Apply a parsed command to the current mode. Flags are sticky: a command without flags keeps the
// current ones, a command with flags replaces them, `off` clears everything, `status` changes nothing.
function nextMode(cur, cmd) {
  if (cmd.action === 'status') return normalize(cur);
  if (cmd.action === 'off') return { ...OFF };
  const base = cmd.flags ? { plan: !!cmd.flags.plan, fable: !!cmd.flags.fable, approve: !!cmd.flags.approve }
    : (cur && cur.on ? cur : OFF);
  return normalize({ ...base, on: true });
}

// ---------- protocol injected every prompt while the mode is on ----------
function protocol(m) {
  const lines = [
    `STAFF-OF-CHIEFS ON${flagLabel(m) ? ' (' + flagLabel(m) + ')' : ''}. Quality first, then speed, then tokens.`,
    '- You (the main session) are the Lead: you plan, decide the file layout and interfaces, WRITE THE CORE CODE and review your own diff before done.',
  ];
  if (m.fable) lines.push(
    '- squad-fable (Fable): only for hard multi-step plans, architecture, security review/threat models, or a bug you failed to fix. Give it a short summary of what you already know plus exact files; never "read the repo". Revise what it returns. If a squad-fable dispatch fails with an access, quota, rate-limit or unknown-model error, re-send the same ticket to squad-opus and tell the user in one line.');
  lines.push(
    '- squad-opus (Opus): independent review of risky code only (auth, payments, data loss, concurrency, security), given the diff; hard bugs; a large independent core module when you build parts in parallel.',
    '- squad-sonnet (Sonnet): side work around code you designed: tests for finished code, running tests and fixing simple failures, lint/format/types, configs (Dockerfile, CI, .env.example, requirements), README/docs, boilerplate copying an existing pattern, mechanical refactors, fixtures, simple scripts.',
    '- squad-haiku (Haiku): repo search/mapping, call sites, parsing logs/CSV/JSON/config, renames, commit messages.',
    '- If the squad-* agents are not available in this session, use general-purpose with the Agent `model` override (fable / opus / sonnet / haiku).',
    'Rules:',
    '- Delegate only when it pays: the job reads a lot but returns little, or it is side work from the list above. Never delegate planning, design, small edits, or running one test command (run it yourself, output piped through tail).',
    '- Every ticket: exact files (and line ranges if known), the change or question, how to verify, a reply cap, and "stop and report if stuck or a design decision is needed".',
    '- Parallel: up to 3 agents at once for normal multi-part work, 4 when the parts are large and independent. Independent tickets go in one message.',
    '- Escalate: an agent fails twice or hits a design decision -> one tier up (haiku -> sonnet -> opus -> you).',
    `- Budget: ${BUDGET.toLocaleString('en-US')} Opus-eq tokens per request. If the dashboard or status line shows it exceeded, tell the user in one line.`,
    '- Never invent an agent result. Agents never commit, push, install dependencies or send anything outward unless the user asked.',
  );
  if (m.plan) {
    lines.push('Plan mode: for any non-trivial request, your FIRST output, before any file edit or agent dispatch, is a short plan: a line `**Plan**` and then a table of steps with owner and model per step, and what runs in parallel. Reading files to write the plan is fine. Never skip the plan, even in a non-interactive session.');
    lines.push(m.approve
      ? 'Approval gate: after showing the plan, STOP and wait for the user\'s OK. Do not edit files or dispatch build agents until the user approves (read-only scouting for the plan is fine). When the user approves a plan you showed, build it.'
      : 'Then build it right away.');
    lines.push('Finish with a report: result, who did what (agent + model per step), verification output, open items.');
  } else {
    lines.push('Autopilot: apply these rules silently; mention delegation only in the final report (agent + model per step).');
  }
  lines.push(`Skip all delegation for trivial one-step requests. Dashboard: ${URL}`);
  return lines.join('\n');
}
const OFF_NOTE = 'STAFF-OF-CHIEFS OFF. Work solo; do not delegate to squad-* agents unless the user asks.';

function statusLine(m) {
  return `STAFF-OF-CHIEFS STATUS: ${modeLabel(m)}. Dashboard: ${URL}. State file: ${MODE_FILE}`;
}

// ---------- event log ----------
const MAX_LOG = 5 * 1024 * 1024;

function logEvent(ev) {
  ensureState();
  if (isSymlink(EVENTS)) return;
  try {
    if (fs.statSync(EVENTS).size > MAX_LOG) { // keep the newest half
      const raw = fs.readFileSync(EVENTS, 'utf8');
      const keep = raw.slice(raw.length / 2);
      fs.writeFileSync(EVENTS, keep.slice(keep.indexOf('\n') + 1));
    }
  } catch {}
  fs.appendFileSync(EVENTS, JSON.stringify({ ts: new Date().toISOString(), ...ev }) + '\n', { mode: 0o600 });
}

function readEvents(limit = 3000) {
  try {
    const lines = fs.readFileSync(EVENTS, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// ---------- transcript accounting ----------
// Subagent transcripts live next to the parent: <project>/<session>/subagents/agent-<id>.jsonl
const subagentPath = (parentTranscript, id) => parentTranscript && id
  ? path.join(String(parentTranscript).replace(/\.jsonl$/, ''), 'subagents', `agent-${id}.jsonl`) : null;

const cache = new Map();

function brief(input) {
  const i = input || {};
  const v = i.file_path || i.path || i.pattern || i.command || i.query || i.url || i.description || i.prompt || '';
  return String(v).replace(/\s+/g, ' ').slice(0, 140);
}

// Parse a transcript (optionally only entries at/after sinceIso). Cached by file size.
function transcriptStats(file, sinceIso) {
  if (!file) return null;
  let size;
  try { size = fs.statSync(file).size; } catch { return null; }
  const key = file + '|' + (sinceIso || '');
  const hit = cache.get(key);
  if (hit && hit.size === size) return hit.stats;
  const s = { model: null, turns: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, contextPeak: 0,
    tools: {}, toolCalls: 0, recent: [], lastText: '', prompt: '', first: null, last: null, errors: 0, byModel: {} };
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const seen = new Set();
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object') continue;
    if (sinceIso && e.timestamp && e.timestamp < sinceIso) continue;
    if (e.timestamp) { s.first = s.first || e.timestamp; s.last = e.timestamp; }
    const msg = e.message || {};
    if (e.type === 'user' && !s.prompt && typeof msg.content === 'string') s.prompt = msg.content.slice(0, 1200);
    if (e.type === 'user' && Array.isArray(msg.content)) {
      for (const c of msg.content) if (c && c.type === 'tool_result' && c.is_error) s.errors++;
    }
    if (e.type !== 'assistant') continue;
    // One API message is split into several transcript lines that repeat the same usage: count it once.
    const fresh = !msg.id || !seen.has(msg.id);
    if (msg.id) seen.add(msg.id);
    if (msg.model && msg.model !== '<synthetic>') s.model = msg.model;
    for (const c of Array.isArray(msg.content) ? msg.content : []) {
      if (!c) continue;
      if (c.type === 'tool_use') {
        s.toolCalls++;
        s.tools[c.name] = (s.tools[c.name] || 0) + 1;
        s.recent.push({ ts: e.timestamp, tool: c.name, arg: brief(c.input) });
        if (s.recent.length > 14) s.recent.shift();
      } else if (c.type === 'text' && c.text && c.text.trim()) s.lastText = c.text.trim().slice(-900);
    }
    if (!fresh) continue;
    const u = msg.usage || {};
    s.turns++;
    const add = { input: u.input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0, output: u.output_tokens || 0 };
    s.input += add.input; s.cacheWrite += add.cacheWrite; s.cacheRead += add.cacheRead; s.output += add.output;
    s.contextPeak = Math.max(s.contextPeak, add.input + add.cacheWrite + add.cacheRead);
    const mk = msg.model || 'unknown';
    const bm = s.byModel[mk] = s.byModel[mk] || { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
    bm.input += add.input; bm.cacheWrite += add.cacheWrite; bm.cacheRead += add.cacheRead; bm.output += add.output;
  }
  s.total = s.input + s.cacheWrite + s.cacheRead + s.output;
  s.opusEq = Object.entries(s.byModel).reduce((a, [m, u]) => a + opusEq(u, m), 0);
  const inAll = s.input + s.cacheWrite + s.cacheRead;
  s.cacheHit = inAll ? s.cacheRead / inAll : 0;
  cache.set(key, { size, stats: s });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return s;
}

// Pair dispatch -> SubagentStart -> SubagentStop into runs, with live transcript stats.
function buildRuns(events, now = Date.now()) {
  const runs = new Map();
  const pending = [];
  for (const raw of events) {
    const ev = raw.agent ? { ...raw, agent: agentName(raw.agent) } : raw;
    if (ev.type === 'dispatch') {
      pending.push(ev);
      // The same ticket re-sent to another agent (the Fable fallback): the earlier run failed.
      for (const r of runs.values()) {
        if (r.status === 'running' && r.session === ev.session && r.agent !== ev.agent &&
            ((ev.ticket && r.ticket === ev.ticket) || (ev.desc && r.desc === ev.desc))) {
          r.status = 'lost'; r.ended = ev.ts;
        }
      }
    }
    else if (ev.type === 'start' && ev.id) {
      const i = pending.findIndex(p => p.agent === ev.agent && p.session === ev.session);
      const d = i >= 0 ? pending.splice(i, 1)[0] : {};
      runs.set(ev.id, { id: String(ev.id), agent: ev.agent, model: d.model || modelFor(ev.agent),
        desc: d.desc || '', ticket: d.ticket || '', background: !!d.background, session: ev.session,
        file: ev.file || subagentPath(ev.parent, ev.id), started: ev.ts, status: 'running' });
    } else if (ev.type === 'stop' && runs.has(ev.id)) {
      const r = runs.get(ev.id);
      r.status = 'done'; r.ended = ev.ts;
      if (ev.file) r.file = ev.file;
    }
  }
  for (const r of runs.values()) {
    // A run that never reported SubagentStop (it failed at the API, or the session died) is
    // "lost" once its transcript is missing for 90 s or has been idle for 15 min.
    if (r.status === 'running') {
      let mtime = null;
      try { mtime = fs.statSync(r.file).mtimeMs; } catch {}
      const age = now - Date.parse(r.started);
      if ((mtime === null && age > 90e3) || (mtime !== null && now - mtime > 15 * 60e3)) r.status = 'lost';
    }
    const s = transcriptStats(r.file);
    if (s) {
      r.stats = s;
      r.model = s.model || r.model;
      if (!r.ticket) r.ticket = s.prompt;
    }
    r.tier = tierOf(r.model);
  }
  return [...runs.values()];
}

module.exports = {
  agentName, NAME, CLAUDE_DIR, SOC_DIR, STATE_DIR, MODE_FILE, EVENTS, STATUS, PID, USER_CONFIG, PORT, BUDGET, URL,
  DEFAULT_WEIGHTS, WEIGHTS, CACHE_READ, ROSTER, OFF, SKILL_NAME,
  readUserConfig, rosterFor, modelFor, tierOf, opusEq,
  normalize, readMode, writeMode, flagLabel, modeLabel, parseArgs, parseCommand, nextMode,
  protocol, OFF_NOTE, statusLine, ensureState, logEvent, readEvents, transcriptStats, subagentPath, buildRuns,
};

// CLI: `node config.js` prints the protocol for the current mode (or the off note);
// `node config.js status` prints one status line. Used by the skill as a fallback.
if (require.main === module) {
  const m = readMode();
  const arg = String(process.argv[2] || '').toLowerCase();
  process.stdout.write((arg === 'status' ? statusLine(m) : m.on ? protocol(m) : OFF_NOTE) + '\n');
}
