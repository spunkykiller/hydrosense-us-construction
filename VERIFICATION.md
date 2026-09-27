# Verification Report

Tested on 27 September 2026. These are package and controlled integration checks, not proof of live advertising performance or production readiness.

## Passed Locally

- All six pages at 320, 390, 768, 1024, 1440 and 1920 pixels: 36 browser cases. No horizontal overflow, JavaScript page errors, missing referenced local media or failed images. Pages rendered nonblank.
- Automated axe WCAG 2 A/AA and WCAG 2.1 AA scans: zero reported violations in those cases. This is not a complete manual accessibility certification.
- Responsive layout, reduced motion, keyboard focus, image loading, domain-root and subdirectory hosting, readable booking fallback without JavaScript, and readable fallback when React is unavailable.
- Standalone PHP/SQLite: durable capture, submission deduplication, validation, inquiry consent, origin restrictions, payload limits, honeypot, rate limiting, authenticated export, deletion and maintenance.
- Real local WordPress with the official SQLite Integration plugin: REST capture, duplicate retry, invalid input/origin rejection, administrator-only nonce-protected export and deletion. The client's MySQL/MariaDB host has not been tested.
- Controlled browser events: no advertising events before opt-in; one PageView after opt-in; Lead only after actual local durable capture; one Schedule from the correct Calendly frame/origin; unrelated messages and repeated completion messages rejected; completion deduplication survives tab reload.
- Inquiry failure remains an honest retry state, with no false saved-success or automatic booking navigation. Advertising rejection does not prevent inquiry or booking.
- Safe Calendly prefill and campaign/industry attribution; ad-set and ad identifiers mapped into supported UTM content. Contact information is not put into advertising URLs or browser event parameters.
- Optional CAPI payload hashing and browser/server event ID alignment checked without sending a live Meta request. CAPI remains disabled by default.
- Fresh npm dependency installation and build tested in the firefighter repository. Every repository uses the same build code and includes ready-built frontend output.

Evidence summaries are in `verification/`. Tests use synthetic records and controlled Calendly messages. No real appointment was made. No Meta or Calendly settings were changed.

## Performance Scope

The local performance measurements in `verification/experience.json` use unthrottled headless Chromium, a 390-pixel viewport and reduced motion. They are not field Core Web Vitals, low-end-device or cellular-network benchmarks. Image savings in `build-report.json` compare referenced originals with their largest WebP variants, not total bytes for all responsive variants.

React, fonts and referenced assets are served locally. Unused Babel/runtime transpilation and redundant self-fetching were removed. Above-the-fold media is prioritized; below-the-fold images are lazy loaded. These changes cannot guarantee lower CPA, improved ROI or higher engagement.

## Client Production Checks Still Required

1. Approve product and safety claims, statistics, affiliations, illustrative reports and pilot wording in `CONTENT_REVIEW.md`.
2. Configure HTTPS hosting, an approved privacy notice/version, retention policy, origin allowlist and the client-owned inquiry backend. Protect backups and server-only credentials.
3. Set `site-config.js` for the actual production origin and endpoint. Defaults intentionally disable production advertising and inquiry capture in review deployments.
4. Test storage/export/deletion on the real server. Check server capacity, rate limits, database persistence, permissions and scheduled retention maintenance.
5. Verify the real Calendly embed and mobile booking completion, duration and source attribution. Sirisha must correct the calendar duration separately; website wording remains ten minutes.
6. Check the product dataset's policies/restrictions and consent implementation. Check for duplicate theme/tag-manager Pixels, then verify PageView, saved Lead and Schedule in Meta Test Events.
7. If CAPI is authorized, supply a server-only credential and current Graph API version. Verify delivery, browser/server deduplication and retry processing. Browser-only Schedule is not trusted server-side verification.
8. Test external booking fallback separately. Its completed bookings, cross-device activity, cancellations and blocked scripts are not fully observable here.

## Packaging and Publishing

Ready-to-upload public files are in `dist/`; source, backend packages and documentation are outside that public output. Original input files are preserved and their hashes recorded in `source/ORIGINAL_HASHES.json`.

The handover excludes Git internals, environment files, local credentials, databases, logs, dependencies, unused export screenshots/uploads and private test records. Original export inputs remain preserved locally; unused screenshots are not needed for a rebuild. Git remotes use credential-free HTTPS URLs. Refer to the combined handover's manifest for package SHA-256 hashes and publication commit IDs.

Vercel URLs are internal review deployments only, with production advertising disabled. Vercel Hobby's commercial-use restrictions are not waived merely by calling a link an internal preview. The client should deploy to appropriately licensed hosting before campaign launch.
