#!/usr/bin/env python3
"""Renders the link-preview image (1200x630) from cards.html (card 'og'). usage: og.py OUT.png"""
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
        pg = await br.new_page(viewport={'width': 1200, 'height': 630})
        await pg.goto(f'file://{HERE}/cards.html?card=og&fmt=h'); await pg.evaluate('document.fonts.ready')
        await pg.evaluate('window.at(3, 0)'); await pg.screenshot(path=sys.argv[1]); await br.close()
asyncio.run(main())
