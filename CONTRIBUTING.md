# Contributing

Thanks for helping. Bug reports, fixes and new ideas are all welcome.

## Ground rules

- **No dependencies.** The runtime and scripts use only Node ≥ 18 built-ins. Don't add npm packages.
- **Hooks must never break Claude Code.** `runtime/hook.js` always exits 0, never writes to stdout except for valid hook JSON, and finishes well inside its 5 s timeout.
- **Local only.** The dashboard binds to `127.0.0.1`, escapes everything it renders, and nothing is sent off the machine.
- **Cross-platform.** macOS, Linux, Windows and WSL. Use `path.join` and forward-slash hook commands, and test on Windows if you touch paths.
- **Installer symmetry.** Anything `scripts/install.js` adds, `scripts/uninstall.js` must remove. A clean install and uninstall must leave `settings.json` byte-identical.

## Development

```bash
git clone https://github.com/Mrwanawad/staff-of-chiefs.git
cd staff-of-chiefs
node --test                     # all tests, no install step
node scripts/install.js --dry-run
claude --plugin-dir .           # try your changes as a plugin without installing
```

To try it against a throwaway config, set `CLAUDE_CONFIG_DIR=$(mktemp -d)` before running the installer.

## Pull requests

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Keep PRs focused, and add or update tests in `test/` for any behaviour change.
3. `node --test` must pass. CI runs it on Linux, macOS and Windows with Node 18 and 22.
4. Update `README.md` and `CHANGELOG.md` (under an `Unreleased` heading) when users will notice the change.

## Art and demos

- The chef bots are plain SVG drawn by `node assets/make-art.js`. Edit the script, not the generated files.
- The demo GIFs replay real output. See [demo/README.md](demo/README.md) to rebuild them. Never hand-edit numbers in `demo/data.js` or `demo/install-data.js`.
