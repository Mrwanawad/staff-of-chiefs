"""Films demo/demo.gif with the demo-gif skill's director + compose pipeline.

    node demo/make-data.js <scrubbed run dir>          # a real run -> demo/data.js
    CLAUDE_CONFIG_DIR=<scrubbed run dir> SOC_PORT=4393 node runtime/server.js &   # dashboard on that run
    python demo/scene.py
    python ~/.claude/skills/demo-gif/scripts/compose.py demo/build --out demo/demo.gif --width 780 --fps 5 --colors 72 --theme graphite --no-mp4 --no-intro

Replays a real two-turn `/staff-of-chiefs --plan --fable --approve` session: the plan, the user's
approval, the team at work (the crew strip lights each chef from the status-line frames), the
dashboard and the final report. Installing is filmed separately by install-scene.py.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.expanduser("~/.claude/skills/demo-gif/scripts"))
from director import Director, run  # noqa: E402

HERE = Path(__file__).resolve().parent
REPLAY = (HERE / "replay.html").as_uri() + "?speed=8"
DASH = os.environ.get("SOC_DEMO_DASHBOARD", "http://127.0.0.1:4393/")


async def phase(p, name, timeout=180_000):
    await p.wait_for_function(f"document.body.dataset.phase === '{name}'", timeout=timeout)


async def paste(d, prompt, text, typed=12):
    """Type the first few characters, then paste the rest (how long prompts are entered)."""
    await d.type(prompt, text[:typed], cps=30)
    await prompt.evaluate("(el, v) => { el.value += v }", text[typed:])
    await d.hold(0.35)


async def scene(d: Director):
    p = d.page
    await d.goto(REPLAY + "#intro", settle=0.4)
    await d.hold(2.6)

    await d.goto(REPLAY, settle=0.4)
    prompt = p.get_by_label("Prompt")
    await d.caption("Ask for a plan first", step=1)
    command = await p.evaluate("turns[0][0].text")
    await paste(d, prompt, command, typed=17)
    await d.press("Enter")
    await d.fast(phase(p, "planned"), label="Lead reads the repo")
    await d.hold(2.2)

    await d.caption("Approve it; the kitchen gets to work", step=2)
    await d.type(prompt, await p.evaluate("turns[1][0].text"), cps=30)
    await d.press("Enter")
    await d.hold(1.2)
    await d.fast(p.wait_for_function("document.body.dataset.live === '1'", timeout=180_000), label="Lead writes the core code")
    await d.hold(0.6)
    await d.focus(p.locator("#crew"), zoom=1.2)
    await d.hold(2.0)
    await d.unfocus(dur=0.4)
    await d.focus(p.locator("#status"), zoom=1.6)
    await d.hold(1.6)
    await d.unfocus()
    await d.fast(phase(p, "finished"), label="Agents working")

    await d.caption("Every agent on a local dashboard", step=3)
    await d.goto(DASH, settle=1.0)
    await d.hold(0.3)
    await d.focus(p.locator(".panel", has=p.locator("#ops")), zoom=1.5)
    await d.hold(1.8)
    await d.unfocus(dur=0.4)

    await d.caption("Who did what, verified", step=4)
    await d.goto(REPLAY + "#final", settle=0.6)
    await d.arrow(p.locator("td", has_text="squad-opus").last, "Every step names its model", side="top")
    await d.hold(2.2)
    await d.clear_arrow()

    await d.end_caption()
    await d.goto(REPLAY + "#outro", settle=0.4)
    await d.hold(2.8)


if __name__ == "__main__":
    run(scene, out=str(HERE / "build"), title="staff-of-chiefs",
        subtitle="One command. A team of models.", url_label="replay of a real run",
        viewport=(960, 680))
