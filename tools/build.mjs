import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { load } from 'cheerio';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || path.join(here, '..'));
const source = path.join(repo, 'source');
const manifest = JSON.parse(await fs.readFile(path.join(repo, 'industry.json'), 'utf8'));
const require = createRequire(import.meta.url);
const copy = async (src, dest) => { await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(src, dest); };
const $load = (html) => load(html, { xml: { xmlMode: false, decodeEntities: false, lowerCaseAttributeNames: false } }, false);
const media = new Map();
const metrics = { industry: manifest.industry, generatedAt: new Date().toISOString(), images: [] };

async function image(url) {
  const normalized = decodeURIComponent(url).replace(/^\.\//, '');
  if (media.has(normalized)) return media.get(normalized);
  if (!/^(assets|uploads)\//.test(normalized)) return null;
  const src = path.resolve(source, normalized);
  if (!src.startsWith(source + path.sep)) throw new Error('Asset escaped source directory');
  const extension = path.extname(src).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
    await copy(src, path.join(repo, normalized)); return null;
  }
  const metadata = await sharp(src).metadata();
  const basename = path.basename(src, extension).replace(/[^a-zA-Z0-9_-]/g, '-');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
  const sizes = [...new Set([320, 640, 960, 1280, 1920, metadata.width].map((n) => Math.min(n, metadata.width)))].sort((a, b) => a - b);
  const variants = [];
  for (const width of sizes) {
    const out = `assets/optimized/${basename}-${hash}-${width}.webp`;
    await fs.mkdir(path.dirname(path.join(repo, out)), { recursive: true });
    await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(path.join(repo, out));
    variants.push({ width, url: out, bytes: (await fs.stat(path.join(repo, out))).size });
  }
  const info = { width: metadata.width, height: metadata.height, variants, src: variants.find((v) => v.width >= 960)?.url || variants.at(-1).url, srcset: variants.map((v) => `${v.url} ${v.width}w`).join(', ') };
  media.set(normalized, info);
  metrics.images.push({ source: normalized, originalBytes: (await fs.stat(src)).size, largestWebpBytes: variants.at(-1).bytes });
  return info;
}

function sharedHead($) {
  $('html').attr({ lang: 'en', 'data-hs-industry': manifest.industry });
  $('head').append(`<title>HydroSense for ${manifest.label} | Organizational Pilots</title><style>x-dc{display:none!important}</style>`);
  $('head').append('<script src="./site-config.js" defer></script><script src="./hs-client.js" defer></script><script src="./vendor/react.production.min.js" defer></script><script src="./vendor/react-dom.production.min.js" defer></script><link rel="stylesheet" href="./hs-enhancements.css">');
  $('script[src="./support.js"]').attr('defer', '');
  // Dependencies must load before the supplied runtime.
  const support = $('script[src="./support.js"]').remove(); $('head').append(support);
  $('head').append('<meta name="referrer" content="strict-origin-when-cross-origin">');
  const description = `${manifest.label}: measure sweat loss during representative work or training. Discuss a paid organizational pilot in a 10-minute introductory call.`;
  $('head').append(`<meta name="description" content="${description}">`);
  $('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]').remove();
  $('head').append('<style>@font-face{font-family:Geist;font-style:normal;font-weight:300 700;font-display:swap;src:url(./assets/fonts/geist-latin.woff2) format("woff2")}@font-face{font-family:"Geist Mono";font-style:normal;font-weight:400 500;font-display:swap;src:url(./assets/fonts/geist-mono-latin.woff2) format("woff2")}</style>');
  $('head').append('<link rel="preload" href="./assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin>');
}

function landingPresentation($) {
  const hero = $('section[data-hero-root]');
  hero.append(hero.children('picture').first());
  const heroSubline = {
    firefighters: 'Measure individual sweat loss during departmental training.',
    mining: 'Measure individual sweat loss across a working shift.',
    construction: 'Measure individual sweat loss during demanding site work.'
  };
  hero.find('[data-hero-copy] > p').first().text(heroSubline[manifest.industry]);

  const slides = $('#product [data-slides]').children('div');
  if (slides.length === 3) slides.eq(2).prependTo(slides.parent());
}

async function landing() {
  const $ = $load(await fs.readFile(path.join(source, manifest.landing), 'utf8'));
  sharedHead($);
  $('a').each((_, el) => {
    const a = $(el), href = a.attr('href') || '';
    if (/Book(?:%20| )a(?:%20| )Meeting\.dc\.html/i.test(href)) a.attr('href', './book-a-meeting.html');
    if (/hydrosense-(?:us-)?mining-safety\.vercel\.app/.test(href)) a.attr('href', 'https://hydrosense-mining-safety.vercel.app/');
    if (/hydrosense-(?:us-)?mining-safety\.vercel\.app/.test(href)) a.attr('data-hs-industry-link', 'mining');
    if (/hydrosense-firefighters\.vercel\.app/.test(href)) a.attr('data-hs-industry-link', 'firefighters');
    if (/hydrosense-us-construction\.vercel\.app/.test(href)) a.attr('data-hs-industry-link', 'construction');
    if (a.attr('target') === '_blank') a.attr('rel', 'noopener noreferrer');
  });
  const form = $('#demo form').attr('data-hs-inquiry', '').removeAttr('onSubmit');
  const names = { 'First name': ['firstName', 'given-name'], 'Last name': ['lastName', 'family-name'], 'Work email': ['email', 'email'], Organization: ['organization', 'organization'] };
  form.find('input').each((_, el) => {
    const input = $(el), placeholder = input.attr('placeholder');
    const [name, auto] = names[placeholder] || ['organization', 'organization'];
    input.attr({ name, autocomplete: auto, 'aria-label': placeholder || 'Organization', maxlength: '255' });
    input.wrap('<div class="hs-field"></div>');
    input.before(`<label class="hs-form-label" for="hs-${name}">${placeholder || 'Organization'}</label>`); input.attr('id', `hs-${name}`);
  });
  form.find('[type="submit"]').addClass('hs-submit').before('<label class="hs-form-label" for="hs-phone">Phone (optional, include country code)</label><input id="hs-phone" name="phone" type="tel" autocomplete="tel" maxlength="30" placeholder="+1" style="width:100%;padding:15px 17px;border:1px solid #2a2a30;border-radius:12px;font-size:16px;background:#0b0b0d;color:#fafafa"><label class="hs-inquiry-consent"><input name="inquiryConsent" type="checkbox" value="yes" required><span>I agree to be contacted about a pilot.</span></label><label class="hs-honeypot" aria-hidden="true">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>');
  form.append('<p class="hs-form-meta">Paid organizational pilots.</p><p data-hs-status role="status" aria-live="polite"></p><p class="hs-form-meta"><a data-hs-direct-booking href="./book-a-meeting.html">Book directly</a></p>');
  $('[data-site-footer]').append('<div style="max-width:1280px;margin:auto;padding:16px 24px 32px"><button data-hs-preferences type="button" style="background:none;border:0;color:#c4c4cc;text-decoration:underline;cursor:pointer;font:14px system-ui">Advertising privacy preferences</button></div>');
  const horizon = $('[data-marks-grid] [data-mark-tile]').filter((_, el) => $(el).text().includes('Horizon 2020'));
  horizon.attr('data-hs-horizon', '');
  horizon.find('span').last().html('EU Research &amp;<br>Innovation');
  const outcomes = $('#data [data-outcomes]');
  outcomes.children().slice(1).remove();
  outcomes.contents().filter((_, node) => node.type === 'text' && !node.data.trim()).remove();
  outcomes.children().first().find('span').first().text('Example insight');
  outcomes.children().first().find('div').last().html('<span style="color:#FAFAFA">Sweat loss varies across a crew.</span>');
  $('section[data-screen-label="Campaign record"] a > span:first-child > span').eq(1).text('Validation and field results.');
  landingPresentation($);
  // If the export has no named dashboard root, label its simulated cohort panel directly.
  if (!$('#data [data-report-card]').length) $('[data-hs-panel], [data-hs-wrap], [data-hs]').first().append('<p class="hs-illustrative">Illustrative example only. Not a certification of operational readiness.</p>');
  $('video').attr('preload', 'none');
  for (const el of $('img').toArray()) {
    const node = $(el), src = node.attr('src'); if (!src) continue;
    const info = await image(src); if (!info) continue;
    const hero = node.is('[data-hero-img]');
    node.attr({ src: info.src, srcset: info.srcset, width: String(info.width), height: String(info.height), decoding: 'async', loading: hero ? 'eager' : 'lazy', sizes: hero ? '100vw' : '(max-width: 600px) 100vw, (max-width: 1024px) 70vw, 640px' });
    if (hero) node.attr('fetchpriority', 'high');
  }
  for (const el of $('source[srcset]').toArray()) {
    const node = $(el), url = node.attr('srcset');
    if (!url || url.includes(',')) continue;
    const info = await image(url); if (info) node.attr({ srcset: info.srcset, sizes: '100vw', type: 'image/webp' });
  }
  for (const el of $('[poster], [data-lazyvideo]').toArray()) {
    const node = $(el);
    if (node.attr('poster')) { const info = await image(node.attr('poster')); if (info) node.attr('poster', info.src); }
    const video = node.attr('data-lazyvideo');
    if (video) await copy(path.join(source, video), path.join(repo, video));
  }
  // Copy remaining referenced media without exposing the export's screenshots or unused uploads.
  for (const el of $('[src]').toArray()) {
    const url = $(el).attr('src') || '';
    if (/^(assets|uploads)\//.test(url) && !url.startsWith('assets/optimized/')) await copy(path.join(source, decodeURIComponent(url)), path.join(repo, decodeURIComponent(url)));
  }
  const logic = $('script[data-dc-script]');
  logic.text(logic.text().replace(/submit: \(e\) => \{[\s\S]*?\n      \},\n      reset:/, 'submit: (e) => { e.preventDefault(); },\n      reset:'));
  let html = $.html();
  html = html.replace(/letter-spacing\s*:\s*[^;"}]+/g, 'letter-spacing: 0');
  html = html.replace(/font-size:\s*clamp\(([^,]+),[^,]+,([^\)]+)\)/g, (_, min, max) => 'font-size: ' + max.trim());
  html = html.replace(/#(?:5E5E66|6A6A72|60606A|64646E)/gi, '#9A9AA6');
  html = html.replace('</body>', `<noscript><section class="hs-runtime-fallback"><h1>HydroSense for ${manifest.label}</h1><p>Measure sweat loss during work or training. JavaScript is required to submit an inquiry.</p><a href="https://calendly.com/sirisha-2/10min">Book a 10-minute introduction</a></section></noscript></body>`);
  html = html.replace(/^[\t ]+$/gm, '');
  await fs.writeFile(path.join(repo, 'index.html'), html);
  await fs.writeFile(path.join(repo, manifest.landing), html);
}

async function booking() {
  const $ = $load(await fs.readFile(path.join(source, manifest.booking), 'utf8'));
  sharedHead($);
  $('head title').text('Book a Meeting | HydroSense ' + manifest.label);
  $('body').prepend('<nav class="hs-booking-bar" aria-label="Booking navigation"><a href="./index.html">Back to HydroSense</a><a data-hs-external-booking href="https://calendly.com/sirisha-2/10min" target="_blank" rel="noopener noreferrer">Open calendar separately</a></nav>');
  $('main').attr('style', 'position:relative;width:100%;min-height:100dvh;overflow:visible;');
  $('a[href*="calendly.com"]').attr('data-hs-external-booking', '');
  $('script[src*="assets.calendly.com/assets/external/widget.js"]').remove();
  $('link[rel="preconnect"][href*="calendly.com"]').remove();
  const logic = $('script[data-dc-script]');
  let js = logic.text();
  js = js.replace('componentDidMount() {', 'componentDidMount() {\n    if (window.HydroSense.reviewCalendar()) { this.setState({ ready: true, failed: false }); return; }');
  js = js.replace('this.onScheme = () => this.mountCal();', 'this.onScheme = () => {};');
  js = js.replace('if (typeof e.origin !== "string" || e.origin.indexOf("calendly.com") === -1) return;', 'if (!window.HydroSense.calendarMessage(e)) return;');
  js = js.replace('return this.base + "?background_color=" + c[0] + "&text_color=" + c[1] + "&primary_color=" + c[2];', 'return window.HydroSense.calendarUrl();');
  js = js.replace('window.Calendly.initInlineWidget({ url: url, parentElement: el });', 'window.Calendly.initInlineWidget(window.HydroSense.calendarOptions(el));');
  js = js.replace('this.safeT = setTimeout(() => this.markReady(), 7000);', 'this.safeT = null;');
  js = js.replace('this.failT = setTimeout(() => { if (!this.frameLoaded) this.setState({ failed: true }); }, 15000);', 'this.failT = setTimeout(() => { if (!this.frameLoaded) this.setState({ failed: true }); }, 15000);');
  logic.text(js);
  const html = $.html().replace('</body>', '<noscript><section class="hs-runtime-fallback"><a href="https://calendly.com/sirisha-2/10min">Open the booking calendar</a></section></noscript></body>');
  for (const name of ['book-a-meeting.html', 'Book a Meeting.dc.html', manifest.booking]) await fs.writeFile(path.join(repo, name), html);
}

await fs.mkdir(path.join(repo, 'vendor'), { recursive: true });
for (const [pkg, filename] of [['react', 'react.production.min.js'], ['react-dom', 'react-dom.production.min.js']]) {
  const base = path.dirname(require.resolve(pkg + '/package.json'));
  await copy(path.join(base, 'umd', filename), path.join(repo, 'vendor', filename));
  await copy(path.join(base, 'LICENSE'), path.join(repo, 'vendor', pkg + '.LICENSE'));
}
let runtime = await fs.readFile(path.join(source, 'support.js'), 'utf8');
runtime = runtime.replace(/    function ensureBabel\(\) \{[\s\S]*?\n    \}\n    const pending/, '    function ensureBabel() { return Promise.reject(new Error("Precompile JSX before deployment.")); }\n    const pending');
runtime = runtime.replace(/const code = kind === "jsx" \? window\.Babel\.transform\(src, \{[\s\S]*?\}\)\.code : src;/, 'const code = src;');
runtime = runtime.replace(/  var BABEL_(?:URL|SRI) = .*;\r?\n/g, '');
runtime = runtime.replace(/  function loadReactUmd\(\) \{[\s\S]*?\n  \}\n  function init\(\)/, '  function loadReactUmd() { return window.React && window.ReactDOM ? Promise.resolve() : Promise.reject(new Error("Local React dependencies did not load.")); }\n  function init()');
runtime = runtime.replace(/    if \(!window\.__resources\) \{\r?\n      fetch\(location.href\)[\s\S]*?\n    \}\r?\n    const dc/, '    const dc');
runtime = runtime.replace('  hideRawTemplate();', '  hideRawTemplate();\n  setTimeout(() => { if (!document.getElementById("dc-root")) { const el = document.createElement("section"); el.className = "hs-runtime-fallback"; el.innerHTML = "<h1>HydroSense</h1><p>The interactive page could not load.</p><a href=\\"https://calendly.com/sirisha-2/10min\\">Book a 10-minute introduction</a>"; document.body.append(el); } }, 7000);');
await fs.writeFile(path.join(repo, 'support.js'), runtime);
await landing(); await booking();
await fs.writeFile(path.join(repo, 'build-report.json'), JSON.stringify(metrics, null, 2) + '\n');
// The hosted output is frontend-only; backend code, source and documents stay in the handover.
const dist = path.join(repo, 'dist');
await fs.mkdir(dist, { recursive: true });
for (const name of ['index.html', 'book-a-meeting.html', 'Book a Meeting.dc.html', manifest.landing, manifest.booking, 'site-config.js', 'hs-client.js', 'hs-enhancements.css', 'support.js']) await copy(path.join(repo, name), path.join(dist, name));
for (const folder of ['assets', 'vendor']) await fs.cp(path.join(repo, folder), path.join(dist, folder), { recursive: true });
console.log(JSON.stringify({ industry: manifest.industry, optimizedImages: metrics.images.length, originalImageBytes: metrics.images.reduce((n, x) => n + x.originalBytes, 0), largestVariantBytes: metrics.images.reduce((n, x) => n + x.largestWebpBytes, 0) }));
