<?php
/* Statistics dashboard for the guide page (password protected). Open /stats.php */
declare(strict_types=1);
define('KESHER', 1);
require __DIR__ . '/lib.php';

$cfg = k_config();
date_default_timezone_set($cfg['tz']);
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'");

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $https]);
session_name('kstats');
session_start();

function h($v): string { return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

/* ---------------- login ---------------- */
if (empty($cfg['admin_hash'])) { http_response_code(503); echo '<!doctype html><meta charset="utf-8"><p dir="rtl">לא הוגדרה סיסמה. צרו את config.php (ראו README).</p>'; exit; }
if (isset($_GET['logout'])) { $_SESSION = []; session_destroy(); header('Location: stats.php'); exit; }
$err = '';
if (empty($_SESSION['ok'])) {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $db = k_db(); $vh = k_visitor(); $now = time();
        $db->exec('DELETE FROM fails WHERE ts < ' . ($now - 3600));
        $n = (int) $db->query('SELECT COUNT(*) FROM fails WHERE vh = ' . $db->quote($vh) . ' AND ts > ' . ($now - 600))->fetchColumn();
        if ($n >= 8) { $err = 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'; }
        elseif (!hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) { $err = 'הבקשה פגה, נסו שוב.'; }
        elseif (password_verify((string) ($_POST['pw'] ?? ''), $cfg['admin_hash'])) { session_regenerate_id(true); $_SESSION['ok'] = 1; header('Location: stats.php'); exit; }
        else { $db->prepare('INSERT INTO fails(vh, ts) VALUES(?,?)')->execute([$vh, $now]); sleep(1); $err = 'סיסמה שגויה.'; }
    }
    ?><!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>סטטיסטיקה · כניסה</title><link rel="stylesheet" href="assets/fonts.css">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1120;color:#f8fafc;font-family:'Assistant',system-ui,sans-serif}
form{background:#1e293b;padding:28px;border-radius:18px;width:min(92vw,340px);display:grid;gap:14px;border:1px solid rgba(255,255,255,.1)}
h1{margin:0;font-size:1.3rem}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:#0f172a;color:#fff}
button{background:#10b981;color:#062b14;font-weight:800;border:0;cursor:pointer}.e{color:#fca5a5;margin:0}</style></head>
<body><form method="post"><h1>סטטיסטיקה · מערך הלמידה</h1><?php if ($err): ?><p class="e"><?= h($err) ?></p><?php endif; ?>
<input type="password" name="pw" placeholder="סיסמה" autocomplete="current-password" autofocus required>
<input type="hidden" name="csrf" value="<?= h($_SESSION['csrf']) ?>"><button>כניסה</button></form></body></html><?php
    exit;
}

/* ---------------- data ---------------- */
$db = k_db();
$range = in_array($_GET['range'] ?? '', ['today', '7', '30', 'all'], true) ? $_GET['range'] : '7';
$todayStart = (new DateTime('today'))->getTimestamp();
$from = ['today' => $todayStart, '7' => $todayStart - 6 * 86400, '30' => $todayStart - 29 * 86400, 'all' => 0][$range];
$off = (new DateTime('now'))->getOffset();   /* seconds east of UTC, for day buckets */

function q(PDO $db, string $sql, array $p = []): array { $s = $db->prepare($sql); $s->execute($p); return $s->fetchAll(); }
function one(PDO $db, string $sql, array $p = []) { $s = $db->prepare($sql); $s->execute($p); return $s->fetchColumn(); }
function sess(PDO $db, string $where, int $from): int { return (int) one($db, "SELECT COUNT(DISTINCT s) FROM ev WHERE ts >= ? AND ($where)", [$from]); }

if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="stats-' . ($_GET['csv'] === 'events' ? 'events' : 'days') . '-' . date('Ymd') . '.csv"');
    $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
    $safe = fn($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'" . $v : $v;   /* no spreadsheet formulas from stored text */
    if ($_GET['csv'] === 'events') {
        fputcsv($out, ['time', 'event', 'session', 'label', 'value', 'src', 'ref', 'device', 'orient', 'lang', 'theme', 'returning', 'path']);
        foreach (q($db, 'SELECT * FROM ev WHERE ts >= ? ORDER BY ts', [$from]) as $r) fputcsv($out, [date('Y-m-d H:i:s', (int) $r['ts']), $r['e'], $r['s'], $safe($r['l']), $r['v'], $safe($r['src']), $safe($r['ref']), $r['d'], $r['o'], $r['lang'], $r['th'], $r['r'], $r['p']]);
    } else {
        fputcsv($out, ['day', 'views', 'visitors', 'shares_done']);
        foreach (q($db, "SELECT strftime('%Y-%m-%d', ts + ?, 'unixepoch') day, SUM(e='pageview') v, COUNT(DISTINCT CASE WHEN e='pageview' THEN vh END) u, SUM(e IN ('share_done','share_wa')) sh FROM ev WHERE ts >= ? GROUP BY day ORDER BY day", [$off, $from]) as $r) fputcsv($out, [$r['day'], $r['v'], $r['u'], $r['sh']]);
    }
    exit;
}

$views = (int) one($db, "SELECT COUNT(*) FROM ev WHERE e='pageview' AND ts >= ?", [$from]);
$visitors = (int) one($db, "SELECT COUNT(DISTINCT vh) FROM ev WHERE e='pageview' AND ts >= ?", [$from]);
$sessions = sess($db, "e='pageview'", $from);
$retPct = $views ? round(100 * (float) one($db, "SELECT AVG(r) FROM ev WHERE e='pageview' AND ts >= ?", [$from])) : 0;

$times = array_map('intval', array_column(q($db, "SELECT SUM(v) t FROM ev WHERE e='engage' AND ts >= ? GROUP BY s HAVING t > 0", [$from]), 't'));
sort($times); $nt = count($times);
$avgT = $nt ? (int) round(array_sum($times) / $nt) : 0; $medT = $nt ? $times[intdiv($nt, 2)] : 0;
function mmss(int $s): string { return sprintf('%d:%02d', intdiv($s, 60), $s % 60); }

$scrollRows = q($db, "SELECT l, COUNT(DISTINCT s) c FROM ev WHERE e='scroll' AND ts >= ? GROUP BY l", [$from]);
$scroll = ['25' => 0, '50' => 0, '75' => 0, '100' => 0]; foreach ($scrollRows as $r) if (isset($scroll[$r['l']])) $scroll[$r['l']] = (int) $r['c'];

$funnel = [
    'נכנסו לדף' => $sessions,
    'גללו עד 75%' => $scroll['75'],
    'ניגנו סרטון' => sess($db, "e='v_play'", $from),
    'לחצו שיתוף' => sess($db, "e='share_click'", $from),
    'שיתפו בפועל' => sess($db, "e IN ('share_done','share_wa')", $from),
    'יצרו קשר' => sess($db, "e IN ('contact_wa','contact_call')", $from),
];
$base = max(1, $funnel['נכנסו לדף']);

$names = ['tactical-1-radius' => 'תג"מ · חלק 1 (רדיוס)', 'tactical-2-valley' => 'תג"מ · חלק 2 (וואדי)', 'roip-1-routing' => 'RoIP · חלק 1 (ניתוב ידני)',
          'roip-2-site-choice' => 'RoIP · חלק 2 (מעבר אתרים בין כוחות)', 'lionet' => 'ליונט', 'teaser-9x16' => 'טיזר'];
$vids = q($db, "SELECT l, SUM(e='v_play') plays, SUM(e='v_end') ends, SUM(CASE WHEN e='v_watch' THEN v ELSE 0 END) secs, SUM(e='v_fs') fs
                FROM ev WHERE e IN ('v_play','v_end','v_watch','v_fs') AND l <> '' AND ts >= ? GROUP BY l ORDER BY plays DESC", [$from]);

$ev = []; foreach (q($db, "SELECT e, COUNT(*) c FROM ev WHERE ts >= ? GROUP BY e", [$from]) as $r) $ev[$r['e']] = (int) $r['c'];
$sharesDone = ($ev['share_done'] ?? 0) + ($ev['share_wa'] ?? 0);
$fromShare = (int) one($db, "SELECT COUNT(*) FROM ev WHERE e='pageview' AND src='share' AND ts >= ?", [$from]);
$fromShareU = (int) one($db, "SELECT COUNT(DISTINCT vh) FROM ev WHERE e='pageview' AND src='share' AND ts >= ?", [$from]);

$dev = q($db, "SELECT d, COUNT(*) c FROM ev WHERE e='pageview' AND d <> '' AND ts >= ? GROUP BY d ORDER BY c DESC", [$from]);
$ori = q($db, "SELECT o, COUNT(*) c FROM ev WHERE e='pageview' AND d='phone' AND o <> '' AND ts >= ? GROUP BY o", [$from]);
$theme = q($db, "SELECT th, COUNT(*) c FROM ev WHERE e='pageview' AND th <> '' AND ts >= ? GROUP BY th", [$from]);
$refs = q($db, "SELECT CASE WHEN ref <> '' THEN ref WHEN src <> '' THEN 'src=' || src ELSE '(ישיר)' END k, COUNT(*) c FROM ev WHERE e='pageview' AND ts >= ? GROUP BY k ORDER BY c DESC LIMIT 8", [$from]);

/* views per calendar day (DateTime handles daylight-saving changes; adding 86400s would skip or repeat a day) */
$dayFrom = $range === 'all' ? ((int) one($db, 'SELECT MIN(ts) FROM ev') ?: $todayStart) : $from;
$dayFrom = max($dayFrom, $todayStart - 59 * 86400);
$days = [];
$cur = (new DateTime('@' . $dayFrom))->setTimezone(new DateTimeZone($cfg['tz']))->setTime(0, 0);
$end = new DateTime('now', new DateTimeZone($cfg['tz']));
while ($cur <= $end) { $days[$cur->format('Y-m-d')] = ['v' => 0, 'u' => 0, 'sh' => 0]; $cur->modify('+1 day'); }
foreach (q($db, "SELECT strftime('%Y-%m-%d', ts + ?, 'unixepoch') day, SUM(e='pageview') v, COUNT(DISTINCT CASE WHEN e='pageview' THEN vh END) u, SUM(e IN ('share_done','share_wa')) sh FROM ev WHERE ts >= ? GROUP BY day", [$off, $dayFrom]) as $r)
    if (isset($days[$r['day']])) $days[$r['day']] = ['v' => (int) $r['v'], 'u' => (int) $r['u'], 'sh' => (int) $r['sh']];
$maxV = max(1, ...array_column($days, 'v'));

$recent = q($db, "SELECT ts, e, l, d, src FROM ev WHERE e <> 'engage' AND e <> 'scroll' AND e <> 'v_watch' ORDER BY id DESC LIMIT 15");
$evHe = ['pageview' => 'צפייה', 'v_play' => 'הפעלת סרטון', 'v_end' => 'סיום סרטון', 'v_fs' => 'מסך מלא', 'share_click' => 'לחיצת שיתוף', 'share_done' => 'שיתוף הושלם', 'share_wa' => 'שיתוף (קישור)',
         'share_cancel' => 'שיתוף בוטל', 'share_fail' => 'שיתוף נכשל', 'teaser_download' => 'הורדת טיזר', 'contact_wa' => 'קשר בוואטסאפ', 'contact_call' => 'התקשרות', 'theme' => 'החלפת תצוגה', 'nav' => 'ניווט', 'part' => 'בחירת חלק'];
$devHe = ['phone' => 'טלפון', 'tablet' => 'טאבלט', 'desktop' => 'מחשב'];
$rangeHe = ['today' => 'היום', '7' => '7 ימים', '30' => '30 ימים', 'all' => 'הכול'];
function pct(int $a, int $b): string { return $b ? round(100 * $a / $b) . '%' : '–'; }
?><!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>סטטיסטיקה · מערך הלמידה</title><link rel="stylesheet" href="assets/fonts.css">
<style>
:root{--bg:#0b1120;--card:#1e293b;--alt:#0f172a;--tx:#f8fafc;--mu:#a3b1c6;--g:#10b981;--b:#38bdf8;--bd:rgba(255,255,255,.1)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font-family:'Assistant',system-ui,sans-serif;line-height:1.5;padding:12px}
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
.foot{color:var(--mu);font-size:.85rem;margin:14px 0}a{color:var(--b)}
svg{width:100%;display:block}
</style></head><body><main>
<div class="top"><div><h1>סטטיסטיקה · מערך הלמידה</h1><div class="l">נתונים אנונימיים: ללא עוגיות וללא שמירת כתובת IP · אזור זמן <?= h($cfg['tz']) ?></div></div>
<div class="tabs"><?php foreach ($rangeHe as $k => $t): ?><a class="<?= $range === (string) $k ? 'on' : '' ?>" href="?range=<?= h($k) ?>"><?= h($t) ?></a><?php endforeach; ?></div></div>

<div class="grid">
 <div class="card"><div class="k"><?= $views ?></div><div class="l">צפיות בדף</div></div>
 <div class="card"><div class="k"><?= $visitors ?></div><div class="l">מבקרים (לפי יום)</div></div>
 <div class="card"><div class="k"><?= $nt ? h(mmss($avgT)) : '–' ?></div><div class="l">זמן שהייה ממוצע (חציון <?= $nt ? h(mmss($medT)) : '–' ?>)</div></div>
 <div class="card"><div class="k"><?= $sharesDone ?></div><div class="l">שיתופים שהושלמו</div></div>
 <div class="card"><div class="k"><?= $fromShare ?></div><div class="l">כניסות מהשיתופים (<?= $fromShareU ?> מבקרים)</div></div>
 <div class="card"><div class="k"><?= $retPct ?>%</div><div class="l">מבקרים חוזרים</div></div>
</div>

<div class="card" style="margin-bottom:12px"><h2>צפיות לפי יום</h2>
<?php $n = count($days); $bw = 100 / max(1, $n); ?>
<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:150px" role="img" aria-label="צפיות לפי יום">
<?php $i = 0; foreach ($days as $d => $r): $hgt = 34 * $r['v'] / $maxV; ?>
<rect x="<?= round(100 - ($i + 1) * $bw + $bw * .15, 3) ?>" y="<?= round(36 - $hgt, 2) ?>" width="<?= round($bw * .7, 3) ?>" height="<?= round($hgt, 2) ?>" fill="#38bdf8"><title><?= h($d) ?>: <?= $r['v'] ?> צפיות</title></rect>
<?php $i++; endforeach; ?></svg>
<div class="l" style="display:flex;justify-content:space-between"><span><?= h(array_key_first($days)) ?></span><span><?= h(array_key_last($days)) ?></span></div></div>

<div class="two">
 <div class="card"><h2>משפך: מכניסה לפעולה (ביקורים)</h2><table>
 <?php foreach ($funnel as $k => $c): ?>
 <tr><td><?= h($k) ?><div class="bar"><i style="width:<?= round(100 * $c / $base) ?>%"></i></div></td><td class="n"><?= $c ?></td><td class="n"><?= pct($c, $funnel['נכנסו לדף']) ?></td></tr>
 <?php endforeach; ?></table></div>
 <div class="card"><h2>עומק גלילה (ביקורים)</h2><table>
 <?php foreach ($scroll as $k => $c): ?><tr><td>עד <?= h($k) ?>%<div class="bar"><i style="width:<?= round(100 * $c / $base) ?>%"></i></div></td><td class="n"><?= $c ?></td><td class="n"><?= pct($c, $sessions) ?></td></tr><?php endforeach; ?></table></div>
</div>

<div class="card" style="margin-bottom:12px"><h2>סרטונים</h2>
<table><tr><th>סרטון</th><th class="n">הפעלות</th><th class="n">צפו עד הסוף</th><th class="n">שניות צפייה ממוצעות</th><th class="n">מסך מלא</th></tr>
<?php foreach ($vids as $v): $pl = (int) $v['plays']; ?>
<tr><td><?= h($names[$v['l']] ?? $v['l']) ?></td><td class="n"><?= $pl ?></td><td class="n"><?= (int) $v['ends'] ?> (<?= pct((int) $v['ends'], $pl) ?>)</td><td class="n"><?= $pl ? round($v['secs'] / $pl) : '–' ?></td><td class="n"><?= (int) $v['fs'] ?></td></tr>
<?php endforeach; if (!$vids): ?><tr><td colspan="5" class="l">עדיין אין נתונים.</td></tr><?php endif; ?></table></div>

<div class="two">
 <div class="card"><h2>שיתופים</h2><table>
 <tr><td>לחיצות על "שלחו לחבר"</td><td class="n"><?= $ev['share_click'] ?? 0 ?></td></tr>
 <tr><td>שיתוף עם הסרטון הושלם</td><td class="n"><?= $ev['share_done'] ?? 0 ?></td></tr>
 <tr><td>נפתח וואטסאפ עם קישור בלבד</td><td class="n"><?= $ev['share_wa'] ?? 0 ?></td></tr>
 <tr><td>בוטל / נכשל</td><td class="n"><?= ($ev['share_cancel'] ?? 0) ?> / <?= ($ev['share_fail'] ?? 0) ?></td></tr>
 <tr><td>הורדות טיזר</td><td class="n"><?= $ev['teaser_download'] ?? 0 ?></td></tr>
 <tr><td>כניסות שהגיעו משיתוף</td><td class="n"><?= $fromShare ?></td></tr>
 <tr><td>כניסות לכל שיתוף</td><td class="n"><?= $sharesDone ? round($fromShare / $sharesDone, 1) : '–' ?></td></tr>
 <tr><td>פניות לעמנואל (וואטסאפ / טלפון)</td><td class="n"><?= ($ev['contact_wa'] ?? 0) ?> / <?= ($ev['contact_call'] ?? 0) ?></td></tr></table></div>
 <div class="card"><h2>מכשירים ומקורות</h2><table>
 <?php foreach ($dev as $r): ?><tr><td><?= h($devHe[$r['d']] ?? $r['d']) ?></td><td class="n"><?= (int) $r['c'] ?></td><td class="n"><?= pct((int) $r['c'], $views) ?></td></tr><?php endforeach; ?>
 <?php foreach ($ori as $r): ?><tr><td class="l">בטלפון: <?= $r['o'] === 'p' ? 'עומד' : 'שוכב' ?></td><td class="n"><?= (int) $r['c'] ?></td><td></td></tr><?php endforeach; ?>
 <?php foreach ($theme as $r): ?><tr><td class="l">תצוגה <?= $r['th'] === 'dark' ? 'כהה' : 'בהירה' ?></td><td class="n"><?= (int) $r['c'] ?></td><td></td></tr><?php endforeach; ?>
 <tr><th colspan="3">מאיפה הגיעו</th></tr>
 <?php foreach ($refs as $r): ?><tr><td><?= h($r['k']) ?></td><td class="n"><?= (int) $r['c'] ?></td><td></td></tr><?php endforeach; ?></table></div>
</div>

<div class="card"><h2>פעילות אחרונה</h2><table>
<?php foreach ($recent as $r): ?><tr><td><?= h(date('d/m H:i', (int) $r['ts'])) ?></td><td><?= h($evHe[$r['e']] ?? $r['e']) ?></td><td class="l"><?= h($names[$r['l']] ?? $r['l']) ?></td><td class="l"><?= h($devHe[$r['d']] ?? '') ?></td></tr><?php endforeach; ?>
<?php if (!$recent): ?><tr><td class="l">עדיין אין פעילות.</td></tr><?php endif; ?></table></div>

<p class="foot">ייצוא: <a href="?csv=days&amp;range=<?= h($range) ?>">סיכום יומי (CSV)</a> · <a href="?csv=events&amp;range=<?= h($range) ?>">כל האירועים (CSV)</a> · <a href="?logout=1">יציאה</a><br>
"מבקרים (לפי יום)" סופר מבקר פעם אחת בכל יום (המזהה אנונימי ומתחלף מדי יום), ולכן סכום על כמה ימים עשוי לספור את אותו אדם יותר מפעם. בוטים ותצוגות מקדימות של וואטסאפ לא נספרים.</p>
</main></body></html>
