<?php
// Copy to config.local.php ON THE CLIENT SERVER ONLY. Never commit real values.
define('HS_ALLOWED_ORIGINS', 'https://www.example.com');
define('HS_DB_PATH', '/home/account/private/hydrosense.sqlite');
define('HS_ADMIN_TOKEN', 'REPLACE_WITH_64_RANDOM_HEX_CHARACTERS');
define('HS_RATE_SECRET', 'REPLACE_WITH_A_DIFFERENT_64_RANDOM_HEX_SECRET');
define('HS_RETENTION_DAYS', '90');
define('HS_CAPI_ENABLED', '0');
define('HS_CAPI_TOKEN', '');
define('HS_PIXEL_ID', '743509325171589');
define('HS_GRAPH_VERSION', '');
define('HS_CAPI_TEST_CODE', '');
