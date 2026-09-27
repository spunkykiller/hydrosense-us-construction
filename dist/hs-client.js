/* Shared website measurement. No secrets or health information belong here. */
(function () {
  'use strict';
  const c = window.HS_CONFIG || {};
  const root = new URL('.', document.currentScript.src);
  const key = 'hs-ad-consent-v1';
  const query = new URLSearchParams(location.search);
  const blocked = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  const read = (key) => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  const store = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const id = () => crypto.randomUUID ? crypto.randomUUID() : 'hs-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  const clean = (value) => String(value || '').replace(/[\r\n<>]/g, '').slice(0, 255);
  const attribution = read('hs-attribution') || {};
  const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campaign_id', 'adset_id', 'ad_id'];
  allowed.forEach((name) => { if (query.has(name)) attribution[name] = clean(query.get(name)); });
  // Only ad identifiers and explicitly configured UTMs are accepted, never arbitrary URL fields.
  Object.keys(attribution).forEach((name) => { if (!allowed.includes(name)) delete attribution[name]; });
  store('hs-attribution', attribution);
  let consent = blocked ? false : read(key) === true;
  const preview = c.mode !== 'production' || !Array.isArray(c.productionOrigins) || !c.productionOrigins.includes(location.origin);
  const sent = new Set();
  let initialized = false;
  let saving = false;
  let booking = read('hs-booking-context');
  if (booking && Date.now() - booking.createdAt > 15 * 60 * 1000) booking = null;

  function status(message, error) {
    const el = document.querySelector('[data-hs-status]');
    if (el) { el.textContent = message; el.dataset.error = error ? 'true' : 'false'; }
  }
  function pixel(name, eventId) {
    if (preview || !consent || blocked || sent.has(eventId)) return;
    initialize();
    if (typeof window.fbq !== 'function') return;
    window.fbq('trackSingle', c.pixelId, name, { industry: c.industry }, { eventID: eventId });
    sent.add(eventId);
  }
  const pageId = id();
  function initialize() {
    if (initialized || preview || !consent || blocked || !/^\d+$/.test(c.pixelId || '')) return;
    initialized = true;
    if (!window.fbq) {
      const f = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      f.queue = []; f.loaded = true; f.version = '2.0'; f.push = f;
      window.fbq = window._fbq = f;
      const script = document.createElement('script'); script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(script);
    }
    window.fbq('consent', 'grant');
    window.fbq('init', c.pixelId);
    pixel('PageView', pageId);
  }
  function setConsent(value) {
    consent = value === true && !blocked;
    store(key, consent);
    if (consent && window.fbq) window.fbq('consent', 'grant');
    if (!consent && window.fbq) window.fbq('consent', 'revoke');
    if (!consent) {
      ['_fbp', '_fbc'].forEach((name) => {
        document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax';
        document.cookie = name + '=; Max-Age=0; Path=/; Domain=.' + location.hostname + '; SameSite=Lax';
      });
    }
    initialize();
    document.querySelector('[data-hs-consent]')?.remove();
  }
  function consentPanel() {
    if (preview || blocked || read(key) !== null || c.consentMode === 'external' || document.querySelector('[data-hs-consent]')) return;
    const section = document.createElement('section'); section.className = 'hs-consent'; section.dataset.hsConsent = '';
    section.setAttribute('aria-label', 'Advertising privacy preferences');
    const text = document.createElement('p'); text.textContent = 'Allow advertising cookies to measure visits and meeting bookings? You can decline and still inquire or book.';
    section.append(text);
    if (c.privacyUrl) { const a = document.createElement('a'); a.href = c.privacyUrl; a.textContent = 'Privacy notice'; section.append(a); }
    [['Allow', true], ['Decline', false]].forEach(([label, value]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => setConsent(value); section.append(b); });
    document.body.append(section);
  }
  function publicPageUrl() { return location.origin + location.pathname; }
  function cookie(name) { try { return decodeURIComponent(document.cookie.split('; ').find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || ''); } catch { return ''; } }

  async function submit(form) {
    if (saving || !form.reportValidity()) return;
    if (!c.leadEndpoint || (preview && !c.previewCaptureEnabled)) {
      status('This review page does not save inquiries. Use the booking link below, or configure the client lead endpoint before launch.', true);
      return;
    }
    const data = new FormData(form);
    const submissionId = form.dataset.submissionId || (form.dataset.submissionId = id());
    const eventId = 'lead-' + submissionId;
    const matching = {};
    if (!preview && consent && !blocked) {
      const fbp = cookie('_fbp'); const fbc = cookie('_fbc');
      if (fbp) matching.fbp = fbp;
      if (fbc) matching.fbc = fbc;
      else if (/^[A-Za-z0-9_-]{10,500}$/.test(query.get('fbclid') || '')) matching.fbc = 'fb.1.' + Date.now() + '.' + query.get('fbclid');
    }
    const payload = {
      submissionId, eventId, industry: c.industry,
      firstName: String(data.get('firstName') || '').trim(), lastName: String(data.get('lastName') || '').trim(),
      email: String(data.get('email') || '').trim(), phone: String(data.get('phone') || '').trim(),
      organization: String(data.get('organization') || '').trim(), website: String(data.get('website') || ''),
      inquiryConsent: data.get('inquiryConsent') === 'yes', adConsent: consent && !blocked && !preview,
      privacyVersion: c.privacyVersion || 'pending', attribution,
      sourceUrl: publicPageUrl(), matching
    };
    saving = true;
    const button = form.querySelector('[type="submit"]');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    status('Saving your inquiry...');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(c.leadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal, credentials: 'omit' });
      const result = await response.json();
      if (!response.ok || result.saved !== true || result.eventId !== eventId || !result.leadId) throw new Error('not-saved');
      pixel('Lead', eventId);
      booking = { createdAt: Date.now(), leadId: result.leadId, name: [payload.firstName, payload.lastName].filter(Boolean).join(' '), email: payload.email, attribution, industry: c.industry };
      store('hs-booking-context', booking);
      status('Inquiry saved. Opening the booking calendar...');
      location.assign(new URL('book-a-meeting.html', root).href);
    } catch {
      status('We could not confirm that your inquiry was saved. Please retry, or book directly using the link below.', true);
    } finally { clearTimeout(timeout); saving = false; if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
  }
  function calendarUrl() {
    const url = new URL(c.bookingUrl || 'https://calendly.com/sirisha-2/10min');
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    url.searchParams.set('background_color', dark ? '0f0f12' : 'ffffff');
    url.searchParams.set('text_color', dark ? 'fafafa' : '1a1a1a');
    url.searchParams.set('primary_color', dark ? '22d3ee' : '0e7490');
    const source = booking?.attribution || attribution;
    Object.entries(source).forEach(([k, value]) => { if (k.startsWith('utm_')) url.searchParams.set(k, clean(value)); });
    if (!url.searchParams.has('utm_campaign') && source.campaign_id) url.searchParams.set('utm_campaign', clean(source.campaign_id));
    const content = [url.searchParams.get('utm_content') || ''];
    if (source.adset_id) content.push('adset:' + clean(source.adset_id));
    if (source.ad_id) content.push('ad:' + clean(source.ad_id));
    if (content.some(Boolean)) url.searchParams.set('utm_content', content.filter(Boolean).join('|'));
    if (!url.searchParams.has('utm_term')) url.searchParams.set('utm_term', c.industry);
    return url.href;
  }
  function calendarOptions(el) {
    const options = { url: calendarUrl(), parentElement: el, resize: true };
    if (booking) options.prefill = { name: booking.name, email: booking.email };
    // PII exists only in ephemeral tab storage and Calendly's supported prefill object.
    try { sessionStorage.removeItem('hs-booking-context'); } catch {}
    return options;
  }
  function calendarMessage(e) {
    if (e.origin !== 'https://calendly.com') return false;
    const frame = document.querySelector('[data-cal] iframe');
    if (!frame || e.source !== frame.contentWindow || typeof e.data?.event !== 'string') return false;
    if (e.data.event === 'calendly.event_scheduled') {
      const uri = e.data.payload?.invitee?.uri;
      if (typeof uri !== 'string' || !/^https:\/\/api\.calendly\.com\/scheduled_events\/[\w-]+\/invitees\/[\w-]+$/.test(uri)) return false;
      const key = 'hs-booked-' + uri.split('/').pop();
      if (read(key)) return true;
      store(key, true);
      pixel('Schedule', 'schedule-' + uri.split('/').pop());
    }
    return true;
  }
  function ready() {
    document.querySelectorAll('[data-hs-direct-booking]').forEach((a) => { a.href = new URL('book-a-meeting.html', root).href; });
    document.querySelectorAll('[data-hs-external-booking]').forEach((a) => { a.href = calendarUrl(); });
    document.querySelectorAll('[data-hs-industry-link]').forEach((a) => { const url = c.industryUrls?.[a.dataset.hsIndustryLink]; if (url) a.href = url; });
    document.querySelectorAll('[data-hs-privacy]').forEach((a) => {
      if (c.privacyUrl) a.href = c.privacyUrl;
      else { a.removeAttribute('href'); a.textContent = 'Privacy notice pending client configuration'; }
    });
    document.querySelectorAll('[data-hs-preferences]').forEach((b) => { b.onclick = () => { try { sessionStorage.removeItem(key); } catch {} consentPanel(); }; });
    consentPanel(); initialize();
  }
  function start() {
    if (document.querySelector('#dc-root > *')) ready();
    else {
      const observer = new MutationObserver(() => { if (document.querySelector('#dc-root > *')) { observer.disconnect(); ready(); } });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 15000);
    }
    setTimeout(() => {
      if (document.querySelector('#dc-root > *') || document.querySelector('.hs-runtime-fallback')) return;
      const section = document.createElement('section'); section.className = 'hs-runtime-fallback';
      const h = document.createElement('h1'); h.textContent = 'HydroSense';
      const p = document.createElement('p'); p.textContent = 'The interactive page could not load. You can still open the booking calendar.';
      const a = document.createElement('a'); a.href = c.bookingUrl || 'https://calendly.com/sirisha-2/10min'; a.textContent = 'Book a 10-minute introduction';
      section.append(h, p, a); document.body.append(section);
    }, 7000);
    document.addEventListener('submit', (e) => { if (e.target.matches('[data-hs-inquiry]')) { e.preventDefault(); e.stopPropagation(); submit(e.target); } }, true);
  }
  window.HydroSense = Object.freeze({ submit, calendarOptions, calendarMessage, calendarUrl, setAdvertisingConsent: setConsent, getAttribution: () => ({ ...attribution }) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
