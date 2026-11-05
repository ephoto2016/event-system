/* Cloudflare Worker: anonymous statistics for the learning guide.
 *
 *   POST /collect   receives events from assets/track.js (stored in D1; no IP, no cookies on visitors)
 *   GET  /stats     password-protected dashboard (?range=today|7|30|all, ?csv=days|events)
 *
 * Needs:  D1 binding  DB
 *         secret      ADMIN_PASSWORD   (the dashboard password)
 *         secret      SALT             (long random text, used only to hash visitors)
 *         variable    SITE_ORIGIN      e.g. https://kesher.emanuelphoto.co.il
 */
const TZ = 'Asia/Jerusalem';
const RATE_PER_HOUR = 400;
const BOT_RE = /bot|crawl|spider|headless|preview|facebookexternalhit|whatsapp|slack|telegram|curl|wget|python|monitor/i;
const ALLOWED = new Set(['pageview', 'engage', 'scroll', 'v_play', 'v_end', 'v_watch', 'v_fs', 'share_click', 'share_done', 'share_wa', 'share_cancel', 'share_fail',
    'teaser_download', 'contact_wa', 'contact_call', 'theme', 'nav', 'part']);

/* ------------------------------------------------------------------ helpers */
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function hmac(key, msg) {
    const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowSec = () => Math.floor(Date.now() / 1000);

let ready = null;
function init(db) {
    if (!ready) {
        ready = db.batch([
            db.prepare('CREATE TABLE IF NOT EXISTS ev(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, e TEXT NOT NULL, s TEXT, vh TEXT, l TEXT, v INTEGER, src TEXT, ref TEXT, d TEXT, o TEXT, lang TEXT, th TEXT, r INTEGER, p TEXT)'),
            db.prepare('CREATE INDEX IF NOT EXISTS ev_ts ON ev(ts)'),
            db.prepare('CREATE INDEX IF NOT EXISTS ev_e_ts ON ev(e, ts)'),
            db.prepare('CREATE INDEX IF NOT EXISTS ev_vh_ts ON ev(vh, ts)'),
            db.prepare('CREATE TABLE IF NOT EXISTS fails(vh TEXT, ts INTEGER)'),
        ]).catch((e) => { ready = null; throw e; });
    }
    return ready;
}

/* anonymous visitor id: hash of IP + browser + day + secret. The IP itself is never stored, and the id changes every day. */
async function visitor(request, env) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const day = new Date().toISOString().slice(0, 10);
    return (await sha256(`${ip}|${request.headers.get('User-Agent') || ''}|${day}|${env.SALT || ''}`)).slice(0, 16);
}

/* Israel time: offset in seconds east of UTC at a given moment, local midnight, and Y-m-d labels */
function tzOffsetSec(ms) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 1000);
}
function startOfDay(sec) {
    const off = tzOffsetSec(sec * 1000), local = sec + off, dayLocal = local - (((local % 86400) + 86400) % 86400);
    return dayLocal - tzOffsetSec((dayLocal - off) * 1000);
}
const ymd = (sec) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(sec * 1000));
const hm = (sec) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(sec * 1000));

/* ------------------------------------------------------------------ collect */
function corsHeaders(request, env) {
    const h = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const o = request.headers.get('Origin');
    if (o && env.SITE_ORIGIN && o === env.SITE_ORIGIN) { h['Access-Control-Allow-Origin'] = o; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }
    return h;
}
const none = (status, h) => new Response(null, { status, headers: h });

function clean(v, n) {
    v = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    return v.replace(/[^\p{L}\p{N} _\-.:/]/gu, '').slice(0, n);
}

