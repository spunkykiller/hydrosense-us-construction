# Measurement Contract and Launch Checklist

## Events

| Event | Trigger | Primary use |
| --- | --- | --- |
| PageView | Consented navigation on an explicitly allowed production origin | Website exposure |
| Lead | Backend confirms `saved: true` with the expected event ID | Saved business inquiry |
| Schedule | `calendly.event_scheduled` from the actual embedded frame and exact Calendly origin | Completed booking, primary planned conversion |

Clicking a CTA, choosing a calendar time or showing a local thank-you state is not a completed booking. No value/currency or ROAS is fabricated. Attendance, qualification and paid-pilot progress must be reconciled by the sales team.

## Three Proposed Ad Sets (Documentation Only)

| Ad set | Landing experience | industry parameter | Dataset / event |
| --- | --- | --- | --- |
| US Fire Departments | Firefighters landing | firefighters | 743509325171589 / Schedule |
| US Mining Safety | Mining safety landing | mining | 743509325171589 / Schedule |
| US Construction | Construction landing | construction | 743509325171589 / Schedule |

The website package does not create those ad sets, change campaign budgets, enable Advantage+ or upload audiences. The existing read-only Meta credential does not establish permission to manage ads. Any future account configuration requires separate authorization and suitable permissions.

Suggested ad URL parameters:
`utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term=firefighters&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}`

Use the matching industry in `utm_term`. IDs are durable attribution; creative/ad names can change. Never insert email, phone, worker health values or other personal information in UTMs. Calendly receives supported UTMs only: `utm_campaign` retains the campaign, and `utm_content` retains the supplied creative value plus `adset:<id>|ad:<id>`. If campaign UTM is absent, `campaign_id` supplies it. Inquiry records also retain the separate campaign/ad-set/ad fields. Bookings made independently or after tab storage is lost may have incomplete attribution.

## Client Launch Checks

1. Configure final domains, privacy notice, backend URL and production origins. Make the inquiry endpoint unavailable temporarily and verify honest failure rather than false success.
2. Submit a consented test business inquiry; confirm it exists in private storage and is exportable by an administrator only. Retry the same submission and verify one record.
3. Confirm inquiry denial/validation, advertising rejection and opt-out signals behave correctly. Denying advertising must still allow capture and booking.
4. In Meta Test Events / Pixel Helper, verify one PageView, one saved Lead and one completed Schedule. Use controlled testing before sending production data. Check for duplicate host/theme/tag-manager Pixel installations.
5. If CAPI is enabled, inspect shared event IDs and browser/server deduplication. Test Events are not a replacement for checking stored contacts.
6. Book through the embedded calendar on a mobile device, then verify UTMs in Sirisha's booking record and the actual event duration. No real bookings or account changes are made by automated package tests.
7. Review current Meta dataset restrictions and policies for this product before enabling any advanced matching. No health information or automatic form scraping is included.
8. Confirm correct industry links, form labels, safety/product claims and paid-pilot wording.

## Known Measurement Gaps

Browser Schedule is not server-verified. External fallback bookings, blocked scripts, consent rejection, cross-device journeys, cancellations and reschedules are not fully reconciled in this release. Gaining Sirisha's authorized booking API/webhook access later can close some of these gaps; no Calendly setting or webhook subscription is changed here.

The baseline readiness index was **36/100 (Broken)**: decision alignment 22/25, event model 5/20, accuracy 0/20, conversion definition 6/15, attribution 1/10, governance 2/10. This is a diagnostic assessment, not a campaign-performance KPI. Production readiness remains pending the client launch checks, not merely delivery of code.

Reference: https://calendly.com/help/advanced-calendly-embed-for-developers
