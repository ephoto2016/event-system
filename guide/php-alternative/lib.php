<?php
/* Shared helpers for collect.php and stats.php. Not meant to be opened directly. */
if (!defined('KESHER')) { http_response_code(404); exit; }

function k_config(): array {
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/config.php';
        $c = is_file($f) ? (array) include $f : [];
        $c += ['admin_hash' => '', 'tz' => 'Asia/Jerusalem', 'trust_proxy' => false, 'bot_filter' => true, 'rate_per_hour' => 400, 'data_dir' => ''];
    }
    return $c;
}

/* where the database lives; set 'data_dir' in config.php to a folder OUTSIDE the web root when the server is not Apache (nginx ignores .htaccess) */
function k_data_dir(): string { $d = (string) k_config()['data_dir']; return $d !== '' ? rtrim($d, '/\\') : __DIR__ . '/data'; }

function k_db(): PDO {
    static $db = null;
    if ($db) return $db;
    $dir = k_data_dir();
    if (!is_dir($dir)) { @mkdir($dir, 0750, true); }
    if (!is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    }
    $db = new PDO('sqlite:' . $dir . '/stats.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
    $db->exec('CREATE TABLE IF NOT EXISTS ev(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, e TEXT NOT NULL, s TEXT, vh TEXT, l TEXT, v INTEGER,
               src TEXT, ref TEXT, d TEXT, o TEXT, lang TEXT, th TEXT, r INTEGER, p TEXT)');
    $db->exec('CREATE INDEX IF NOT EXISTS ev_ts ON ev(ts)');
    $db->exec('CREATE INDEX IF NOT EXISTS ev_e_ts ON ev(e, ts)');
    $db->exec('CREATE INDEX IF NOT EXISTS ev_vh_ts ON ev(vh, ts)');
    $db->exec('CREATE TABLE IF NOT EXISTS fails(vh TEXT, ts INTEGER)');
    return $db;
}

/* a secret used only to hash visitors; created on first use and kept in data/ */
function k_secret(): string {
    static $s = null;
    if ($s !== null) return $s;
    $f = k_data_dir() . '/secret.key';
    if (!is_file($f)) { k_db(); @file_put_contents($f, bin2hex(random_bytes(24))); }
    return $s = (string) @file_get_contents($f);
}

function k_ip(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (k_config()['trust_proxy'] && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) { $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]); }
    return $ip;
}

/* anonymous visitor id: hash of IP + browser + day + secret. The IP itself is never stored, and the id changes every day. */
function k_visitor(): string {
    $day = gmdate('Y-m-d');
    return substr(hash('sha256', k_ip() . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '') . '|' . $day . '|' . k_secret()), 0, 16);
}
