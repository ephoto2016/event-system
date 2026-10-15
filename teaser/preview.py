#!/usr/bin/env python3
"""Quick look: renders one frame of each card at chosen times. usage: preview.py OUTDIR fmt card:t [card:t ...]"""
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
OUTD, FMT, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
SIZE = {'h': (1920, 1080), 'v': (1080, 1920)}
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
        page = await br.new_page(viewport={'width': SIZE[FMT][0], 'height': SIZE[FMT][1]})
        msgs = []; page.on('pageerror', lambda e: msgs.append(str(e))); page.on('console', lambda m: m.type == 'error' and msgs.append(m.text))
        for s in specs:
            card, t = s.split(':')
            await page.goto(f'file://{HERE}/cards.html?card={card}&fmt={FMT}'); await page.evaluate('document.fonts.ready')
            await page.evaluate(f'window.at({t}, 3)')
            await page.screenshot(path=os.path.join(OUTD, f'{card}_{t}_{FMT}.png'))
        print('errors:', msgs); await br.close()
asyncio.run(main())
