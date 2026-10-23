/* W005 (W5-06) browser test: serve the site with the response headers from _headers,
 * exactly as Cloudflare Pages does, and check under the ENFORCED Content-Security-Policy:
 *
 *  1. Every public page loads at desktop, tablet and phone width with no CSP violation.
 *  2. Studio: every panel opens and every non-destructive button, select and slider
 *     runs through js/studio-actions.js with no violation and no unknown action.
 *  3. Those controls still work: panel buttons navigate, the log toggle collapses the
 *     dock, the effect search filters, choosing an effect selects it.
 *  4. The policy really is enforced: an injected inline handler and an injected
 *     inline <script> do not run, and the browser reports both as blocked.
 *
 * Supabase, the CDNs' telemetry and the LAN addresses of Showduino hardware are never
 * contacted: those requests are aborted (an aborted request is not a CSP violation). */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json', '.ico': 'image/x-icon' };

// The "/*" block of _headers applies to every response.
function siteHeaders() {
  const out = {}; let inBlock = false;
  for (const line of fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) { inBlock = line.trim() === '/*'; continue; }
    const m = inBlock && /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const HEADERS = siteHeaders();
if (!HEADERS['Content-Security-Policy']) { console.error('FAIL: _headers has no enforced Content-Security-Policy'); process.exit(1); }

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, HEADERS); return res.end(); }
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

// Actions that only change what is on screen. Anything that saves, sends, deletes,
// downloads, signs in or out, reloads or talks to hardware is left alone.
const SAFE_ACTIONS = new Set(['open-panel', 'v4-open-panel', 'toggle-terminal', 'preview-play', 'preview-pause', 'preview-stop', 'preview-rewind',
  'preview-loop', 'preview-panic', 'v4-select-pixel-effect', 'v4-exit-sign-template', 'v4-filter-effects', 'v4-pixel-lab-input',
  'v4-refresh-node-map', 'v4-refresh-diagnostics', 'update-bpm', 'seek-to']);

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const problems = [];
const fail = (msg) => problems.push(msg);

async function openTab(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route(/supabase\.co|192\.168\.4\.1|showduino\.local|challenges\.cloudflare\.com/, (r) => r.abort());
  const tab = await ctx.newPage();
  const warnings = [];
  tab.on('dialog', (d) => d.dismiss().catch(() => {}));
  tab.on('console', (m) => { if (/\[Studio actions\] Unknown action/.test(m.text())) warnings.push(m.text()); });
  await tab.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(
      `${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} at ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber} ${String(e.sample || '').slice(0, 60)}`));
  });
  return { ctx, tab, warnings };
}
const violations = (tab) => tab.evaluate(() => window.__csp.splice(0)).catch(() => ['(page closed)']);

