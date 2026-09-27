import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const tooling = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.HS_TEST_BASE_URL || 'http://127.0.0.1:8090';
let own;
try { own = JSON.parse(await fs.readFile(path.join(tooling, 'industry.json'), 'utf8')); } catch {}
const axe = await fs.readFile(path.join(tooling, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const browser = await chromium.launch({ headless: true });
const results = [];
await fs.mkdir(path.join(tooling, 'test-results'), { recursive: true });
for (const slug of own ? [own.slug] : ['hydrosense-firefighters', 'hydrosense-mining-safety', 'hydrosense-us-construction']) {
  for (const filename of ['index.html', 'book-a-meeting.html']) {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 } });
      const page = await context.newPage(); const errors = []; const missing = []; const requests = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(base)) missing.push(r.url()); });
      page.on('request', (r) => requests.push(r.url()));
      await page.route('https://assets.calendly.com/assets/external/widget.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.Calendly={initInlineWidget:function(options){window.__calOptions=options;var f=document.createElement("iframe");f.src="https://calendly.com/hs-controlled-test";options.parentElement.appendChild(f)}}' }));
      await page.route('https://calendly.com/hs-controlled-test', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body style="font:18px system-ui;background:#fafafa;color:#222;margin:20px"><h1>Controlled calendar test</h1><p>No real booking is made.</p></body></html>' }));
      await page.goto(`${base}/${own ? '' : slug + '/'}${filename}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#dc-root', { timeout: 15000 });
      await page.waitForTimeout(700);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, width: document.documentElement.scrollWidth, imageFailures: [...document.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src), nonblank: document.body.innerText.trim().length > 30, pixelLoaded: !!window.fbq }));
      await page.addScriptTag({ content: axe });
      const audit = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => ({ target: n.target, summary: n.failureSummary })) })));
      const result = { slug, filename, width, errors, missing, ...state, violations: audit, externalRuntime: requests.filter((u) => /unpkg|babel/.test(u)), productionTracking: requests.filter((u) => /facebook\.net|facebook\.com\/tr/.test(u)) };
      results.push(result);
      if ([390, 1440].includes(width)) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(tooling, 'test-results', `${slug}-${filename}-${width}.png`), fullPage: true }); }
      console.log(JSON.stringify({ slug, filename, width, overflow: result.overflow, errors: errors.length, missing: missing.length, violations: audit.map((x) => x.id) }));
      await context.close();
    }
  }
}
await browser.close();
await fs.writeFile(path.join(tooling, 'test-results', 'responsive.json'), JSON.stringify(results, null, 2));
if (results.some((r) => r.overflow || r.errors.length || r.missing.length || r.imageFailures.length || !r.nonblank || r.externalRuntime.length || r.productionTracking.length || r.violations.length)) process.exitCode = 1;
