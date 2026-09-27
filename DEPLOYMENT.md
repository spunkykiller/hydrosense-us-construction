# Universal Deployment and Client Responsibilities

## Static Frontend: Any Website Host

Upload the root HTML, JS and CSS files together with `assets/` and `vendor/`. Keep their relative directory structure. Do not upload `source/`, `tools/`, `node_modules/`, `.git/`, private configuration, tests or databases to the public website.

Suggested client paths: `/hydrosense/firefighters/`, `/hydrosense/mining/`, `/hydrosense/construction/`. Each folder has its own `index.html` and `book-a-meeting.html`. Root-domain hosting also works. Configure `industryUrls` in `site-config.js` with the client's final URLs; internal review links are not client production URLs.

For WordPress, deploy these as standalone directories rather than pasting a full HTML document into an editor block. Check rewrite rules so these folders are served directly. A CMS template integration is also possible but must retain all assets, configuration, consent and conversion logic.

DNS only maps a hostname to a service. It does not provide PHP, a database, backups or application hosting. The client chooses and operates those services. HTTPS is required in production.

## Shared Backend: WordPress

1. Use PHP 8.2+ with cURL. Copy `backend/wordpress/` into `wp-content/plugins/hydrosense-inquiries/`; it contains the shared `common.php`.
2. In `wp-config.php`, before the final bootstrap, define `HS_ALLOWED_ORIGINS` as the comma-separated exact origins of the three sites (no trailing slash), and optionally `HS_RETENTION_DAYS` (default 90).
3. Activate **HydroSense Inquiry Capture**. This creates one dedicated table for all industries.
4. Set each frontend `leadEndpoint` to `https://CLIENT-HOST/wp-json/hydrosense/v1/inquiries`.
5. Export/delete inquiries under **Tools > HydroSense Inquiries**, restricted to administrators and nonce-protected.
6. Configure a real server cron to run WordPress cron reliably. Hourly maintenance applies retention and retries enabled CAPI delivery. Traffic-only WP-Cron is not a reliable schedule.
7. Back up the database privately, restrict administrator access and account for copies in the client's deletion/retention process.

The origin allowlist, validation, honeypot and rate limit reduce abuse but are not proof of a legitimate person. Add host-level bot/rate controls for sustained abuse. If a reverse proxy is used, configure it correctly; the backend does not trust arbitrary forwarded IP headers.

## Shared Backend: Standalone PHP

1. Use PHP 8.2+ with PDO SQLite and a SQLite version supporting RETURNING (3.35+); cURL is required only for optional CAPI.
2. Upload `backend/common.php` and `backend/standalone/` to the client application host. Keep `config.local.php` server-side and ensure PHP is executed, never served as text.
3. Copy `config.example.php` to `config.local.php` ON THE SERVER. Set `HS_DB_PATH` to an absolute file path in an existing writable directory OUTSIDE the public document root, on persistent storage.
4. Generate independent random administrative and rate-limit secrets, for example `php -r "echo bin2hex(random_bytes(32));"`. Replace all placeholders. Set exact `HS_ALLOWED_ORIGINS` and retention days.
5. Set the frontend endpoint to `https://CLIENT-HOST/backend/standalone/api.php`.
6. Schedule `php /absolute/path/backend/standalone/maintenance.php` hourly. Secure database, WAL/SHM files and backups; the public website must never serve them.
7. Export using an authenticated GET to `api.php?admin=export` with `Authorization: Bearer ADMIN_SECRET`. Delete a lead with an authenticated DELETE to `api.php?admin=delete&leadId=OPAQUE_ID`. Never put the secret in URLs or frontend configuration.

Static-only hosting, including a static Vercel site, cannot execute this PHP backend. Connect the pages to the client-owned PHP/WordPress backend on another suitable host. Do not store inquiries in temporary serverless filesystem storage.

## Production Frontend Configuration

Set `mode: 'production'`, exact `productionOrigins`, the lead endpoint, approved `privacyUrl`, and a real version/date in `privacyVersion`. Keep Pixel ID **743509325171589**, the matching industry, and Sirisha's booking URL. Use `consentMode: 'external'` only if the client CMP calls `HydroSense.setAdvertisingConsent(true/false)` for grants and withdrawals. The default built-in opt-in control does not fire advertising events before consent.

Contact-processing permission is separate from advertising consent. Blocking advertising must not block inquiry capture or booking. Do not enable duplicate Pixel scripts, automatic form scraping or automatic health-data collection through another integration.

## Optional Lead CAPI

Configure `HS_CAPI_ENABLED=1`, `HS_CAPI_TOKEN`, `HS_PIXEL_ID`, a currently supported `HS_GRAPH_VERSION` and initially `HS_CAPI_TEST_CODE` in server configuration only. Test delivery and deduplication before removing the test code. Email is normalized and SHA-256 hashed; phone is sent only when entered with an explicit international country code. No health measurements are sent.

Only consented, durably stored inquiries can generate server Lead events. Browser and server use the same event name and event ID. Failed delivery stays pending and can be retried for up to six days; maintenance does not invent a newer event time. Browser booking messages do not authorize server Schedule events.

## Internal GitHub / Vercel Review

The three existing repositories remain independent. Vercel serves only the frontend and defaults to review mode. No production lead database is attached to review links. Vercel Hobby is restricted to non-commercial personal use; internal sharing does not itself establish eligibility. Confirm an eligible plan/hosting arrangement rather than assuming review use is exempt: https://vercel.com/docs/plans/hobby . No automatic upgrade is part of this handover.

The included `vercel.json` selects the committed frontend-only `dist/` output and skips installation/build steps for review deployment. It keeps booking aliases working. Backend/source/tooling files are not inside that public output. When editing the root configuration, run `npm run build` to update the deployed `dist/site-config.js` too. The client can also upload only the contents of `dist/` to its static website, with documentation and backend installed separately.
