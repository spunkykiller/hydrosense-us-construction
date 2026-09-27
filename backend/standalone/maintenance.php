<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require_once __DIR__ . '/../common.php';
if (is_file(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
$db = new PDO('sqlite:' . hs_config('HS_DB_PATH'), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$days = max(1, min(730, (int) hs_config('HS_RETENTION_DAYS', '90')));
$stmt = $db->prepare('DELETE FROM leads WHERE created < ?'); $stmt->execute([time() - $days * 86400]);
$stmt = $db->prepare('DELETE FROM rate_limits WHERE expires < ?'); $stmt->execute([time()]);
if (hs_config('HS_CAPI_ENABLED') === '1') {
    foreach ($db->query('SELECT id,body FROM leads WHERE capi=0 ORDER BY created LIMIT 100')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $lead = json_decode($row['body'], true);
        if (strtotime($lead['createdAt']) < time() - 6 * 86400) continue;
        if (hs_send_capi($lead)) { $stmt = $db->prepare('UPDATE leads SET capi=1 WHERE id=?'); $stmt->execute([$row['id']]); }
    }
}
echo "Maintenance complete.\n";
