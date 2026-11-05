/* Anonymous first-party page statistics. No cookies, no IP stored, no third parties.
   Events go to the statistics Worker (see the stats-endpoint meta tag); if it is not set or is offline this script silently does nothing. */
(function () {
    'use strict';
    /* where events are sent: the Cloudflare Worker address, set once in index.html: <meta name="stats-endpoint" content="https://.../collect"> */
    var meta = document.querySelector('meta[name="stats-endpoint"]');
    var ENDPOINT = (meta && meta.getAttribute('content')) || '';
    var noop = function () {};
    window.kTrack = noop;
    if (!ENDPOINT) return;
    try { if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return; } catch (e) {}
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;   /* e.g. opened as a local file */

    var sid;
    try { sid = sessionStorage.getItem('ksid'); if (!sid) { sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem('ksid', sid); } }
    catch (e) { sid = Math.random().toString(36).slice(2, 14); }
    var returning = 0;
    try { returning = localStorage.getItem('kseen') ? 1 : 0; localStorage.setItem('kseen', '1'); } catch (e) {}

    var src = '', ref = '';
    try { src = (new URLSearchParams(location.search).get('src') || '').slice(0, 24).replace(/[^\w-]/g, ''); } catch (e) {}
    try { if (document.referrer) { var ru = new URL(document.referrer); if (ru.host !== location.host) ref = ru.host.slice(0, 60); } } catch (e) {}
    var w = window.innerWidth, device = w < 600 ? 'phone' : (w < 1000 ? 'tablet' : 'desktop');

    var dead = false, first = true;
    function send(ev, label, val) {
        if (dead) return;
        var body = JSON.stringify({
            e: ev, s: sid, l: label == null ? '' : String(label).slice(0, 40), v: val == null ? null : Math.round(val),
            src: src, ref: ref, d: device, o: window.innerHeight > window.innerWidth ? 'p' : 'l',
            lang: (navigator.language || '').slice(0, 5), th: document.documentElement.getAttribute('data-theme') || '', r: returning, p: location.pathname.slice(0, 80)
        });
        try {
            if (first) {   /* the first request uses fetch so a missing collector (404) switches tracking off */
                first = false;
                fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
                    .then(function (r) { if (r.status === 404 || r.status === 405 || r.status >= 500) dead = true; }, function () { dead = true; });   /* cross-origin: needs the CORS header the Worker sends */
                return;
            }
            if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
            fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(noop);
        } catch (e) {}
    }
    window.kTrack = send;

    /* ---- page view ---- */
    send('pageview');

    /* ---- time on page (only while the tab is visible) + scroll depth ---- */
    var visMs = 0, last = document.hidden ? null : Date.now();
    function tick() { if (last) { visMs += Date.now() - last; last = document.hidden ? null : Date.now(); } }
    function flushTime() { tick(); var s = Math.round(visMs / 1000); if (s >= 1) { send('engage', '', s); visMs = 0; } }
    document.addEventListener('visibilitychange', function () { if (document.hidden) { flushTime(); last = null; } else { last = Date.now(); } });
    window.addEventListener('pagehide', flushTime);
    var marks = { 25: 0, 50: 0, 75: 0, 100: 0 }, ticking = false;
    function onScroll() {
        if (ticking) return; ticking = true;
        requestAnimationFrame(function () {
            ticking = false;
            var h = Math.max(document.documentElement.scrollHeight, 1), pct = ((window.scrollY || window.pageYOffset) + window.innerHeight) / h * 100;
            [25, 50, 75, 100].forEach(function (m) { if (!marks[m] && pct >= m - 1) { marks[m] = 1; send('scroll', m); } });
        });
    }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    /* ---- videos: plays, completions, watched seconds, full screen ---- */
    function vid(v) { var s = v.getAttribute('src') || v.currentSrc || ''; return s.split('/').pop().replace(/\.mp4.*$/, ''); }
    document.querySelectorAll('video').forEach(function (v) {
        var played = {}, watched = 0, lastT = null, cur = '';   /* cur = the part being played (the page switches src before 'ended' reaches us) */
        function flushWatch() { if (watched >= 1) { send('v_watch', cur || vid(v), watched); watched = 0; } }
        v.addEventListener('play', function () { var k = vid(v); if (k !== cur) { flushWatch(); cur = k; } if (!played[k]) { played[k] = 1; send('v_play', k); } lastT = v.currentTime; });
        v.addEventListener('timeupdate', function () { if (lastT !== null) { var d = v.currentTime - lastT; if (d > 0 && d < 1.5) watched += d; } lastT = v.currentTime; });
        v.addEventListener('pause', flushWatch);
        v.addEventListener('ended', function () { send('v_end', cur || vid(v)); flushWatch(); });
        v.addEventListener('seeking', function () { lastT = null; });
        window.addEventListener('pagehide', flushWatch);
    });
    function onFs() { var el = document.fullscreenElement || document.webkitFullscreenElement; if (el && el.tagName === 'VIDEO') send('v_fs', vid(el)); }
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);

    /* ---- clicks on anything marked data-track="event" (optional data-track-label) ---- */
    document.addEventListener('click', function (ev) {
        var el = ev.target.closest && ev.target.closest('[data-track]');
        if (!el) return;
        var label = el.getAttribute('data-track-label');
        if (label == null && el.tagName === 'A') label = (el.getAttribute('href') || '').replace(/^#/, '').slice(0, 30);
        if (label == null && el.getAttribute('data-src')) label = el.getAttribute('data-src').split('/').pop().replace(/\.mp4.*$/, '');
        send(el.getAttribute('data-track'), label);
    }, true);
})();
