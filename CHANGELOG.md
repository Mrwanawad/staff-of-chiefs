# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-25

### Added
- `/staff-of-chiefs [--plan] [--fable] [--approve] <task | on | off | status>`: one skill with sticky flags.
- Four agents with model aliases: `squad-fable`, `squad-opus`, `squad-sonnet`, `squad-haiku`.
- Hook runtime (SessionStart, UserPromptSubmit, PreToolUse, SubagentStart, SubagentStop). It always exits 0.
- The `--plan` nudge and the `--approve` gate on edit tools and build dispatches, with no deadlock possible.
- Fable → Opus fallback, and lost-agent detection (`✗` / `NO REPLY`).
- Terminal status line (live agents, last tool, Opus-eq burn against the budget). It keeps the user's existing status line.
- Local dashboard on `127.0.0.1` with chef-bot avatars per tier, a trace drawer, model mix and roster.
- Installer and uninstaller (`--dry-run`, `--statusline`, `--statusline-only`, `--no-agents`). They back up `settings.json` and restore it byte for byte.
- Plugin manifest and marketplace entry.
- Install guide for AI agents (`INSTALL_FOR_AGENTS.md`).
- Demo GIFs replayed from real output, and original chef-bot art (`assets/make-art.js`).
- CI on Linux, macOS and Windows with Node 18 and 22.

[0.1.0]: https://github.com/Mrwanawad/staff-of-chiefs/releases/tag/v0.1.0
