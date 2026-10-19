#!/usr/bin/env python3
"""Builds the teaser (16:9 and 9:16) from cards.html + the source clips.
usage: python3 build.py SRC_DIR [OUT_DIR] [--music FILE [--music-rise SEC] [--music-gain G]] [--version v2|short] [--reuse]
(SRC_DIR holds the five .mp4 files; --reuse re-encodes cards from frames already rendered in the work dir)
Without --music a synthetic placeholder track is generated (no licensing issues)."""
import asyncio, glob, os, subprocess, sys, shutil
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[1:]
MUSIC = None
if '--music' in ARGS:
    i = ARGS.index('--music'); MUSIC = os.path.abspath(ARGS[i + 1]); del ARGS[i:i + 2]
MUSIC_RISE, MUSIC_GAIN, REUSE = 16.0, 0.28, False   # second of the track where it lifts; base gain; skip re-rendering card frames
if '--music-rise' in ARGS:
    i = ARGS.index('--music-rise'); MUSIC_RISE = float(ARGS[i + 1]); del ARGS[i:i + 2]
if '--music-gain' in ARGS:
    i = ARGS.index('--music-gain'); MUSIC_GAIN = float(ARGS[i + 1]); del ARGS[i:i + 2]
if '--reuse' in ARGS:
    ARGS.remove('--reuse'); REUSE = True
VERSION = 'v2'                        # 'v2' = 65s with pros/cons cards, 'short' = ~39s problem -> solution teaser
if '--version' in ARGS:
    i = ARGS.index('--version'); VERSION = ARGS[i + 1]; del ARGS[i:i + 2]
SRC = ARGS[0]
OUT = ARGS[1] if len(ARGS) > 1 else os.path.join(HERE, 'out')
WORK = os.path.join(OUT, 'work' if VERSION == 'v2' else f'work_{VERSION}'); os.makedirs(WORK, exist_ok=True)
FPS = 30
SIZE = {'h': (1920, 1080), 'v': (1080, 1920)}

def find(key):                       # source files are prefixed with a hash by the uploader
    m = [f for f in glob.glob(os.path.join(SRC, '*.mp4')) if key in os.path.basename(f)]
    assert len(m) == 1, (key, m); return m[0]

F = dict(
  lionet=find('-3.mp4') if glob.glob(os.path.join(SRC, '*-3.mp4')) else find('3.mp4'),
  rad=find('1-___1-_____'), wadi=find('1-___2-____'), roip1=find('-2.mp4'), roip2=find('2-___2-_____-___'))
# (segment, source file, start, end, label key)
if VERSION == 'v2':
    CLIPS = [('lionet', F['lionet'], 5.5, 13.5, 'lionet'), ('tac1', F['rad'], 2.5, 6.0, 'tac1'), ('tac2', F['wadi'], 6.0, 9.5, 'tac2'),
             ('roip1', F['roip1'], 2.0, 5.5, 'roip1'), ('roip2', F['roip2'], 3.0, 6.5, 'roip2')]
    CARD_NAMES = ['intro', 'stigma', 'reveal2', 'sys1', 'sum1', 'sys2', 'sum2', 'sys3', 'sum3', 'close2']
    ORDER = ['intro', 'stigma', 'reveal2', 'sys1', 'tac1', 'tac2', 'sum1', 'sys2', 'roip1', 'roip2', 'sum2', 'sys3', 'lionet', 'sum3', 'close2']
    TURN_AT, PREFIX = None, ''          # music turns upbeat at 9s
