# HydroSense Website Handover

This package contains an industry-specific landing page, booking page, locally served React runtime, optimized media, client-owned inquiry backend and optional Meta Lead Conversions API integration.

## Start Here

1. Read `DEPLOYMENT.md` and choose the client's hosting integration.
2. Upload the ready-built frontend files. A frontend rebuild is not required.
3. Deploy ONE inquiry backend for all three industry pages.
4. Configure `site-config.js`: production origins, industry, endpoint and approved privacy notice.
5. Complete the launch checklist in `TRACKING.md` and review `VERIFICATION.md`.

The public Pixel ID is **743509325171589**. The package defaults to review mode: no production advertising events and no false inquiry-save success. The client must explicitly configure production mode. Do not install a second Pixel through a WordPress plugin or tag manager on the same pages without removing the duplicate implementation.

On phones, the landing page shows a short industry-specific introduction followed by the emergency photo. Credentials, risk evidence, seasonal context, patch details, awards and pilot information remain visible in the page flow. The original supplied files remain in `source/`; the build applies the mobile hero presentation to the public pages.

**Where inquiries go:** Meta Pixel is measurement, not contact storage. All three pages send inquiries to one client-owned backend only after `leadEndpoint` is configured. The WordPress option stores them in the site's `{prefix}hydrosense_inquiries` table; the standalone PHP option stores them in a private SQLite database at `HS_DB_PATH`. Each record identifies its industry. With the current blank `leadEndpoint`, the static pages do not save inquiries and do not show a false success message. See `DEPLOYMENT.md` for setup and export instructions.

Review-mode booking pages show a local placeholder and an explicit external-calendar link. The live Calendly embed is enabled only in configured production mode, because Calendly can load its own third-party trackers outside this site's consent controls.

## Files

- `index.html`, `book-a-meeting.html`: canonical pages; existing exported filename aliases remain supported.
- `site-config.js`, `hs-client.js`, `hs-enhancements.css`: public configuration, tracking/form integration and responsive improvements.
- `assets/`, `vendor/`, `support.js`: referenced media, fonts and local runtime dependencies.
- `dist/`: frontend-only hosting output; upload its contents for a simple static deployment.
- `backend/`: WordPress and standalone PHP adapters. Never upload secrets or private databases to public folders.
- `source/`, `tools/`, `package.json`: reproducible build inputs. Original supplied source is retained here; deploy the root built pages, not source copies.

## Local Preview / Rebuild

Use Node.js 20+ and run `npm ci`, then `npm run build`. Serve the folder using `node tools/serve.mjs` (default port 8090). Do not use `file://` for runtime testing. For browser tests, run `npx playwright install chromium`, start the server in another terminal, then `npm test`. Set `HS_TEST_BASE_URL` when testing another local port.

No Meta campaigns, ad sets, audiences, Calendly settings or DNS records were modified. The client owns production hosting, privacy decisions, lead storage, backups, endpoint configuration and final production verification.

## Known Limits

Browser-only booking tracking misses external-calendar fallback bookings and can be blocked by privacy settings or browser extensions. Pixel matching cannot identify every visitor. CAPI is disabled until a suitable server-only credential and Graph API version are configured. There is no server-verified Schedule event in this release.

The call is positioned as a free **10-minute introduction about a paid pilot**. Sirisha must ensure her actual event duration matches that wording. Product capabilities, safety statements, ISO claims, statistics and Seattle pilot references need client approval before advertising.

Performance and accessibility improvements do not guarantee lower CPA/CPL, more impressions or higher ROI.
