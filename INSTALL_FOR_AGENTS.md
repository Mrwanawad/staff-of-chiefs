# Installing staff-of-chiefs (instructions for an AI agent)

You are an AI coding agent. The user asked you to install the staff-of-chiefs Claude Code skill from this repository. Follow these steps in order. **Do not edit `settings.json` or any other Claude config file by hand.** The installer does that, makes a backup first, and keeps the user's existing hooks and status line.

1. **Check Node.** Run `node --version`. If Node is missing or older than 18, stop. Tell the user that staff-of-chiefs needs Node 18 or newer, and do nothing else.

2. **Clone into a temporary directory.**
   - macOS / Linux / WSL: `git clone --depth 1 <repo URL> "$(mktemp -d)/staff-of-chiefs"`
   - Windows PowerShell: `git clone --depth 1 <repo URL> "$env:TEMP\staff-of-chiefs-install"`

   Use the repository URL the user gave you. Remember the path; the next steps run from it.

3. **Dry run, then ask.** Run `node scripts/install.js --dry-run` from the clone and show the user its output. Ask one question: *"Also add the terminal status line (it shows the team, live agents and token burn under your prompt)? Your current status line, if you have one, keeps running first."* Wait for the answer.

4. **Install.** Run `node scripts/install.js`, adding `--statusline` if the user said yes. Show the user the summary it prints. If it exits with an error, show the error and stop. Do not try to work around it by editing files.

5. **Tell the user the next step**, in one line: *"Restart Claude Code, then run `/staff-of-chiefs status`."*

6. **Delete the temporary clone.** The installer copied everything it needs into the Claude config directory (`$CLAUDE_CONFIG_DIR`, or `~/.claude`).

To uninstall later, clone the repo again and run `node scripts/uninstall.js`.
