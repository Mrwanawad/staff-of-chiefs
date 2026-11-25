---
name: staff-of-chiefs
description: Split a task across a team of models. The main session leads and writes the core code, squad-opus reviews risky diffs, squad-sonnet does side work (tests, configs, docs, boilerplate), squad-haiku searches and parses, and with --fable squad-fable takes hard plans, architecture and security. --plan shows a plan first and a who-did-what report at the end; --approve waits for your OK before building. Stays on until /staff-of-chiefs off. Use when the user types /staff-of-chiefs with on, off, status, flags or a task.
argument-hint: "[--plan] [--fable] [--approve] <task | on | off | status>"
---

# /staff-of-chiefs

Argument: `$ARGUMENTS`

The staff-of-chiefs hook has already parsed this command and switched the mode before you read this. **Do not toggle anything yourself** and do not edit the state file. The rules for the flags:

- With no flags, a command keeps the current flags (autopilot if the mode was off). New flags replace the current ones. `off` clears everything. `status` changes nothing.
- `--approve` implies `--plan`.

While the mode is on, the hook adds a `STAFF-OF-CHIEFS ON` protocol to your context on every prompt. Follow it. For this command it also adds a `STAFF-OF-CHIEFS STATUS:` line with the mode, flags and dashboard link.

If neither line is in your context, the hooks are not installed or not running. Tell the user in one line to run `node scripts/install.js` from the staff-of-chiefs repo (or install the plugin) and restart Claude Code, then stop.

## on (or flags only)

Reply with a one-line header with the active flags (for example `Staff of Chiefs on: +plan +fable`), then this table. Leave out the Strategist row unless `+fable` is on:

| Role | Agent | Model | Work |
|---|---|---|---|
| Strategist | `squad-fable` | Fable | hard plans, architecture, security review, bugs Opus failed to fix |
| Lead | main session | this session's model | plan, file layout, interfaces, **writes the core code**, reviews its own diff |
| Senior | `squad-opus` | Opus | independent review of risky diffs (auth, payments, data loss, concurrency, security), hard bugs |
| Builder | `squad-sonnet` | Sonnet | tests, lint/types, configs, docs, boilerplate, mechanical refactors, fixtures, scripts |
| Scout | `squad-haiku` | Haiku | search, call sites, parse logs/CSV/JSON, renames, commit messages |

Then the dashboard, `http://127.0.0.1:4317` (or the port in the status line). The hook has already started it and, in a terminal or IDE, opened it in the browser. In the Claude desktop app, open it in the built-in browser pane if you have a preview tool for that. Otherwise just print the link.

## <task>

The mode is on. Do the task under the injected protocol:

- **Autopilot** (no `+plan`): delegate silently by the rules, and say who did what (agent + model) only in the final report.
- **`+plan`**: for a non-trivial task, your first output, before any file edit or agent dispatch, is `**Plan**` followed by a table: step, owner, model, and what runs in parallel. Read files first if you need to. Then build, then report: result, who did what (agent + model per step), verification output, open items. Never skip the plan.
- **`+approve`**: show the plan, then stop and wait for the user's OK before you edit files or dispatch build agents.

## off

One line: Staff of Chiefs is off, back to a solo session.

## status

One line from the `STAFF-OF-CHIEFS STATUS:` line in your context: on or off, the flags, and the dashboard link. If that line is missing, run `node "<claude config dir>/staff-of-chiefs/runtime/config.js" status` (the config dir is `$CLAUDE_CONFIG_DIR` or `~/.claude`) and report what it prints.

## Rules

- Agents: `squad-fable`, `squad-opus`, `squad-sonnet`, `squad-haiku`. If they are not listed in this session, use `general-purpose` with the Agent `model` override (`fable` / `opus` / `sonnet` / `haiku`).
- **Fable fallback:** if a `squad-fable` dispatch fails with an access, quota, rate-limit or unknown-model error, re-send the same ticket to `squad-opus`, tell the user in one line, and continue.
- Up to 3 agents in parallel for normal multi-part work, 4 for large independent parts. The token budget per request is shown in the protocol. It is a warning, not a hard limit.
- Agents never commit, push, install dependencies or send anything outward unless the user asked. Never invent an agent's result.
- The user's own instructions (CLAUDE.md and similar) still apply. Put the relevant ones into each ticket.
