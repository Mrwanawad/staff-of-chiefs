"""Renders an SVG, HTML page or URL to PNG with Playwright, at one or more moments of its animation.

    python assets/shoot.py assets/icon.svg .claude-plugin/icon.png --size 512x512
    python assets/shoot.py assets/kitchen.svg out.png --size 960x390 --at 0.4 1.3 2.6
"""
import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright


async def main(a):
    w, h = map(int, a.size.split("x"))
    url = a.src if a.src.startswith("http") else Path(a.src).resolve().as_uri()
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        page = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=a.scale)
        await page.goto(url)
        await page.wait_for_timeout(a.wait)
        out = Path(a.out)
        for k, t in enumerate(a.at):
            await page.evaluate(f"""() => {{ const s = document.querySelector('svg');
                if (s && s.pauseAnimations) {{ s.pauseAnimations(); s.setCurrentTime({t}); }} }}""")
            await page.wait_for_timeout(80)
            dest = out if len(a.at) == 1 else out.with_name(f"{out.stem}-{k}{out.suffix}")
            await page.screenshot(path=str(dest), omit_background=a.transparent)
            print("wrote", dest)
        await b.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("out")
    p.add_argument("--size", default="960x390")
    p.add_argument("--scale", type=float, default=1)
    p.add_argument("--at", type=float, nargs="+", default=[0.0])
    p.add_argument("--transparent", action="store_true")
    p.add_argument("--wait", type=int, default=0, help="ms to wait after load (pages that fetch data)")
    asyncio.run(main(p.parse_args()))
