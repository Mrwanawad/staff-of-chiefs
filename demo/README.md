# Demo

Two GIFs, both filmed with the demo-gif skill's director and compose pipeline. Neither is mocked up.

The GIFs are not on `main`. They are published on the orphan [`media`](https://github.com/Mrwanawad/staff-of-chiefs/tree/media) branch, which the README links to, so cloning `main` and installing the plugin stay small. After rebuilding one, commit it to `media`, not to `main`.

## `install.gif` (`install-scene.py`)

- **Path A:** an agent follows `INSTALL_FOR_AGENTS.md`. Every command output is the real output of `scripts/install.js`, the status check and `scripts/uninstall.js`, run against a throwaway config by `make-install-data.js` (no model calls). The agent's two short lines are the ones that file tells it to say.
- **Paths B and C and uninstall** are shown as command cards.

Rebuild: `node demo/make-install-data.js && python demo/install-scene.py`, then compose `demo/build-install` with `--no-intro`.

## `demo.gif` (`scene.py`)

It replays a real two-turn session in a small `node:http` toy API, with Opus 5.5 as the lead:

1. `/staff-of-chiefs --plan --fable --approve add API-key auth to the orders routes, with tests`: the lead reads the repo, shows a five-step plan and waits.
2. `Approved, go ahead.`: the lead writes the auth module, `squad-sonnet` writes 11 tests while `squad-opus` runs a live security review, and the run ends with a who-did-what report and 13/13 tests passing.

The lead's messages, the status-line frames, the dashboard and every token number come from that run. The **crew strip** under the terminal lights up each chef from the same status-line frames. A chef is lit and animated only while that agent is running, and the lead chef is lit while the lead works. The lead chose not to use Fable for a task this small, so the fable chef stays idle ("not needed").

`make-data.js` rebuilds the run second by second from the transcripts' own timestamps, and renders each status-line frame with `runtime/statusline.js`. Paths in the recorded run were rewritten to `/home/dev/toy-api` before rendering.

## Regenerate

1. Record a run against a throwaway config (copy only your credentials into it), with the plugin loaded from this repo:
   ```bash
   export CLAUDE_CONFIG_DIR=$(mktemp -d) SOC_NO_BROWSER=1
   cd <toy repo>
   claude -p "/staff-of-chiefs --plan --fable --approve <task>" --plugin-dir <this repo> --model opus --permission-mode bypassPermissions
   claude -c -p "Approved, go ahead." --plugin-dir <this repo> --model opus --permission-mode bypassPermissions
   ```
2. Copy it into a run dir (`staff-of-chiefs/state/{mode.json,events.jsonl}`, `transcripts/session.jsonl`, `transcripts/session/subagents/*`), point the event log's transcript paths at the copies, and scrub personal paths.
3. `node demo/make-data.js <run dir>` writes `demo/data.js`.
4. `CLAUDE_CONFIG_DIR=<run dir> SOC_PORT=4393 node runtime/server.js &` serves the dashboard on that run.
5. `python demo/scene.py`, then `compose.py demo/build --out demo/demo.gif --width 780 --fps 5 --colors 72 --theme graphite --no-mp4 --no-intro`.
6. The stills (`python demo/stills.py`): `demo/statusline.png` is the replay's `#status` at a frame with 2 agents live, and `demo/dashboard.png` is the dashboard at 1440x860 with reduced motion.
