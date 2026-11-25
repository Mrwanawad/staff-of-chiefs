"""Takes demo/statusline.png and demo/dashboard.png from a recorded run.

Serve the run's dashboard on :4393 first (see demo/README.md), then: python demo/stills.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
HERE = Path(__file__).resolve().parent
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        p = await b.new_page(viewport={"width": 1000, "height": 600}, device_scale_factor=2)
        await p.goto((HERE / "replay.html").as_uri())
        await p.evaluate("""() => { const c = D.frames.map((f, i) => [i, f.ansi]).filter(([, a]) => /\\| 2 live/.test(a) && (a.match(/›/g) || []).length >= 2); const i = c.length ? c[Math.floor(c.length / 2)][0] : D.frames.findIndex(f => /\\| 2 live/.test(f.ansi)); setStatus(i); }""")
        await p.locator("#status").screenshot(path=str(HERE / "statusline.png"))
        p2 = await b.new_page(viewport={"width": 1440, "height": 860}, reduced_motion="reduce")
        await p2.goto("http://127.0.0.1:4393/"); await p2.wait_for_timeout(2500)
        await p2.screenshot(path=str(HERE / "dashboard.png"))
        await b.close()
asyncio.run(main())
