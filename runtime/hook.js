#!/usr/bin/env node
// staff-of-chiefs: one hook for SessionStart, UserPromptSubmit, PreToolUse(Agent|Task|Skill|Edit|Write|...),
// SubagentStart and SubagentStop. Parses `/staff-of-chiefs [--plan] [--fable] [--approve] ...`,
// keeps the mode in state/mode.json, injects the protocol on every prompt while on, and logs
// requests and dispatches for the dashboard and status line.
// A hook must never break the session: it always exits 0, and every failure is swallowed.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./config');

function out(eventName, context) {
  if (!context) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: context } }));
}

function serverAlive() {
  try {
    const pid = Number(fs.readFileSync(C.PID, 'utf8'));
    if (!pid) return 0;
    process.kill(pid, 0);
    return pid;
  } catch { return 0; }
}

function startServer() {
  if (process.env.SOC_NO_SERVER === '1' || serverAlive()) return;
  try {
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')],
      { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

function stopServer() {
  const pid = serverAlive();
  if (pid) { try { process.kill(pid); } catch {} }
  try { fs.unlinkSync(C.PID); } catch {}
  try { fs.unlinkSync(C.STATUS); } catch {}
}

// Open the dashboard in the system browser when the mode switches on. The opener runs detached,
// waits for the server, and never blocks the hook. The desktop app opens it in its own browser
// pane from the skill instead. SOC_NO_BROWSER=1 disables it.
function openDashboard() {
  if (process.env.SOC_NO_BROWSER === '1' || process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop') return;
  try {
    const child = spawn(process.execPath, [path.join(__dirname, 'open.js'), C.URL],
      { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

// Opus-eq spent on the previous request in this session (lead + its agents), for the budget note.
function lastRequestBurn(session) {
  const events = C.readEvents();
  const reqs = events.filter(e => e.type === 'request' && e.session === session);
  if (!reqs.length) return 0;
  const last = reqs[reqs.length - 1];
  const lead = C.transcriptStats(last.transcript, last.ts);
  const runs = C.buildRuns(events.filter(e => e.ts >= last.ts && e.session === session));
  return (lead ? lead.opusEq : 0) + runs.reduce((a, r) => a + (r.stats ? r.stats.opusEq : 0), 0);
}

function logRequest(data, session, prompt, mode) {
  const text = String(prompt).slice(0, 300);
  // The same task can arrive twice (typed command, then a Skill call): log it once.
  const dup = C.readEvents(50).some(e => e.type === 'request' && e.session === session && e.prompt === text &&
    Date.now() - Date.parse(e.ts) < 60e3);
  if (dup) return;
  C.logEvent({ type: 'request', session, transcript: data.transcript_path || null, cwd: data.cwd || null,
    prompt: text, flags: C.flagLabel(mode) });
}

// Apply a parsed /staff-of-chiefs command. Returns the context to inject.
function applyCommand(cmd, data, session) {
  const cur = C.readMode();
  if (cmd.action === 'status') return C.statusLine(cur) + (cur.on ? '\n' + C.protocol(cur) : '');
  const next = C.nextMode(cur, cmd);
  C.writeMode(next);
  if (cmd.action === 'off') {
    stopServer();
    C.logEvent({ type: 'mode', mode: 'off', session });
    return C.OFF_NOTE;
  }
  C.logEvent({ type: 'mode', mode: C.modeLabel(next), session });
  startServer();
  if (!cur.on) openDashboard();
  if (cmd.action === 'task') logRequest(data, session, cmd.task, next);
  return C.statusLine(next) + '\n' + C.protocol(next);
}

// --plan gate. It never deadlocks:
// - --plan: once per request, the first file edit or build dispatch made before a visible plan
//   (`**Plan**` in the lead's reply) is denied with a nudge to show the plan. Later calls pass.
// - --approve: a request is either a planning stage or a build stage. A planning stage (a new task)
//   allows no edits or build dispatches: the lead shows the plan and ends its turn. The user's next
//   message is the approval, and that request is a build stage. The request after a build stage is
//   a new task again.
// Reading files and scouting (squad-haiku, Explore) are always allowed.
const SCOUTS = new Set(['squad-haiku', 'Explore']);
const GATED = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Agent', 'Task']);
const PLAN_RE = /\*\*Plan\*\*|^#{1,4}\s*Plan\b/m;

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse',
    permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

function readTail(file, bytes = 1024 * 1024) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString('utf8');
    return start ? text.slice(text.indexOf('\n') + 1) : text;
  } finally { fs.closeSync(fd); }
}

function planTimes(file) {
  const out = [];
  try {
    for (const line of readTail(file).split('\n')) {
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      const content = e && e.message && e.message.content;
      if (e.type === 'assistant' && !e.isSidechain && e.timestamp && Array.isArray(content) &&
          content.some(c => c && c.type === 'text' && PLAN_RE.test(c.text || ''))) out.push(e.timestamp);
    }
  } catch {}
  return out;
}

function planGate(mode, data, session) {
  if (!mode.plan || !GATED.has(data.tool_name)) return null;
  const ti = data.tool_input || {};
  if (['Agent', 'Task'].includes(data.tool_name) && SCOUTS.has(C.agentName(ti.subagent_type))) return null;
  const events = C.readEvents(600).filter(e => e.session === session);
  const reqs = events.filter(e => e.type === 'request');
  const cur = reqs[reqs.length - 1];
  if (!cur) return null; // nothing to check against: never block blindly
  const gates = events.filter(e => e.type === 'gate');
  const plans = planTimes(data.transcript_path || cur.transcript);
  const showedPlan = (from, to) => plans.some(t => t >= from && (!to || t < to));

  if (mode.approve) {
    // Walk the requests since --approve went on: planning and build stages alternate.
    const on = events.filter(e => e.type === 'mode' && /approve/.test(e.mode)).pop();
    const since = reqs.filter(r => !on || r.ts >= on.ts);
    let planning = true;
    for (let i = 0; i < since.length - 1; i++) planning = !planning;
    if (!planning) return null;
    return 'staff-of-chiefs --approve: this is the planning step. Show the plan as text (**Plan** and a table: step, owner, model, what runs in parallel), then end your turn and wait for the user to approve it. Do not edit files or dispatch build agents yet.';
  }
  if (showedPlan(cur.ts) || gates.some(g => g.req === cur.ts)) return null;
  C.logEvent({ type: 'gate', session, req: cur.ts });
  return 'staff-of-chiefs --plan (one-time reminder): before the first edit, the user must see the plan. Write it as a normal reply message, not a progress note between tool calls (those may be hidden): a line **Plan** and a table of steps (owner, model, what runs in parallel). If you already wrote it as a progress note, repeat it as a normal message. Then retry this tool call; it will not be blocked again.';
}

function handle(data) {
  if (!data || typeof data !== 'object') return;
  const ev = data.hook_event_name;
  const session = String(data.session_id || '').slice(0, 8);

  if (ev === 'UserPromptSubmit') {
    const raw = String(data.prompt || '').trim();
    const cmd = C.parseCommand(raw);
    if (cmd) return out(ev, applyCommand(cmd, data, session));
    const mode = C.readMode();
    if (!mode.on) return;
    // Background-agent completions arrive as prompts. They are part of the current request,
    // not a new one, and the protocol is already in context.
    if (/^<task-notification>/.test(raw)) return;
    let note = '';
    try {
      const burn = lastRequestBurn(session);
      if (burn > C.BUDGET) note = `\nBUDGET NOTE: the previous request used ~${Math.round(burn / 1000)}k Opus-eq tokens (budget ${Math.round(C.BUDGET / 1000)}k). Delegate less and keep tickets tighter.`;
    } catch {}
    logRequest(data, session, raw, mode);
    startServer();
    return out(ev, C.protocol(mode) + note);
  }

  if (ev === 'PreToolUse' && data.tool_name === 'Skill') {
    const ti = data.tool_input || {};
    if (!C.SKILL_NAME.test(String(ti.skill || ''))) return;
    return out(ev, applyCommand(C.parseArgs(ti.args), data, session));
  }

  const mode = C.readMode();
  if (!mode.on) return;

  if (ev === 'SessionStart') {
    startServer();
    return out(ev, C.protocol(mode));
  }
  if (ev === 'PreToolUse') { // Agent | Task | Edit | Write | MultiEdit | NotebookEdit
    const ti = data.tool_input || {};
    const blocked = planGate(mode, data, session);
    if (blocked) return deny(blocked);
    if (!['Agent', 'Task'].includes(data.tool_name)) return;
    const agent = C.agentName(ti.subagent_type);
    C.logEvent({ type: 'dispatch', agent, model: String(ti.model || C.modelFor(agent)), session,
      desc: String(ti.description || '').slice(0, 100), ticket: String(ti.prompt || '').slice(0, 1500),
      background: !!ti.run_in_background });
    return;
  }
  if (ev === 'SubagentStart') {
    C.logEvent({ type: 'start', id: data.agent_id, agent: C.agentName(data.agent_type), session,
      parent: data.transcript_path || null });
    return;
  }
  if (ev === 'SubagentStop') {
    C.logEvent({ type: 'stop', id: data.agent_id, agent: C.agentName(data.agent_type), session,
      file: data.agent_transcript_path || null });
  }
}

// Hard stop well inside the 5 s hook timeout, whatever happens.
setTimeout(() => process.exit(0), 4000).unref();
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input += c; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  try { handle(JSON.parse(input.replace(/^﻿/, '') || '{}')); } catch {}
  process.exit(0);
});
