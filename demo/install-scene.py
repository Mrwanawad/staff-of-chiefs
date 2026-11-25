"""Films demo/install.gif: the three ways to install staff-of-chiefs, with the installer's real output.

    node demo/make-install-data.js        # real installer / status / uninstall output -> demo/install-data.js
    python demo/install-scene.py
    python ~/.claude/skills/demo-gif/scripts/compose.py demo/build-install --out demo/install.gif --width 780 --fps 5 --colors 72 --theme graphite --no-mp4 --no-intro

No model calls: path A shows an agent following INSTALL_FOR_AGENTS.md, and every command output in it
comes from install-data.js.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.expanduser("~/.claude/skills/demo-gif/scripts"))
from director import Director, run  # noqa: E402

HERE = Path(__file__).resolve().parent
PAGE = (HERE / "install.html").as_uri()
LINE = "Install the Claude Code skill from https://github.com/Mrwanawad/staff-of-chiefs. Follow INSTALL_FOR_AGENTS.md."


async def phase(p, name, timeout=30_000):
    await p.wait_for_function(f"document.body.dataset.phase === '{name}'", timeout=timeout)


async def scene(d: Director):
    p = d.page
    await d.goto(PAGE + "#intro", settle=0.4)
    await d.hold(2.6)

    await d.goto(PAGE, settle=0.4)
    prompt = p.get_by_label("Prompt")
    await d.caption("A · Paste one line into Claude Code", step=1)
    await d.type(prompt, LINE[:14], cps=28)
    await prompt.evaluate("(el, v) => { el.value += v }", LINE[14:])
    await d.hold(0.5)
    await d.press("Enter")
    await phase(p, "asked")
    await d.hold(1.4)
    await d.caption("It shows a dry run and asks first", step=2)
    await prompt.press_sequentially("yes", delay=90)
    await d.hold(0.3)
    await d.press("Enter")
    await phase(p, "installed")
    await d.hold(0.4)
    await d.arrow(p.locator(".out", has_text="backup").last, "settings.json backed up first", side="top")
    await d.hold(2.2)
    await d.clear_arrow()

    await d.caption("Restart Claude Code: the kitchen is ready", step=3)
    await p.evaluate("restart()")
    await d.hold(0.2)
    await d.type(prompt, "! node ~/.claude/staff-of-chiefs/runtime/config.js status", cps=40)
    await d.press("Enter")
    await phase(p, "checked")
    await d.hold(2.0)

    await d.caption("Or install as a plugin, or by hand", step=4)
    await d.goto(PAGE + "#paths", settle=0.4)
    await d.hold(1.4)
    await d.arrow(p.locator("#p-remove"), "Uninstall restores your settings", side="top")
    await d.hold(2.4)
    await d.clear_arrow()

    await d.end_caption()
    await d.goto(PAGE + "#outro", settle=0.3)
    await d.hold(2.8)


if __name__ == "__main__":
    run(scene, out=str(HERE / "build-install"), title="staff-of-chiefs",
        subtitle="Install in a minute", url_label="install · real installer output",
        viewport=(960, 600))
