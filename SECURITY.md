# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub: **Security → Report a vulnerability** on this repository. Include the steps to reproduce and the impact. You will get a reply within a few days.

## Scope

staff-of-chiefs runs locally inside Claude Code. The areas that matter most:

- **Hook runtime** (`runtime/hook.js`): it parses prompts and tool calls, and must never execute their content.
- **Dashboard server** (`runtime/server.js`, `runtime/dashboard.html`): it binds to `127.0.0.1`, checks the Host header, and escapes all rendered text. A bypass of any of these is in scope.
- **Installer and uninstaller**: they edit `settings.json`, refuse symlinks, and keep backups.

Model behaviour itself (what an agent chooses to do) is out of scope. Report that to the model provider.
