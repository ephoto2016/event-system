<?php
/* Copy to config.php (next to collect.php / stats.php) for a classic PHP host. Generate the hash with:
   php -r 'echo password_hash("YOUR-PASSWORD", PASSWORD_BCRYPT);' */
return [
    'admin_hash'    => 'PUT-BCRYPT-HASH-HERE',
    'tz'            => 'Asia/Jerusalem',
    'trust_proxy'   => false,
    'bot_filter'    => true,
    'rate_per_hour' => 400,
    'data_dir'      => '',
];
