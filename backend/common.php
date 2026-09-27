<?php
declare(strict_types=1);

function hs_config(string $key, string $default = ''): string {
    return defined($key) ? (string) constant($key) : (getenv($key) ?: $default);
}

function hs_validate(array $input, array $origins): array {
    $industry = (string) ($input['industry'] ?? '');
    if (!in_array($industry, ['firefighters', 'mining', 'construction'], true)) throw new InvalidArgumentException('Invalid industry.');
    $result = ['industry' => $industry];
    foreach (['submissionId', 'eventId', 'firstName', 'lastName', 'email', 'phone', 'organization', 'privacyVersion'] as $key) {
        if (isset($input[$key]) && !is_string($input[$key])) throw new InvalidArgumentException('Invalid field type.');
        $value = trim((string) ($input[$key] ?? ''));
        if (strlen($value) > 255 || preg_match('/[\x00-\x1F<>]/', $value)) throw new InvalidArgumentException('Invalid field.');
        $result[$key] = $value;
    }
    if (!preg_match('/^[a-zA-Z0-9-]{20,100}$/', $result['submissionId']) || $result['eventId'] !== 'lead-' . $result['submissionId']) throw new InvalidArgumentException('Invalid submission identifier.');
    if ($result['firstName'] === '' || $result['organization'] === '' || !filter_var($result['email'], FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Name, work email and organization are required.');
    if (($input['inquiryConsent'] ?? false) !== true) throw new InvalidArgumentException('Inquiry consent is required.');
    if (!empty($input['website'])) throw new InvalidArgumentException('Submission rejected.');
    if ($result['privacyVersion'] === '' || $result['privacyVersion'] === 'pending') throw new InvalidArgumentException('Privacy notice has not been configured.');
    $result['email'] = strtolower($result['email']);
    $result['inquiryConsent'] = true;
    $result['adConsent'] = ($input['adConsent'] ?? false) === true;
    $url = parse_url((string) ($input['sourceUrl'] ?? ''));
    $origin = isset($url['scheme'], $url['host']) ? $url['scheme'] . '://' . $url['host'] . (isset($url['port']) ? ':' . $url['port'] : '') : '';
    if (!in_array($origin, $origins, true) || isset($url['user'], $url['pass']) || !in_array($url['scheme'] ?? '', ['http', 'https'], true)) throw new InvalidArgumentException('Invalid page origin.');
    $result['sourceUrl'] = $origin . ($url['path'] ?? '/');
    $result['attribution'] = [];
    $attribution = $input['attribution'] ?? [];
    if (!is_array($attribution)) throw new InvalidArgumentException('Invalid attribution.');
    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campaign_id', 'adset_id', 'ad_id'] as $key) {
        if (!isset($attribution[$key])) continue;
        if (!is_string($attribution[$key]) || strlen($attribution[$key]) > 255 || preg_match('/[\x00-\x1F<>@]/', $attribution[$key])) throw new InvalidArgumentException('Invalid attribution field.');
        $result['attribution'][$key] = $attribution[$key];
    }
    $result['matching'] = [];
    if ($result['adConsent'] && is_array($input['matching'] ?? null)) {
        foreach (['fbp', 'fbc'] as $key) {
            $value = $input['matching'][$key] ?? '';
            if (is_string($value) && preg_match('/^fb\.\d+\.\d+\.[A-Za-z0-9_-]{1,500}$/', $value)) $result['matching'][$key] = $value;
        }
    }
    $result['createdAt'] = gmdate('c');
    return $result;
}

function hs_capi_payload(array $lead): ?array {
    if (!$lead['adConsent'] || hs_config('HS_CAPI_ENABLED') !== '1' || hs_config('HS_CAPI_TOKEN') === '') return null;
    $user = ['em' => [hash('sha256', strtolower(trim($lead['email'])))]];
    if ($lead['phone'] !== '' && preg_match('/^\+\d{7,15}$/', $lead['phone'])) $user['ph'] = [hash('sha256', substr($lead['phone'], 1))];
    foreach (['fbp', 'fbc'] as $key) if (!empty($lead['matching'][$key])) $user[$key] = $lead['matching'][$key];
    $event = [
        'event_name' => 'Lead', 'event_time' => strtotime($lead['createdAt']), 'event_id' => $lead['eventId'],
        'action_source' => 'website', 'event_source_url' => $lead['sourceUrl'], 'user_data' => $user,
        'custom_data' => ['industry' => $lead['industry']]
    ];
    $payload = ['data' => [$event]];
    if (hs_config('HS_CAPI_TEST_CODE') !== '') $payload['test_event_code'] = hs_config('HS_CAPI_TEST_CODE');
    return $payload;
}

function hs_send_capi(array $lead): bool {
    $payload = hs_capi_payload($lead);
    if ($payload === null) return true;
    $version = hs_config('HS_GRAPH_VERSION');
    $pixel = hs_config('HS_PIXEL_ID', '743509325171589');
    if (!preg_match('/^v\d+\.\d+$/', $version) || !preg_match('/^\d+$/', $pixel) || !function_exists('curl_init')) return false;
    $curl = curl_init('https://graph.facebook.com/' . $version . '/' . $pixel . '/events');
    curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . hs_config('HS_CAPI_TOKEN')], CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 2, CURLOPT_TIMEOUT => 4]);
    $body = curl_exec($curl); $code = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
    $response = is_string($body) ? json_decode($body, true) : null;
    return $code >= 200 && $code < 300 && is_array($response) && (int) ($response['events_received'] ?? 0) === 1;
}

function hs_csv(array $records, $stream): void {
    $headers = ['leadId', 'createdAt', 'industry', 'firstName', 'lastName', 'email', 'phone', 'organization', 'inquiryConsent', 'adConsent', 'privacyVersion', 'sourceUrl', 'attribution'];
    fputcsv($stream, $headers, ',', '"', '');
    foreach ($records as $record) {
        $row = [];
        foreach ($headers as $key) {
            $value = $record[$key] ?? '';
            if (is_array($value)) $value = json_encode($value);
            elseif (is_bool($value)) $value = $value ? 'true' : 'false';
            $value = (string) $value;
            // Prevent spreadsheet formula execution on exported user-controlled text.
            if (preg_match('/^[=+@\-\t\r]/', $value)) $value = "'" . $value;
            $row[] = $value;
        }
        fputcsv($stream, $row, ',', '"', '');
    }
}
