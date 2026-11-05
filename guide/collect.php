<?php
/* Receives anonymous page events from assets/track.js and stores them in data/stats.sqlite. Always answers 204. */
declare(strict_types=1);
define('KESHER', 1);
require __DIR__ . '/lib.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function done(int $code = 204): void { http_response_code($code); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') done(405);
$cfg = k_config();
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
if ($cfg['bot_filter'] && ($ua === '' || preg_match('/bot|crawl|spider|headless|preview|facebookexternalhit|whatsapp|slack|telegram|curl|wget|python|monitor/i', $ua))) done();

$raw = file_get_contents('php://input', false, null, 0, 4097);
if ($raw === false || $raw === '' || strlen($raw) > 4096) done();
$j = json_decode($raw, true);
if (!is_array($j)) done();

$allowed = ['pageview', 'engage', 'scroll', 'v_play', 'v_end', 'v_watch', 'v_fs', 'share_click', 'share_done', 'share_wa', 'share_cancel', 'share_fail',
            'teaser_download', 'contact_wa', 'contact_call', 'theme', 'nav', 'part'];
$e = (string) ($j['e'] ?? '');
if (!in_array($e, $allowed, true)) done();

/* keep only harmless characters and cap the length of every text field */
function clean($v, int $n): string {
    $v = is_scalar($v) ? (string) $v : '';
    $v = preg_replace('/[^\p{L}\p{N} _\-.:\/]/u', '', $v) ?? '';
    return mb_substr($v, 0, $n);
}
$val = isset($j['v']) && is_numeric($j['v']) ? max(0, min(86400, (int) $j['v'])) : null;
$dev = in_array($j['d'] ?? '', ['phone', 'tablet', 'desktop'], true) ? $j['d'] : '';
$ori = in_array($j['o'] ?? '', ['p', 'l'], true) ? $j['o'] : '';
$th = in_array($j['th'] ?? '', ['dark', 'light'], true) ? $j['th'] : '';

try {
    $db = k_db();
    $vh = k_visitor();
    $now = time();
    $cnt = (int) $db->query("SELECT COUNT(*) FROM ev WHERE vh = " . $db->quote($vh) . " AND ts > " . ($now - 3600))->fetchColumn();
    if ($cnt >= (int) $cfg['rate_per_hour']) done();
    $st = $db->prepare('INSERT INTO ev(ts, e, s, vh, l, v, src, ref, d, o, lang, th, r, p) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute([$now, $e, clean($j['s'] ?? '', 24), $vh, clean($j['l'] ?? '', 40), $val, clean($j['src'] ?? '', 24), clean($j['ref'] ?? '', 60),
                  $dev, $ori, clean($j['lang'] ?? '', 5), $th, !empty($j['r']) ? 1 : 0, clean($j['p'] ?? '', 80)]);
} catch (Throwable $t) { /* never break the page because of statistics */ }
done();