else:   # short: problem -> (bridge) -> solution, no pros/cons
    # p_roip opens at 0.2s (clean fade-in of 'Kodkod / Dochifat'), stops before the operator reaches for the console (~3.9s) and holds 0.4s
    # p_lio starts at 5.4s (the source has a dark scene transition at ~5.1-5.3s), holds its last frame 0.6s
    # s_lio1 = Lionet video, phone -> cellular cloud -> bridged site (cut before the wipe that brings in the operator, ~2.7s)
    # s_lio2 = 'whoever is near the bridged site is connected' (bright from 7.7s; the source fades to the diagram slide after 9.8s)
    CLIPS = [('p_tac', F['wadi'], 5.2, 8.2, 'p_tac'), ('p_roip', F['roip1'], 0.2, 3.8, 'p_roip', 0.4), ('p_lio', F['lionet'], 5.4, 6.9, 'p_lio', 0.6),
             ('s_tac', F['rad'], 5.2, 8.4, 's_tac'), ('s_roip', F['roip1'], 5.5, 8.5, 's_roip'), ('s_lio1', F['lionet'], 0.2, 2.6, 's_lio1'), ('s_lio2', F['lionet'], 7.7, 9.8, 's_lio2', 0.5)]
    CARD_NAMES = ['intro', 'stigma3', 'reveal3', 'bridge', 'cta', 'punch', 'close3']
    ORDER = ['intro', 'stigma3', 'reveal3', 'p_tac', 'p_roip', 'p_lio', 'bridge', 's_tac', 's_roip', 's_lio1', 's_lio2', 'cta', 'punch', 'close3']
    TURN_AT, PREFIX = 'bridge', 'short_'

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
    d = os.path.join(WORK, f'{card}_{fmt}')
    if not (REUSE and os.path.isdir(d)):
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        for i in range(int(dur * FPS)):
            await pw_page.evaluate(f'window.at({i / FPS}, {i})')
            await pw_page.screenshot(path=f'{d}/{i:04d}.jpg', type='jpeg', quality=95)
    seg = os.path.join(WORK, f'{card}_{fmt}.mp4')
    audio = ['-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo']
    af = []
    if card.startswith('stigma'):   # low static bed that follows the on-screen noise
        audio = ['-f', 'lavfi', '-i', f'anoisesrc=color=pink:amplitude={0.12 if VERSION == "v2" else 1.0}:r=48000:d={dur}']
        af = ['-af', f'lowpass=f=3500,volume=0.5,afade=t=in:d=0.4,afade=t=out:st={dur-0.6}:d=0.6,aformat=channel_layouts=stereo']
    run('ffmpeg', '-y', '-framerate', str(FPS), '-i', f'{d}/%04d.jpg', *audio, *af, '-t', str(dur),
        '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', seg)
    return seg

def clip_segment(name, src, ss, ee, label, freeze=0, fmt='h'):
    w, h = SIZE[fmt]; dur = ee - ss + freeze   # freeze = seconds the last frame is held (video only)
    tp = f'tpad=stop_mode=clone:stop_duration={freeze},' if freeze else ''
    lab = os.path.join(WORK, f'label_{label}_{fmt}.png')
    out = os.path.join(WORK, f'{name}_{fmt}.mp4')
    fade = f"fade=t=in:st=0:d=0.25,fade=t=out:st={dur-0.25}:d=0.25"
    if fmt == 'h':
        vf = (f"[0:v]{tp}scale={w}:{h},setsar=1,fps={FPS}[b];[1:v]format=rgba,fade=t=in:st=0.4:d=0.4:alpha=1,fade=t=out:st={min(3.2, dur - 0.6):.2f}:d=0.4:alpha=1[l];"
              f"[b][l]overlay=0:0,{fade}[v]")
    else:   # blurred full-bleed backdrop + the 16:9 clip centred
        vf = (f"[0:v]{tp}split[a][b];[a]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=28:4,eq=brightness=-0.15,fps={FPS}[bg];"
              f"[b]scale={w}:-2,setsar=1,fps={FPS}[fg];[bg][fg]overlay=0:(H-h)/2[c];"
              f"[1:v]format=rgba,fade=t=in:st=0.4:d=0.4:alpha=1,fade=t=out:st={min(3.2, dur - 0.6):.2f}:d=0.4:alpha=1[l];[c][l]overlay=0:0,{fade}[v]")
    run('ffmpeg', '-y', '-ss', str(ss), '-t', str(ee - ss), '-i', src, '-loop', '1', '-t', str(dur), '-i', lab,
        '-filter_complex', vf, '-map', '[v]', '-map', '0:a',
        '-af', f'afade=t=in:d=0.25,afade=t=out:st={ee - ss - 0.25}:d=0.25,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={dur}', '-t', str(dur),
        '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-ar', '48000', '-ac', '2', out)
    return out