async function collect(request, env) {
    const h = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return none(204, h);
    if (request.method !== 'POST') return none(405, h);
    const ua = request.headers.get('User-Agent') || '';
    if (!ua || BOT_RE.test(ua)) return none(204, h);
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.SITE_ORIGIN) return none(204, h);          /* only our own site may report */
    const raw = await request.text();
    if (!raw || raw.length > 4096) return none(204, h);
    let j; try { j = JSON.parse(raw); } catch { return none(204, h); }
    if (!j || typeof j !== 'object' || !ALLOWED.has(j.e)) return none(204, h);

    const val = Number.isFinite(+j.v) && j.v !== null ? Math.max(0, Math.min(86400, Math.round(+j.v))) : null;
    const dev = ['phone', 'tablet', 'desktop'].includes(j.d) ? j.d : '';
    const ori = ['p', 'l'].includes(j.o) ? j.o : '';
    const th = ['dark', 'light'].includes(j.th) ? j.th : '';
    try {
        await init(env.DB);
        const vh = await visitor(request, env), now = nowSec();
        const c = await env.DB.prepare('SELECT COUNT(*) c FROM ev WHERE vh = ? AND ts > ?').bind(vh, now - 3600).first('c');
        if (c >= RATE_PER_HOUR) return none(204, h);
        await env.DB.prepare('INSERT INTO ev(ts, e, s, vh, l, v, src, ref, d, o, lang, th, r, p) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(now, j.e, clean(j.s, 24), vh, clean(j.l, 40), val, clean(j.src, 24), clean(j.ref, 60), dev, ori, clean(j.lang, 5), th, j.r ? 1 : 0, clean(j.p, 80)).run();
    } catch (e) { /* never break the page because of statistics */ }
    return none(204, h);
}

