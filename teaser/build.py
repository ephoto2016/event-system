#!/usr/bin/env python3
"""Builds the teaser (16:9 and 9:16) from cards.html + the source clips.
usage: python3 build.py SRC_DIR [OUT_DIR]   (SRC_DIR holds the five .mp4 files)"""
import asyncio, glob, os, subprocess, sys, shutil
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out')
WORK = os.path.join(OUT, 'work'); os.makedirs(WORK, exist_ok=True)
FPS = 30
SIZE = {'h': (1920, 1080), 'v': (1080, 1920)}

def find(key):                       # source files are prefixed with a hash by the uploader
    m = [f for f in glob.glob(os.path.join(SRC, '*.mp4')) if key in os.path.basename(f)]
    assert len(m) == 1, (key, m); return m[0]

# (segment, source-key, start, end, label)
CLIPS = [
  ('lionet', find('-3.mp4') if glob.glob(os.path.join(SRC,'*-3.mp4')) else find('3.mp4'), 4.5, 15.6, 'lionet'),
  ('tac1',   find('1-___1-_____'), 2.5, 6.5, 'tac1'),
  ('tac2',   find('1-___2-____'),  5.5, 9.5, 'tac2'),
  ('roip1',  find('-2.mp4'),       2.0, 6.0, 'roip1'),
  ('roip2',  find('2-___2-_____-___'), 3.0, 7.0, 'roip2'),
]
ORDER = ['intro', 'stigma', 'reveal', 'lionet', 'tac1', 'tac2', 'roip1', 'roip2', 'close']

def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

async def render_card(pw_page, card, fmt, label=None):
    w, h = SIZE[fmt]
    await pw_page.set_viewport_size({'width': w, 'height': h})
    q = f'card={card}&fmt={fmt}' if card else f'label={label}&fmt={fmt}'
    await pw_page.goto(f'file://{HERE}/cards.html?{q}')
    await pw_page.evaluate('document.fonts.ready')
    if label:
        path = os.path.join(WORK, f'label_{label}_{fmt}.png')
        await pw_page.evaluate('window.at(99,0)')
        await pw_page.screenshot(path=path, omit_background=True); return path
    dur = await pw_page.evaluate('window.DUR')
    d = os.path.join(WORK, f'{card}_{fmt}'); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    for i in range(int(dur * FPS)):
        await pw_page.evaluate(f'window.at({i / FPS}, {i})')
        await pw_page.screenshot(path=f'{d}/{i:04d}.jpg', type='jpeg', quality=95)
    seg = os.path.join(WORK, f'{card}_{fmt}.mp4')
    audio = ['-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo']
    af = []
    if card == 'stigma':   # low static bed that follows the on-screen noise
        audio = ['-f', 'lavfi', '-i', f'anoisesrc=color=pink:amplitude=0.12:r=48000:d={dur}']
        af = ['-af', f'lowpass=f=3500,volume=0.5,afade=t=in:d=0.4,afade=t=out:st={dur-0.6}:d=0.6,aformat=channel_layouts=stereo']
    run('ffmpeg', '-y', '-framerate', str(FPS), '-i', f'{d}/%04d.jpg', *audio, *af, '-t', str(dur),
        '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', seg)
    return seg

def clip_segment(name, src, ss, ee, label, fmt):
    w, h = SIZE[fmt]; dur = ee - ss
    lab = os.path.join(WORK, f'label_{label}_{fmt}.png')
    out = os.path.join(WORK, f'{name}_{fmt}.mp4')
    fade = f"fade=t=in:st=0:d=0.25,fade=t=out:st={dur-0.25}:d=0.25"
    if fmt == 'h':
        vf = (f"[0:v]scale={w}:{h},setsar=1,fps={FPS}[b];[1:v]format=rgba,fade=t=in:st=0.4:d=0.4:alpha=1,fade=t=out:st=3.2:d=0.4:alpha=1[l];"
              f"[b][l]overlay=0:0,{fade}[v]")
    else:   # blurred full-bleed backdrop + the 16:9 clip centred
        vf = (f"[0:v]split[a][b];[a]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=28:4,eq=brightness=-0.15,fps={FPS}[bg];"
              f"[b]scale={w}:-2,setsar=1,fps={FPS}[fg];[bg][fg]overlay=0:(H-h)/2[c];"
              f"[1:v]format=rgba,fade=t=in:st=0.4:d=0.4:alpha=1,fade=t=out:st=3.2:d=0.4:alpha=1[l];[c][l]overlay=0:0,{fade}[v]")
    run('ffmpeg', '-y', '-ss', str(ss), '-t', str(dur), '-i', src, '-loop', '1', '-t', str(dur), '-i', lab,
        '-filter_complex', vf, '-map', '[v]', '-map', '0:a',
        '-af', f'afade=t=in:d=0.25,afade=t=out:st={dur-0.25}:d=0.25,aresample=48000,aformat=channel_layouts=stereo',
        '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-ar', '48000', '-ac', '2', out)
    return out

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox']); page = await br.new_page()
        for fmt in ('h', 'v'):
            for _, _, _, _, lbl in CLIPS: await render_card(page, None, fmt, label=lbl)
            for c in ('intro', 'stigma', 'reveal', 'close'): await render_card(page, c, fmt); print('card', c, fmt, flush=True)
        await br.close()
    for fmt in ('h', 'v'):
        for name, src, ss, ee, lbl in CLIPS: clip_segment(name, src, ss, ee, lbl, fmt)
        lst = os.path.join(WORK, f'list_{fmt}.txt')
        open(lst, 'w').write(''.join(f"file '{os.path.join(WORK, f'{n}_{fmt}.mp4')}'\n" for n in ORDER))
        final = os.path.join(OUT, f'teaser_{"16x9" if fmt == "h" else "9x16"}.mp4')
        run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final)
        print('done', final, flush=True)

asyncio.run(main())