def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True, check=True)
    return float(r.stdout)

def gen_music(path, dur, turn=9):
    """Synthetic placeholder: tense drone -> upbeat pad/arp/kick from 9s (the 'reveal'). 120bpm, A minor."""
    arp = ("st(0,mod(floor(t/.25),8));st(1,if(eq(ld(0),0),220,if(eq(ld(0),1),261.63,if(eq(ld(0),2),329.63,if(eq(ld(0),3),261.63,"
           "if(eq(ld(0),4),246.94,if(eq(ld(0),5),293.66,if(eq(ld(0),6),329.63,293.66))))))));0.2*sin(2*PI*ld(1)*t)*exp(-6*mod(t,.25))")
    parts = [
      f"aevalsrc='0.16*sin(2*PI*55*t)+0.05*sin(2*PI*82.4*t)':s=48000:d={dur}",
      f"aevalsrc='0.045*(sin(2*PI*220*t)+sin(2*PI*261.63*t)+sin(2*PI*329.63*t))*(0.65+0.35*sin(2*PI*0.12*t))':s=48000:d={dur}",
      f"aevalsrc='{arp}':s=48000:d={dur},volume='gte(t,{turn})':eval=frame",
      f"aevalsrc='0.8*sin(2*PI*(46+70*exp(-30*mod(t,.5)))*t)*exp(-9*mod(t,.5))':s=48000:d={dur},volume='gte(t,{turn})':eval=frame",
      f"anoisesrc=color=white:amplitude=1:r=48000:d={dur},highpass=f=7000,volume='gte(t,{turn})*lt(mod(t,.25),.03)*0.10':eval=frame",
    ]
    ins = []
    for p in parts: ins += ['-f', 'lavfi', '-i', p]
    run('ffmpeg', '-y', *ins, '-filter_complex',
        f"amix=inputs={len(parts)}:normalize=0,lowpass=f=6500,aformat=channel_layouts=stereo,afade=t=in:d=1.2,afade=t=out:st={dur-2.5}:d=2.5", path)

def gen_end_sfx(path, dur, t_close, t_crack=None):
    """Ending effect (synthesised): riser into the closing card, deep impact on the headline, short shimmer on the second line.
    Offsets are clamped with max(.,0) so exp() never overflows before the gate opens (inf*0 = NaN would poison the mix)."""
    r0, hit, chime = t_close - 1.4, t_close + 0.15, t_close + 0.8
    th, tc, tr = f"max(t-{hit},0)", f"max(t-{chime},0)", f"max(t-{r0},0)"
    parts = [
      # rising noise + sine sweep
      f"aevalsrc='gt(t,{r0})*lt(t,{hit})*pow({tr}/{hit - r0},2)*(0.35*(random(0)*2-1)+0.25*sin(2*PI*(300*{tr}+500*pow({tr},3))))':s=48000:d={dur}",
      # impact: pitch-dropping sub + noise burst
      f"aevalsrc='gt(t,{hit})*(0.9*exp(-2.6*{th})*sin(2*PI*(40*{th}+2.5*(1-exp(-8*{th}))))+0.45*exp(-22*{th})*(random(0)*2-1))':s=48000:d={dur}",
      # chime / shimmer
      f"aevalsrc='gt(t,{chime})*exp(-2.4*{tc})*(0.22*sin(2*PI*1318.5*t)+0.16*sin(2*PI*1975.5*t)+0.09*sin(2*PI*2637*t))':s=48000:d={dur}",
    ]
    if t_crack is not None:   # the slam when 'the disaster of the line' lands on the punchline slide
        tk = f"max(t-{t_crack},0)"
        parts.append(f"aevalsrc='gt(t,{t_crack})*(0.8*exp(-4*{tk})*sin(2*PI*(55*{tk}+3*(1-exp(-10*{tk}))))+0.4*exp(-30*{tk})*(random(0)*2-1))':s=48000:d={dur}")
    ins = []
    for p in parts: ins += ['-f', 'lavfi', '-i', p]
    run('ffmpeg', '-y', *ins, '-filter_complex',
        f"amix=inputs={len(parts)}:normalize=0,lowpass=f=9000,aecho=0.8:0.55:140|260:0.35|0.2,aformat=channel_layouts=stereo", path)