/* ------------------------------------------------------------------ login (signed cookie, no server-side session) */
async function isAdmin(request, env) {
    const m = /(?:^|;\s*)ks=(\d+)\.([0-9a-f]+)/.exec(request.headers.get('Cookie') || '');
    if (!m || +m[1] < nowSec() || !env.SALT) return false;
    return safeEqual(m[2], await hmac(env.SALT + '|admin', m[1]));
}
function pageHeaders(extra = {}) {
    return {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'", 'Referrer-Policy': 'no-referrer', ...extra,
    };
}
function loginPage(err, csrf) {
    return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>סטטיסטיקה · כניסה</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1120;color:#f8fafc;font-family:system-ui,'Segoe UI',Arial,sans-serif}
form{background:#1e293b;padding:28px;border-radius:18px;width:min(92vw,340px);display:grid;gap:14px;border:1px solid rgba(255,255,255,.1)}
h1{margin:0;font-size:1.3rem}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:#0f172a;color:#fff}
button{background:#10b981;color:#062b14;font-weight:800;border:0;cursor:pointer}.e{color:#fca5a5;margin:0}</style></head>
<body><form method="post" action="/stats"><h1>סטטיסטיקה · מערך הלמידה</h1>${err ? `<p class="e">${esc(err)}</p>` : ''}
<input type="password" name="pw" placeholder="סיסמה" autocomplete="current-password" autofocus required>
<input type="hidden" name="csrf" value="${esc(csrf)}"><button>כניסה</button></form></body></html>`;
}

async function handleLogin(request, env) {
    await init(env.DB);
    const vh = await visitor(request, env), now = nowSec();
    const csrf = await hmac((env.SALT || '') + '|csrf', vh + new Date().toISOString().slice(0, 10));
    if (request.method !== 'POST') return new Response(loginPage('', csrf), { headers: pageHeaders() });
    await env.DB.prepare('DELETE FROM fails WHERE ts < ?').bind(now - 3600).run();
    const n = await env.DB.prepare('SELECT COUNT(*) c FROM fails WHERE vh = ? AND ts > ?').bind(vh, now - 600).first('c');
    const form = await request.formData();
    let err = '';
    if (n >= 8) err = 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
    else if (!safeEqual(String(form.get('csrf') || ''), csrf)) err = 'הבקשה פגה, נסו שוב.';
    else if (env.ADMIN_PASSWORD && safeEqual(await hmac('pw', String(form.get('pw') || '')), await hmac('pw', env.ADMIN_PASSWORD))) {
        const exp = String(now + 8 * 3600);
        return new Response(null, { status: 303, headers: { Location: '/stats', 'Set-Cookie': `ks=${exp}.${await hmac(env.SALT + '|admin', exp)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`, 'Cache-Control': 'no-store' } });
    } else {
        await env.DB.prepare('INSERT INTO fails(vh, ts) VALUES(?,?)').bind(vh, now).run();
        await new Promise((r) => setTimeout(r, 1000));
        err = 'סיסמה שגויה.';
    }
    return new Response(loginPage(err, csrf), { status: 401, headers: pageHeaders() });
}

/* ------------------------------------------------------------------ dashboard */
const NAMES = { 'tactical-1-radius': 'תג"מ · חלק 1 (רדיוס)', 'tactical-2-valley': 'תג"מ · חלק 2 (וואדי)', 'roip-1-routing': 'RoIP · חלק 1 (ניתוב ידני)',
    'roip-2-site-choice': 'RoIP · חלק 2 (מעבר אתרים בין כוחות)', lionet: 'ליונט', 'teaser-9x16': 'טיזר' };
const EV_HE = { pageview: 'צפייה', v_play: 'הפעלת סרטון', v_end: 'סיום סרטון', v_fs: 'מסך מלא', share_click: 'לחיצת שיתוף', share_done: 'שיתוף הושלם', share_wa: 'שיתוף (קישור)',
    share_cancel: 'שיתוף בוטל', share_fail: 'שיתוף נכשל', teaser_download: 'הורדת טיזר', contact_wa: 'קשר בוואטסאפ', contact_call: 'התקשרות', theme: 'החלפת תצוגה', nav: 'ניווט', part: 'בחירת חלק' };
const DEV_HE = { phone: 'טלפון', tablet: 'טאבלט', desktop: 'מחשב' };
const RANGE_HE = [['today', 'היום'], ['7', '7 ימים'], ['30', '30 ימים'], ['all', 'הכול']];   /* an array keeps the order (numeric keys would jump first) */
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '–');

async function dashboard(request, env, url) {
    const db = env.DB; await init(db);
    const q = async (sql, p = []) => (await db.prepare(sql).bind(...p).all()).results || [];
    const one = async (sql, p = []) => { const r = await db.prepare(sql).bind(...p).first(); return r ? Object.values(r)[0] : null; };
    const sess = async (where, from) => Number(await one(`SELECT COUNT(DISTINCT s) FROM ev WHERE ts >= ? AND (${where})`, [from])) || 0;

    const range = ['today', '7', '30', 'all'].includes(url.searchParams.get('range')) ? url.searchParams.get('range') : '7';
    const now = nowSec(), todayStart = startOfDay(now);
    const from = { today: todayStart, 7: todayStart - 6 * 86400, 30: todayStart - 29 * 86400, all: 0 }[range];
    const off = tzOffsetSec(Date.now());

    const csv = url.searchParams.get('csv');
    if (csv) {
        const safe = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v);
        const cell = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        const lines = [];
        if (csv === 'events') {
            lines.push(['time', 'event', 'session', 'label', 'value', 'src', 'ref', 'device', 'orient', 'lang', 'theme', 'returning', 'path'].join(','));
            for (const r of await q('SELECT * FROM ev WHERE ts >= ? ORDER BY ts', [from])) lines.push([new Date(r.ts * 1000).toISOString(), r.e, r.s, safe(r.l), r.v, safe(r.src), safe(r.ref), r.d, r.o, r.lang, r.th, r.r, r.p].map(cell).join(','));
        } else {
            lines.push('day,views,visitors,shares_done');
            for (const r of await q("SELECT strftime('%Y-%m-%d', ts + ?, 'unixepoch') day, SUM(e='pageview') v, COUNT(DISTINCT CASE WHEN e='pageview' THEN vh END) u, SUM(e IN ('share_done','share_wa')) sh FROM ev WHERE ts >= ? GROUP BY day ORDER BY day", [off, from])) lines.push([r.day, r.v, r.u, r.sh].map(cell).join(','));
        }
        return new Response('﻿' + lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="stats-${csv === 'events' ? 'events' : 'days'}.csv"`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }

    const views = Number(await one("SELECT COUNT(*) FROM ev WHERE e='pageview' AND ts >= ?", [from])) || 0;
    const visitors = Number(await one("SELECT COUNT(DISTINCT vh) FROM ev WHERE e='pageview' AND ts >= ?", [from])) || 0;
    const sessions = await sess("e='pageview'", from);
    const retPct = views ? Math.round(100 * Number(await one("SELECT AVG(r) FROM ev WHERE e='pageview' AND ts >= ?", [from]))) : 0;

    const times = (await q("SELECT SUM(v) t FROM ev WHERE e='engage' AND ts >= ? GROUP BY s HAVING t > 0", [from])).map((r) => Number(r.t)).sort((a, b) => a - b);
    const nt = times.length, avgT = nt ? Math.round(times.reduce((a, b) => a + b, 0) / nt) : 0, medT = nt ? times[Math.floor(nt / 2)] : 0;

    const scroll = { 25: 0, 50: 0, 75: 0, 100: 0 };
    for (const r of await q("SELECT l, COUNT(DISTINCT s) c FROM ev WHERE e='scroll' AND ts >= ? GROUP BY l", [from])) if (r.l in scroll) scroll[r.l] = Number(r.c);
    const funnel = [
        ['נכנסו לדף', sessions], ['גללו עד 75%', scroll[75]], ['ניגנו סרטון', await sess("e='v_play'", from)], ['לחצו שיתוף', await sess("e='share_click'", from)],
        ['שיתפו בפועל', await sess("e IN ('share_done','share_wa')", from)], ['יצרו קשר', await sess("e IN ('contact_wa','contact_call')", from)],
    ];
    const base = Math.max(1, sessions);

    const vids = await q("SELECT l, SUM(e='v_play') plays, SUM(e='v_end') ends, SUM(CASE WHEN e='v_watch' THEN v ELSE 0 END) secs, SUM(e='v_fs') fs FROM ev WHERE e IN ('v_play','v_end','v_watch','v_fs') AND l <> '' AND ts >= ? GROUP BY l ORDER BY plays DESC", [from]);
    const ev = {}; for (const r of await q('SELECT e, COUNT(*) c FROM ev WHERE ts >= ? GROUP BY e', [from])) ev[r.e] = Number(r.c);
    const sharesDone = (ev.share_done || 0) + (ev.share_wa || 0);
    const fromShare = Number(await one("SELECT COUNT(*) FROM ev WHERE e='pageview' AND src='share' AND ts >= ?", [from])) || 0;
    const fromShareU = Number(await one("SELECT COUNT(DISTINCT vh) FROM ev WHERE e='pageview' AND src='share' AND ts >= ?", [from])) || 0;

    const dev = await q("SELECT d, COUNT(*) c FROM ev WHERE e='pageview' AND d <> '' AND ts >= ? GROUP BY d ORDER BY c DESC", [from]);
    const ori = await q("SELECT o, COUNT(*) c FROM ev WHERE e='pageview' AND d='phone' AND o <> '' AND ts >= ? GROUP BY o", [from]);
    const theme = await q("SELECT th, COUNT(*) c FROM ev WHERE e='pageview' AND th <> '' AND ts >= ? GROUP BY th", [from]);
    const refs = await q("SELECT CASE WHEN ref <> '' THEN ref WHEN src <> '' THEN 'src=' || src ELSE '(ישיר)' END k, COUNT(*) c FROM ev WHERE e='pageview' AND ts >= ? GROUP BY k ORDER BY c DESC LIMIT 8", [from]);

    /* views per calendar day (Israel time) */
    let dayFrom = range === 'all' ? Number(await one('SELECT MIN(ts) FROM ev')) || todayStart : from;
    dayFrom = Math.max(dayFrom, todayStart - 59 * 86400);
    const days = new Map();
    for (let t = startOfDay(dayFrom); t <= now; t += 86400) days.set(ymd(t + 3600 * 3), { v: 0, u: 0, sh: 0 });   /* +3h: stay inside the local day even across a DST change */
    for (const r of await q("SELECT strftime('%Y-%m-%d', ts + ?, 'unixepoch') day, SUM(e='pageview') v, COUNT(DISTINCT CASE WHEN e='pageview' THEN vh END) u, SUM(e IN ('share_done','share_wa')) sh FROM ev WHERE ts >= ? GROUP BY day", [off, dayFrom]))
        if (days.has(r.day)) days.set(r.day, { v: Number(r.v), u: Number(r.u), sh: Number(r.sh) });
    const dayKeys = [...days.keys()], maxV = Math.max(1, ...[...days.values()].map((d) => d.v)), bw = 100 / Math.max(1, dayKeys.length);
    const bars = dayKeys.map((d, i) => { const hgt = (34 * days.get(d).v) / maxV; return `<rect x="${(100 - (i + 1) * bw + bw * 0.15).toFixed(3)}" y="${(36 - hgt).toFixed(2)}" width="${(bw * 0.7).toFixed(3)}" height="${hgt.toFixed(2)}" fill="#38bdf8"><title>${esc(d)}: ${days.get(d).v} צפיות</title></rect>`; }).join('');

    const recent = await q("SELECT ts, e, l, d FROM ev WHERE e NOT IN ('engage','scroll','v_watch') ORDER BY id DESC LIMIT 15");
    const rows = (arr, fn) => arr.map(fn).join('');
    const scrollRows = Object.entries(scroll).map(([k, c]) => `<tr><td>עד ${esc(k)}%<div class="bar"><i style="width:${Math.round((100 * c) / base)}%"></i></div></td><td class="n">${c}</td><td class="n">${pct(c, sessions)}</td></tr>`).join('');

    return new Response(`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>סטטיסטיקה · מערך הלמידה</title>
<style>
:root{--bg:#0b1120;--card:#1e293b;--alt:#0f172a;--tx:#f8fafc;--mu:#a3b1c6;--g:#10b981;--b:#38bdf8;--bd:rgba(255,255,255,.1)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font-family:system-ui,'Segoe UI',Arial,sans-serif;line-height:1.5;padding:12px}
main{max-width:1100px;margin:0 auto}h1{font-size:1.5rem;margin:6px 0 2px}h2{font-size:1.1rem;margin:0 0 10px;color:var(--b)}
.top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px}
.tabs a{display:inline-block;padding:8px 14px;border-radius:999px;color:var(--mu);text-decoration:none;font-weight:700;border:1px solid var(--bd);margin-inline-start:6px}
.tabs a.on{background:var(--b);color:#06222f;border-color:var(--b)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:14px}
.k{font-size:2rem;font-weight:800;line-height:1.1}.l{color:var(--mu);font-size:.9rem}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:.95rem}td,th{padding:7px 6px;border-bottom:1px solid var(--bd);text-align:start}th{color:var(--mu);font-weight:600}
td.n,th.n{text-align:end;font-variant-numeric:tabular-nums}
.bar{height:8px;border-radius:5px;background:var(--alt);overflow:hidden;margin-top:3px}.bar i{display:block;height:100%;background:var(--g)}
.foot{color:var(--mu);font-size:.85rem;margin:14px 0}a{color:var(--b)}svg{width:100%;display:block}
</style></head><body><main>
<div class="top"><div><h1>סטטיסטיקה · מערך הלמידה</h1><div class="l">נתונים אנונימיים: ללא עוגיות למבקרים וללא שמירת כתובת IP · אזור זמן ${esc(TZ)}</div></div>
<div class="tabs">${RANGE_HE.map(([k, t]) => `<a class="${range === k ? 'on' : ''}" href="/stats?range=${esc(k)}">${esc(t)}</a>`).join('')}</div></div>

<div class="grid">
 <div class="card"><div class="k">${views}</div><div class="l">צפיות בדף</div></div>
 <div class="card"><div class="k">${visitors}</div><div class="l">מבקרים (לפי יום)</div></div>
 <div class="card"><div class="k">${nt ? mmss(avgT) : '–'}</div><div class="l">זמן שהייה ממוצע (חציון ${nt ? mmss(medT) : '–'})</div></div>
 <div class="card"><div class="k">${sharesDone}</div><div class="l">שיתופים שהושלמו</div></div>
 <div class="card"><div class="k">${fromShare}</div><div class="l">כניסות מהשיתופים (${fromShareU} מבקרים)</div></div>
 <div class="card"><div class="k">${retPct}%</div><div class="l">מבקרים חוזרים</div></div>
</div>

<div class="card" style="margin-bottom:12px"><h2>צפיות לפי יום</h2>
<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:150px" role="img" aria-label="צפיות לפי יום">${bars}</svg>
<div class="l" style="display:flex;justify-content:space-between"><span>${esc(dayKeys[0])}</span><span>${esc(dayKeys[dayKeys.length - 1])}</span></div></div>

<div class="two">
 <div class="card"><h2>משפך: מכניסה לפעולה (ביקורים)</h2><table>${rows(funnel, ([k, c]) => `<tr><td>${esc(k)}<div class="bar"><i style="width:${Math.round((100 * c) / base)}%"></i></div></td><td class="n">${c}</td><td class="n">${pct(c, sessions)}</td></tr>`)}</table></div>
 <div class="card"><h2>עומק גלילה (ביקורים)</h2><table>${scrollRows}</table></div>
</div>

<div class="card" style="margin-bottom:12px"><h2>סרטונים</h2>
<table><tr><th>סרטון</th><th class="n">הפעלות</th><th class="n">צפו עד הסוף</th><th class="n">שניות צפייה ממוצעות</th><th class="n">מסך מלא</th></tr>
${rows(vids, (v) => { const pl = Number(v.plays); return `<tr><td>${esc(NAMES[v.l] || v.l)}</td><td class="n">${pl}</td><td class="n">${Number(v.ends)} (${pct(Number(v.ends), pl)})</td><td class="n">${pl ? Math.round(Number(v.secs) / pl) : '–'}</td><td class="n">${Number(v.fs)}</td></tr>`; })}
${vids.length ? '' : '<tr><td colspan="5" class="l">עדיין אין נתונים.</td></tr>'}</table></div>

<div class="two">
 <div class="card"><h2>שיתופים</h2><table>
 <tr><td>לחיצות על "שלחו לחבר"</td><td class="n">${ev.share_click || 0}</td></tr>
 <tr><td>שיתוף עם הסרטון הושלם</td><td class="n">${ev.share_done || 0}</td></tr>
 <tr><td>נפתח וואטסאפ עם קישור בלבד</td><td class="n">${ev.share_wa || 0}</td></tr>
 <tr><td>בוטל / נכשל</td><td class="n">${ev.share_cancel || 0} / ${ev.share_fail || 0}</td></tr>
 <tr><td>הורדות טיזר</td><td class="n">${ev.teaser_download || 0}</td></tr>
 <tr><td>כניסות שהגיעו משיתוף</td><td class="n">${fromShare}</td></tr>
 <tr><td>כניסות לכל שיתוף</td><td class="n">${sharesDone ? (fromShare / sharesDone).toFixed(1) : '–'}</td></tr>
 <tr><td>פניות לעמנואל (וואטסאפ / טלפון)</td><td class="n">${ev.contact_wa || 0} / ${ev.contact_call || 0}</td></tr></table></div>
 <div class="card"><h2>מכשירים ומקורות</h2><table>
 ${rows(dev, (r) => `<tr><td>${esc(DEV_HE[r.d] || r.d)}</td><td class="n">${Number(r.c)}</td><td class="n">${pct(Number(r.c), views)}</td></tr>`)}
 ${rows(ori, (r) => `<tr><td class="l">בטלפון: ${r.o === 'p' ? 'עומד' : 'שוכב'}</td><td class="n">${Number(r.c)}</td><td></td></tr>`)}
 ${rows(theme, (r) => `<tr><td class="l">תצוגה ${r.th === 'dark' ? 'כהה' : 'בהירה'}</td><td class="n">${Number(r.c)}</td><td></td></tr>`)}
 <tr><th colspan="3">מאיפה הגיעו</th></tr>
 ${rows(refs, (r) => `<tr><td>${esc(r.k)}</td><td class="n">${Number(r.c)}</td><td></td></tr>`)}</table></div>
</div>

<div class="card"><h2>פעילות אחרונה</h2><table>
${rows(recent, (r) => `<tr><td>${esc(hm(r.ts))}</td><td>${esc(EV_HE[r.e] || r.e)}</td><td class="l">${esc(NAMES[r.l] || r.l)}</td><td class="l">${esc(DEV_HE[r.d] || '')}</td></tr>`)}
${recent.length ? '' : '<tr><td class="l">עדיין אין פעילות.</td></tr>'}</table></div>

<p class="foot">ייצוא: <a href="/stats?csv=days&amp;range=${esc(range)}">סיכום יומי (CSV)</a> · <a href="/stats?csv=events&amp;range=${esc(range)}">כל האירועים (CSV)</a> · <a href="/stats?logout=1">יציאה</a><br>
"מבקרים (לפי יום)" סופר מבקר פעם אחת בכל יום (המזהה אנונימי ומתחלף מדי יום), ולכן סכום על כמה ימים עשוי לספור את אותו אדם יותר מפעם. בוטים ותצוגות מקדימות של וואטסאפ לא נספרים.</p>
</main></body></html>`, { headers: pageHeaders() });
}

/* ------------------------------------------------------------------ router */
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        try {
            if (url.pathname === '/collect') return await collect(request, env);
            if (url.pathname === '/stats') {
                if (!env.DB || !env.SALT || !env.ADMIN_PASSWORD) return new Response('חסרות הגדרות: DB, SALT, ADMIN_PASSWORD', { status: 503, headers: pageHeaders() });
                if (url.searchParams.has('logout')) return new Response(null, { status: 303, headers: { Location: '/stats', 'Set-Cookie': 'ks=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0', 'Cache-Control': 'no-store' } });
                if (!(await isAdmin(request, env))) return await handleLogin(request, env);
                return await dashboard(request, env, url);
            }
            if (url.pathname === '/') return new Response('ok', { headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' } });
        } catch (e) {
            return new Response('error', { status: 500, headers: { 'Cache-Control': 'no-store' } });
        }
        return new Response('not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
    },
};