async function studioChecks(tab, width, base) {
  await tab.waitForFunction(() => window.ShowduinoActions && window.ShowduinoStudioV4 && document.querySelector('[data-sd-click]'), null, { timeout: 15000 })
    .catch(() => fail(`${width}px studio: Studio did not finish loading`));
  const panels = await tab.$$eval('[data-panel]', (els) => [...new Set(els.map((e) => e.dataset.panel))]);
  let ran = 0;
  for (const panel of panels) {
    await tab.evaluate((p) => document.querySelector(`.sidebar [data-panel="${p}"], [data-panel="${p}"]`)?.click(), panel);
    await tab.waitForTimeout(200);
    // Run each safe control once, in the page, through the real event path.
    ran += await tab.evaluate((safe) => {
      let n = 0;
      for (const kind of ['click', 'change', 'input']) {
        for (const el of [...document.querySelectorAll(`[data-sd-${kind}]`)]) {
          const name = el.getAttribute(`data-sd-${kind}`);
          if (!safe.includes(name) || name === 'open-panel' || name === 'v4-open-panel') continue;
          if (kind === 'click') el.click(); else el.dispatchEvent(new Event(kind, { bubbles: true }));
          n += 1;
        }
      }
      return n;
    }, [...SAFE_ACTIONS]);
    for (const v of await violations(tab)) fail(`${width}px studio panel ${panel}: ${v}`);
  }
  if (ran < 20) fail(`${width}px studio: only ${ran} dispatcher controls ran; expected the Studio panels to use it`);

  // The controls still do their job. A phone gets the touch Studio (studio-mobile.js),
  // which hides the desktop workspace, so it is checked through its own tabs.
  const phone = await tab.evaluate(() => document.body.classList.contains('studio-mobile-native'));
  if (phone) {
    const tabs = await tab.$$eval('.sm-tab', (els) => els.map((e) => e.dataset.smTab));
    if (tabs.length < 3) fail(`${width}px: phone Studio shows ${tabs.length} tabs`);
    for (const id of tabs) {
      await tab.click(`.sm-tab[data-sm-tab="${id}"]`, { timeout: 3000 }).catch((e) => fail(`${width}px: phone tab ${id} not clickable: ${e.message.split('\n')[0]}`));
      await tab.waitForTimeout(150);
      const now = await tab.evaluate(() => document.querySelector('.sm-tab.active')?.dataset.smTab);
      if (now !== id) fail(`${width}px: phone tab ${id} did not open (active: ${now})`);
    }
  } else {
    const active = () => tab.evaluate(() => document.querySelector('[data-panel].active')?.dataset.panel);
    await tab.evaluate(() => document.querySelector('[data-panel="introduction"]')?.click());
    await tab.waitForTimeout(200);
    await tab.click('[data-sd-click="v4-open-panel"][data-sd-arg="timeline-editor"]', { timeout: 3000 }).catch((e) => fail(`${width}px: Open Timeline button missing: ${e.message.split('\n')[0]}`));
    await tab.waitForTimeout(200);
    if (await active() !== 'timeline-editor') fail(`${width}px: "Open Timeline" did not open the timeline (active: ${await active()})`);

    await tab.evaluate(() => document.querySelector('[data-panel="playback"]')?.click());
    await tab.waitForTimeout(200);
    const options = await tab.$$('.pixel-fx-option');
    if (options.length < 3) fail(`${width}px: Pixel FX Lab shows ${options.length} effects`);
    else {
      const target = await options[2].getAttribute('data-pixel-effect');
      await options[2].scrollIntoViewIfNeeded().catch(() => {});
      await options[2].click({ timeout: 3000 }).catch(async (e) => fail(`${width}px: effect button ${target} not clickable: ${e.message.split('\n')[0]} ${JSON.stringify(await options[2].evaluate((el) => ({ hidden: el.hidden, rect: el.getBoundingClientRect().toJSON(), panel: document.querySelector('[data-panel].active')?.dataset.panel })))}`));
      const selected = await tab.evaluate(() => [document.querySelector('.pixel-fx-option.active')?.dataset.pixelEffect, document.getElementById('pixel-lab-effect')?.value]);
      if (selected[0] !== target || selected[1] !== target) fail(`${width}px: choosing effect ${target} selected ${selected.join(' / ')}`);
      const search = await tab.$('[data-sd-input="v4-filter-effects"]');
      if (!search) fail(`${width}px: effect search box missing`);
      else {
        await search.fill('zzzz-no-such-effect', { timeout: 3000 }).catch(async (e) => fail(`${width}px: effect search not usable: ${e.message.split('\n')[0]} ${JSON.stringify(await search.evaluate((el) => ({ rect: el.getBoundingClientRect().toJSON(), panel: document.querySelector('[data-panel].active')?.dataset.panel, display: getComputedStyle(el.closest('section,.panel,[id]')).display })))}`));
        const shown = await tab.$$eval('.pixel-fx-option', (els) => els.filter((e) => !e.hidden).length);
        if (shown !== 0) fail(`${width}px: effect search did not filter (${shown} still shown)`);
        await search.fill('', { timeout: 3000 }).catch(() => {});
        const back = await tab.$$eval('.pixel-fx-option', (els) => els.filter((e) => !e.hidden).length);
        if (back !== options.length) fail(`${width}px: clearing the effect search shows ${back} of ${options.length}`);
      }
    }

    const dock = () => tab.evaluate(() => document.querySelector('.bottom-dock')?.classList.contains('collapsed'));
    const before = await dock();
    await tab.evaluate(() => document.querySelector('[data-sd-click="toggle-terminal"]')?.click());
    if (await dock() === before) fail(`${width}px: the log toggle did not change the dock`);
    await tab.evaluate(() => document.querySelector('[data-sd-click="toggle-terminal"]')?.click());
    if (await dock() !== before) fail(`${width}px: the log toggle did not change the dock back`);
  }
  for (const v of await violations(tab)) fail(`${width}px studio controls: ${v}`);

  // The policy is enforced: injected inline script does not run and is reported.
  const blocked = await tab.evaluate(async () => {
    window.__ran = [];
    const img = document.createElement('img');
    img.setAttribute('onerror', 'window.__ran.push("handler")');
    img.src = '/no-such-image-for-csp-test.png';
    document.body.appendChild(img);
    const s = document.createElement('script');
    s.textContent = 'window.__ran.push("script")';
    document.body.appendChild(s);
    const a = document.createElement('a');
    a.href = 'javascript:window.__ran.push("url")';
    document.body.appendChild(a); a.click();
    await new Promise((r) => setTimeout(r, 600));
    img.remove(); s.remove(); a.remove();
    return { ran: window.__ran, reported: window.__csp.splice(0) };
  });
  if (blocked.ran.length) fail(`${width}px: injected inline code RAN under the CSP: ${blocked.ran.join(', ')}`);
  const reported = blocked.reported.join(' | ');
  for (const [what, re] of [['inline handler', /script-src-attr/], ['inline <script>', /script-src-elem/]]) {
    if (!re.test(reported)) fail(`${width}px: the browser did not report the injected ${what} as blocked (${reported || 'nothing reported'})`);
  }
  return ran;
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  let controls = 0;
  for (const width of [1366, 820, 390]) for (const page of pages) {
    const { ctx, tab, warnings } = await openTab(browser, width);
    const sent = await tab.goto(base + page, { waitUntil: 'load' }).catch((e) => { fail(`${width}px ${page}: ${e.message}`); return null; });
    if (sent && !/script-src/.test(sent.headers()['content-security-policy'] || '')) fail(`${width}px ${page}: response has no enforced script-src policy`);
    await tab.waitForTimeout(400);
    for (const v of await violations(tab)) fail(`${width}px ${page}: ${v}`);
    if (page === 'studio.html') controls += await studioChecks(tab, width, base);
    warnings.forEach((w) => fail(`${width}px ${page}: ${w}`));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(`${pages.length} pages × 3 widths (desktop, tablet, phone) under the enforced CSP; ${controls} Studio dispatcher controls exercised.`);
  if (problems.length) {
    console.error('FAIL\n' + problems.join('\n'));
    if (process.env.GITHUB_ACTIONS) problems.slice(0, 10).forEach((p) => console.log(`::error title=csp-enforced::${p.replace(/\r?\n/g, ' ').slice(0, 900)}`));
    process.exit(1);
  }
  console.log('PASS: no CSP violations; Studio controls work through the dispatcher; injected inline script is blocked and reported.');
})().catch((e) => { console.error(problems.join('\n')); console.error(e); server.close(); process.exit(1); });