def add_music(dry, final, turn=9, t_close=None, t_crack=None):
    dur = duration(dry)
    mus, sfx = MUSIC, None
    if not mus:
        mus = os.path.join(WORK, 'music_synth.wav'); gen_music(mus, dur, turn)
        head, gain, tail = "", 0.9, f"afade=t=in:d=1.0,afade=t=out:st={dur-2.0}:d=2.0"
        thr, ratio = 0.03, 9
    else:
        # real track: its energy lift (MUSIC_RISE s) is aligned with the 'bridge' moment, then it fades out after the headline lands
        shift = turn - MUSIC_RISE
        head = (f"atrim=start={-shift:.2f},asetpts=PTS-STARTPTS," if shift < 0 else "") + (f"adelay={int(shift * 1000)}|{int(shift * 1000)}," if shift > 0 else "")
        fo = (t_close + 1.2) if t_close else dur - 3
        gain, tail = MUSIC_GAIN, f"afade=t=in:d=1.0,afade=t=out:st={fo:.2f}:d={dur - fo:.2f}"
        thr, ratio = 0.015, 12
        if t_close:
            sfx = os.path.join(WORK, 'end_sfx.wav'); gen_end_sfx(sfx, dur, t_close, t_crack)
    # music sits under the clips' own sound (static, radio): sidechain-duck it whenever that sound plays
    fc = (f"[0:a]asplit[sc][main];[1:a]aresample=48000,aformat=channel_layouts=stereo,{head}volume={gain},{tail}[m];"
          f"[m][sc]sidechaincompress=threshold={thr}:ratio={ratio}:attack=20:release=500[d];")
    if sfx:
        fc += "[main][d][2:a]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.89:level=false[a]"
    else:
        fc += "[main][d]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89:level=false[a]"
    cmd = ['ffmpeg', '-y', '-i', dry, '-stream_loop', '-1', '-i', mus] + (['-i', sfx] if sfx else [])
    run(*cmd, '-filter_complex', fc, '-map', '0:v', '-map', '[a]',
        '-t', str(dur), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox']); page = await br.new_page()
        for fmt in ('h', 'v'):
            for c in CLIPS: await render_card(page, None, fmt, label=c[4])
            for c in CARD_NAMES: await render_card(page, c, fmt); print('card', c, fmt, flush=True)
        await br.close()
    for fmt in ('h', 'v'):
        for c in CLIPS: clip_segment(*c, fmt=fmt)
        lst = os.path.join(WORK, f'list_{fmt}.txt')
        open(lst, 'w').write(''.join(f"file '{os.path.join(WORK, f'{n}_{fmt}.mp4')}'\n" for n in ORDER))
        final = os.path.join(OUT, f'teaser_{PREFIX}{"16x9" if fmt == "h" else "9x16"}.mp4')
        dry = os.path.join(WORK, f'nomusic_{fmt}.mp4')
        run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dry)
        turn = 9
        if TURN_AT:   # music turns upbeat where the 'bridge' card starts
            turn = round(sum(duration(os.path.join(WORK, f'{n}_{fmt}.mp4')) for n in ORDER[:ORDER.index(TURN_AT)]), 2)
        t_close = None
        if 'close3' in ORDER:   # short version gets the ending effect, timed to the closing card
            t_close = round(sum(duration(os.path.join(WORK, f'{n}_{fmt}.mp4')) for n in ORDER[:ORDER.index('close3')]), 2)
        t_crack = None
        if 'punch' in ORDER:    # the slam lands 1.95s into the punchline slide
            t_crack = round(sum(duration(os.path.join(WORK, f'{n}_{fmt}.mp4')) for n in ORDER[:ORDER.index('punch')]) + 1.95, 2)
        add_music(dry, final, turn, t_close, t_crack)
        print('done', final, flush=True)

asyncio.run(main())
