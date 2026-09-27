<?php
/**
 * Plugin Name: HydroSense Inquiry Capture
 * Description: Client-owned business inquiries, consent, attribution and optional Lead CAPI.
 * Version: 1.0.0
 * Requires PHP: 8.2
 */
declare(strict_types=1);
if (!defined('ABSPATH')) exit;
require_once __DIR__ . '/common.php';

function hs_wp_table(): string { global $wpdb; return $wpdb->prefix . 'hydrosense_inquiries'; }
function hs_wp_install(): void {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = hs_wp_table(); $collate = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $table (id varchar(32) NOT NULL, request_id varchar(100) NOT NULL, body longtext NOT NULL, created bigint NOT NULL, capi tinyint NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY request_id (request_id)) $collate;");
    if (!wp_next_scheduled('hs_inquiry_maintenance')) wp_schedule_event(time() + 300, 'hourly', 'hs_inquiry_maintenance');
}
register_activation_hook(__FILE__, 'hs_wp_install');
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('hs_inquiry_maintenance'); });
add_action('hs_inquiry_maintenance', function () {
    global $wpdb; $table = hs_wp_table();
    $days = max(1, min(730, (int) hs_config('HS_RETENTION_DAYS', '90')));
    $wpdb->query($wpdb->prepare("DELETE FROM $table WHERE created < %d", time() - $days * 86400));
    if (hs_config('HS_CAPI_ENABLED') !== '1') return;
    $rows = $wpdb->get_results("SELECT id,body FROM $table WHERE capi=0 ORDER BY created LIMIT 100", ARRAY_A);
    foreach ($rows as $row) {
        $lead = json_decode($row['body'], true);
        if (strtotime($lead['createdAt']) < time() - 6 * 86400) continue;
        if (hs_send_capi($lead)) $wpdb->update($table, ['capi' => 1], ['id' => $row['id']]);
    }
});
add_action('rest_api_init', function () {
    register_rest_route('hydrosense/v1', '/inquiries', [
        'methods' => 'POST',
        'permission_callback' => function (WP_REST_Request $request) {
            $origins = array_filter(array_map('trim', explode(',', hs_config('HS_ALLOWED_ORIGINS'))));
            return in_array($request->get_header('origin'), $origins, true) ? true : new WP_Error('hs_origin', 'Origin not allowed.', ['status' => 403]);
        },
        'callback' => function (WP_REST_Request $request) {
            global $wpdb; $table = hs_wp_table();
            if (strlen($request->get_body()) > 16384) return new WP_Error('hs_large', 'Payload too large.', ['status' => 413]);
            if (!str_starts_with($request->get_header('content-type'), 'application/json')) return new WP_Error('hs_type', 'JSON required.', ['status' => 415]);
            try { $lead = hs_validate($request->get_json_params() ?? [], array_filter(array_map('trim', explode(',', hs_config('HS_ALLOWED_ORIGINS'))))); }
            catch (Throwable $error) { return new WP_Error('hs_invalid', 'Check the required fields and consent.', ['status' => 422]); }
            $key = 'hs_rate_' . hash_hmac('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . ':' . floor(time() / 600), wp_salt('auth'));
            $hits = (int) get_transient($key);
            if ($hits >= 15) return new WP_Error('hs_rate', 'Please try again later.', ['status' => 429]);
            set_transient($key, $hits + 1, 600);
            $body = $wpdb->get_var($wpdb->prepare("SELECT body FROM $table WHERE request_id=%s", $lead['submissionId']));
            if ($body) { $prior = json_decode($body, true); return new WP_REST_Response(['saved' => true, 'leadId' => $prior['leadId'], 'eventId' => $prior['eventId'], 'duplicate' => true], 200); }
            $lead['leadId'] = bin2hex(random_bytes(16));
            $stored = $wpdb->insert($table, ['id' => $lead['leadId'], 'request_id' => $lead['submissionId'], 'body' => wp_json_encode($lead), 'created' => time(), 'capi' => hs_capi_payload($lead) ? 0 : 1]);
            if ($stored === false) {
                $body = $wpdb->get_var($wpdb->prepare("SELECT body FROM $table WHERE request_id=%s", $lead['submissionId']));
                if (!$body) return new WP_Error('hs_storage', 'Inquiry storage is unavailable.', ['status' => 503]);
                $prior = json_decode($body, true); return new WP_REST_Response(['saved' => true, 'leadId' => $prior['leadId'], 'eventId' => $prior['eventId'], 'duplicate' => true], 200);
            }
            if (hs_send_capi($lead)) $wpdb->update($table, ['capi' => 1], ['id' => $lead['leadId']]);
            return new WP_REST_Response(['saved' => true, 'leadId' => $lead['leadId'], 'eventId' => $lead['eventId']], 201);
        }
    ]);
});
// WordPress otherwise permits arbitrary cross-origin REST requests; restrict this route.
add_filter('rest_pre_serve_request', function ($served, $result, $request) {
    if ($request->get_route() !== '/hydrosense/v1/inquiries') return $served;
    header_remove('Access-Control-Allow-Origin'); header_remove('Access-Control-Allow-Credentials');
    $origin = $request->get_header('origin');
    $origins = array_filter(array_map('trim', explode(',', hs_config('HS_ALLOWED_ORIGINS'))));
    if (in_array($origin, $origins, true)) { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
    header('Cache-Control: no-store'); return $served;
}, 20, 3);
add_action('admin_menu', function () {
    add_management_page('HydroSense Inquiries', 'HydroSense Inquiries', 'manage_options', 'hydrosense-inquiries', function () {
        if (!current_user_can('manage_options')) return;
        echo '<div class="wrap"><h1>HydroSense Inquiries</h1><p>Export business inquiries or delete a record by its lead identifier. Default retention: 90 days.</p><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('hs_export'); echo '<input type="hidden" name="action" value="hs_export"><button class="button button-primary">Export CSV</button></form><hr><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('hs_delete'); echo '<input type="hidden" name="action" value="hs_delete"><label>Lead identifier <input name="leadId" required></label> <button class="button">Delete record</button></form></div>';
    });
});
add_action('admin_post_hs_export', function () {
    if (!current_user_can('manage_options')) wp_die('Unauthorized.', '', ['response' => 403]);
    check_admin_referer('hs_export'); global $wpdb; $table = hs_wp_table();
    $rows = $wpdb->get_col("SELECT body FROM $table ORDER BY created DESC");
    nocache_headers(); header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="hydrosense-inquiries.csv"');
    hs_csv(array_map(fn($body) => json_decode($body, true), $rows), fopen('php://output', 'w')); exit;
});
add_action('admin_post_hs_delete', function () {
    if (!current_user_can('manage_options')) wp_die('Unauthorized.', '', ['response' => 403]);
    check_admin_referer('hs_delete'); global $wpdb;
    $wpdb->delete(hs_wp_table(), ['id' => sanitize_text_field(wp_unslash($_POST['leadId'] ?? ''))]);
    wp_safe_redirect(admin_url('tools.php?page=hydrosense-inquiries')); exit;
});
