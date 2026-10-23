/* W005 browser test (W5-05, W5-08), real supabase-js against a MOCKED Supabase.
 * Turnstile is replaced by a stub script, so no Cloudflare request is made.
 * Proves: Google sign-in is hidden by default; with a Turnstile site key configured,
 * sign-in, sign-up and password reset each send a captcha token to Supabase Auth.
 * Needs the CDN (supabase-js), so it runs in CI, not in an offline sandbox. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const SUPA = 'https://fczxcvlyydcqdhjkejmd.supabase.co';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
// Like real Turnstile, reset() runs the check again and calls the callback with a new
// single-use token (the previous stub never did, so the second request waited forever).
const STUB = `window.turnstile = { render(el, o) { el.setAttribute('data-stub', 'turnstile'); window.__tsCb = o.callback; setTimeout(() => o.callback('stub-token-' + (++window.__tsn)), 10); return 'w1'; },
  reset() { window.__tsResets = (window.__tsResets || 0) + 1; const cb = window.__tsCb; if (cb) setTimeout(() => cb('stub-token-' + (++window.__tsn)), 10); }, getResponse() { return ''; } }; window.__tsn = 0;`;
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  // 1. Default configuration: Google hidden, no Turnstile script requested.
  {
    const context = await browser.newContext(); const page = await context.newPage(); const requested = [];
    page.on('request', (r) => requested.push(r.url()));
    await context.route(SUPA + '/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
    await page.goto(base + 'account.html', { waitUntil: 'load' }); await page.waitForTimeout(800);
    assert.strictEqual(await page.locator('#google-auth-panel').isVisible(), false, 'Google panel hidden by default');
    assert.ok(!requested.some((u) => u.includes('challenges.cloudflare.com')), 'no Turnstile request when no site key');
    assert.ok(!requested.some((u) => u.endsWith('/auth/v1/settings')), 'provider settings not probed while Google is off');
    await context.close();
    console.log('PASS  default: Google hidden, no CAPTCHA script, no provider probe');
  }

  // 2. Site key configured: each auth request carries a token.
  {
    const context = await browser.newContext(); const page = await context.newPage(); const bodies = {};
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await context.route(base + 'config/runtime-config.js', async (route) => {
      const original = fs.readFileSync(path.join(ROOT, 'config/runtime-config.js'), 'utf8');
      route.fulfill({ status: 200, contentType: 'text/javascript', body: original.replace("siteKey: ''", "siteKey: '1x00000000000000000000AA'") });
    });
    await context.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
    await context.route(SUPA + '/**', async (route) => {
      const req = route.request(); const url = new URL(req.url());
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (req.method() === 'POST') { try { bodies[url.pathname] = JSON.parse(req.postData() || '{}'); } catch (_) {} }
      if (url.pathname === '/auth/v1/token') return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (url.pathname === '/auth/v1/signup') return json(200, { id: '00000000-0000-4000-8000-0000000000aa', email: 'new@example.test', aud: 'authenticated', role: '', identities: [] });
      if (url.pathname === '/auth/v1/recover') return json(200, {});
      return json(200, {});
    });
    await page.goto(base + 'account.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.ShowduinoSupabase?.enabled?.() && window.ShowduinoCaptcha?.enabled?.(), null, { timeout: 15000 });
    await page.waitForSelector('#auth-captcha[data-stub="turnstile"]', { timeout: 5000 });
    await page.fill('#login-email', 'someone@example.test'); await page.fill('#login-password', 'wrong-password-123');
    await page.click('#login-form button[type=submit]'); await page.waitForTimeout(800);
    await page.click('#forgot-password-button'); await page.waitForTimeout(800);
    await page.fill('#register-name', 'New Creator'); await page.fill('#register-email', 'new@example.test'); await page.fill('#register-password', 'a-long-test-passphrase');
    await page.click('#register-form button[type=submit]'); await page.waitForTimeout(800);
    const token = (p) => bodies[p]?.gotrue_meta_security?.captcha_token;
    assert.match(token('/auth/v1/token') || '', /^stub-token-\d+$/, 'sign-in sends a captcha token');
    assert.match(token('/auth/v1/recover') || '', /^stub-token-\d+$/, 'password reset sends a captcha token');
    assert.match(token('/auth/v1/signup') || '', /^stub-token-\d+$/, 'sign-up sends a captcha token');
    assert.ok((await page.evaluate(() => window.__tsResets || 0)) >= 3, 'widget reset after each request');
    assert.match(await page.textContent('#account-status'), /If you already have one/, 'neutral sign-up message');
    assert.deepStrictEqual(errors, [], 'no page errors');
    await context.close();
    console.log('PASS  site key set: sign-in, reset and sign-up each send a Turnstile token; widget reset each time');
  }
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=auth-captcha::${String(e.message).replace(/\r?\n/g, ' ').slice(0, 900)}`); server.close(); process.exit(1); });
