<?php
declare(strict_types=1);
require_once __DIR__ . '/../common.php';
if (is_file(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json');

function hs_reply(int $status, array $data): never { http_response_code($status); echo json_encode($data); exit; }
function hs_db(): PDO {
    $path = hs_config('HS_DB_PATH');
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? __DIR__);
    $parent = realpath(dirname($path));
    if (!$parent || !is_writable($parent) || ($root && str_starts_with(strtolower(str_replace('\\', '/', $parent)) . '/', strtolower(str_replace('\\', '/', $root)) . '/'))) throw new RuntimeException('Private storage is not configured.');
    $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, body TEXT NOT NULL, created INTEGER NOT NULL, capi INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL)');
    $days = max(1, min(730, (int) hs_config('HS_RETENTION_DAYS', '90')));
    $stmt = $db->prepare('DELETE FROM leads WHERE created < ?'); $stmt->execute([time() - $days * 86400]);
    $stmt = $db->prepare('DELETE FROM rate_limits WHERE expires < ?'); $stmt->execute([time()]);
    return $db;
}
function hs_rate(PDO $db): bool {
    $secret = hs_config('HS_RATE_SECRET');
    if (strlen($secret) < 32 || str_contains($secret, 'REPLACE_WITH')) throw new RuntimeException('Rate limit secret is not configured.');
    $bucket = (string) floor(time() / 600);
    $id = hash_hmac('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ':' . $bucket, $secret);
    $stmt = $db->prepare('INSERT INTO rate_limits (id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits');
    $stmt->execute([$id, time() + 600]);
    return (int) $stmt->fetchColumn() <= 15;
}
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $origins = array_filter(array_map('trim', explode(',', hs_config('HS_ALLOWED_ORIGINS'))));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        if (!in_array($origin, $origins, true)) hs_reply(403, ['error' => 'Origin not allowed.']);
        header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS'); header('Access-Control-Allow-Headers: Content-Type');
    }
    if ($method === 'OPTIONS') { http_response_code(204); exit; }
    if (isset($_GET['admin'])) {
        $token = hs_config('HS_ADMIN_TOKEN');
        if (strlen($token) < 32 || str_contains($token, 'REPLACE_WITH') || !hash_equals('Bearer ' . $token, $_SERVER['HTTP_AUTHORIZATION'] ?? '')) hs_reply(401, ['error' => 'Unauthorized.']);
        $db = hs_db();
        if ($method === 'GET' && $_GET['admin'] === 'export') {
            $records = $db->query('SELECT body FROM leads ORDER BY created DESC')->fetchAll(PDO::FETCH_COLUMN);
            header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="hydrosense-inquiries.csv"');
            hs_csv(array_map(fn($body) => json_decode($body, true), $records), fopen('php://output', 'w')); exit;
        }
        if ($method === 'DELETE' && $_GET['admin'] === 'delete') {
            $leadId = (string) ($_GET['leadId'] ?? '');
            if ($leadId === '') hs_reply(422, ['error' => 'Lead identifier required.']);
            $stmt = $db->prepare('DELETE FROM leads WHERE id = ?'); $stmt->execute([$leadId]);
            hs_reply(200, ['deleted' => $stmt->rowCount()]);
        }
        hs_reply(405, ['error' => 'Unsupported administrative operation.']);
    }
    if ($method !== 'POST') hs_reply(405, ['error' => 'POST required.']);
    if ($origin === '' || !in_array($origin, $origins, true)) hs_reply(403, ['error' => 'Origin required.']);
    if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) hs_reply(415, ['error' => 'JSON required.']);
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    if ($raw === false || strlen($raw) > 16384) hs_reply(413, ['error' => 'Payload too large.']);
    $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($input)) hs_reply(422, ['error' => 'JSON object required.']);
    $lead = hs_validate($input, $origins);
    $db = hs_db();
    if (!hs_rate($db)) hs_reply(429, ['error' => 'Please try again later.']);
    $stmt = $db->prepare('SELECT body FROM leads WHERE request_id = ?'); $stmt->execute([$lead['submissionId']]);
    $existing = $stmt->fetchColumn();
    if ($existing) {
        $prior = json_decode($existing, true);
        hs_reply(200, ['saved' => true, 'leadId' => $prior['leadId'], 'eventId' => $prior['eventId'], 'duplicate' => true]);
    }
    $lead['leadId'] = bin2hex(random_bytes(16));
    $payload = json_encode($lead, JSON_THROW_ON_ERROR);
    $stmt = $db->prepare('INSERT INTO leads (id,request_id,body,created,capi) VALUES (?,?,?,?,?)');
    try { $stmt->execute([$lead['leadId'], $lead['submissionId'], $payload, time(), hs_capi_payload($lead) ? 0 : 1]); }
    catch (PDOException $error) {
        if ($error->getCode() !== '23000') throw $error;
        $find = $db->prepare('SELECT body FROM leads WHERE request_id=?'); $find->execute([$lead['submissionId']]);
        $prior = json_decode((string) $find->fetchColumn(), true);
        if (!$prior) throw $error;
        hs_reply(200, ['saved' => true, 'leadId' => $prior['leadId'], 'eventId' => $prior['eventId'], 'duplicate' => true]);
    }
    // Conversion delivery cannot undo a successfully saved inquiry.
    if (hs_send_capi($lead)) { $stmt = $db->prepare('UPDATE leads SET capi=1 WHERE id=?'); $stmt->execute([$lead['leadId']]); }
    hs_reply(201, ['saved' => true, 'leadId' => $lead['leadId'], 'eventId' => $lead['eventId']]);
} catch (InvalidArgumentException|JsonException $error) { hs_reply(422, ['error' => $error->getMessage()]); }
catch (Throwable $error) { error_log('HydroSense inquiry backend failed: ' . get_class($error)); hs_reply(503, ['error' => 'Inquiry storage is unavailable.']); }
