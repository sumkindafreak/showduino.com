/* W002 browser test: HauntSync workflows against a MOCKED Supabase.
 *
 * Every request to the Supabase project is answered by this test (Playwright
 * routing), so no real account, email, database row or Google credential is used.
 * It proves the website's own behaviour; Supabase itself is covered by the database
 * RLS tests. Needs the CDN (supabase-js), so it runs in CI, not in the offline sandbox.
 *
 *   1. Sign in with email/password -> signed-in panel, session stored.
 *   2. Sign out -> global logout requested, session removed, signed-out view.
 *   3. Community library: list, preview and download a shared template; the
 *      download imports into Studio and carries no hardware binding.
 *   4. Cloud failure (HTTP 503) and offline (aborted): account page reports an error
 *      without crashing; Studio still saves and restores locally.
 *   5. Only the expected write requests are sent (no unexpected POST/PATCH/DELETE). */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const SUPA = 'https://fczxcvlyydcqdhjkejmd.supabase.co';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const USER = { id: '00000000-0000-4000-8000-0000000000c1', aud: 'authenticated', role: 'authenticated', email: 'w002-test@example.test',
  app_metadata: { provider: 'email' }, user_metadata: { display_name: 'W002 Tester' }, created_at: '2026-10-17T00:00:00Z' };
const session = () => ({ access_token: 'header.' + Buffer.from(JSON.stringify({ sub: USER.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url') + '.sig',
  token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'w002-refresh', user: USER });

async function mockSupabase(context, mode, log, sharedShow) {
  await context.route(SUPA + '/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') log.push(`${m} ${url.pathname}${url.search}`);
    if (mode === 'offline') return route.abort('internetdisconnected');
    if (mode === 'down') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Service unavailable"}' });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    if (url.pathname === '/auth/v1/settings') return json(200, { external: { email: true, google: true }, disable_signup: false });
    if (url.pathname === '/auth/v1/token') return json(200, session());
    if (url.pathname === '/auth/v1/user') return json(200, USER);
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    if (url.pathname === '/rest/v1/profiles') return json(200, one ? { id: USER.id, display_name: 'W002 Tester', avatar_url: null, created_at: USER.created_at, updated_at: USER.created_at } : [{ id: USER.id, display_name: 'W002 Tester' }]);
    if (url.pathname === '/rest/v1/shared_shows') {
      if (!sharedShow) return json(200, one ? null : []);
      return json(200, one ? sharedShow : [Object.fromEntries(Object.entries(sharedShow).filter(([k]) => k !== 'document'))]);
    }
    if (url.pathname.startsWith('/rest/v1/')) return json(200, one ? null : []);
    if (url.pathname.startsWith('/storage/')) return json(200, []);
    return json(404, { message: 'not mocked' });
  });
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const results = [];
  const pass = (name) => { results.push('PASS  ' + name); };

  // ---- 1 & 2: sign in, sign out ----
  {
    const context = await browser.newContext(); const writes = []; const errors = [];
    await mockSupabase(context, 'ok', writes);
    const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + 'account.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.ShowduinoSupabase?.enabled?.(), null, { timeout: 15000 });
    await page.fill('#login-email', USER.email); await page.fill('#login-password', 'correct horse battery staple');
    await page.click('#login-form button[type=submit]');
    await page.waitForSelector('#account-panel:not([hidden])', { timeout: 10000 });
    assert.match(await page.textContent('#account-email'), /w002-test@example\.test/);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).length);
    assert.strictEqual(stored, 1, 'session stored after sign-in');
    pass('sign in shows the signed-in panel and stores one session');
    await page.click('#sign-out-button');
    await page.waitForFunction(() => document.getElementById('account-panel').hidden === true, null, { timeout: 10000 });
    const after = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).length);
    assert.strictEqual(after, 0, 'session removed after sign-out');
    assert.ok(writes.some((w) => w.startsWith('POST /auth/v1/logout')), 'logout endpoint called');
    assert.ok(!writes.some((w) => w.startsWith('POST /auth/v1/logout') && /scope=local/.test(w)), 'sign-out is not local-only');
    pass('sign out calls logout (global scope), removes the stored session and shows the signed-out view');
    const unexpected = writes.filter((w) => !/^POST \/auth\/v1\/(token|logout)/.test(w) && !/^(POST|PATCH) \/rest\/v1\/profiles/.test(w));
    assert.deepStrictEqual(unexpected, [], 'only auth and own-profile writes during sign-in/out');
    pass('no unexpected write requests during sign-in and sign-out (' + writes.length + ' writes)');
    assert.deepStrictEqual(errors, []);
    await context.close();
  }

  // ---- 3: community template download -> Studio import ----
  {
    const context = await browser.newContext({ acceptDownloads: true }); const writes = [];
    const prep = await context.newPage();
    await prep.goto(base + 'studio.html', { waitUntil: 'load' });
    await prep.waitForFunction(() => window.SHDOModel && window.ShowduinoPackage, null, { timeout: 15000 });
    const shdo = await prep.evaluate(() => { const p = SHDOModel.createProject('Template source'); p.assets = {}; p.scenes = []; p.globalSettings = {}; p.metadata = {};
      const t = SHDOModel.createTrack('pixel', 'Pixels', 0); const c = SHDOModel.createClip(t.id, 'pixel', 0, 2000, 'Glow'); c.routing.nodeId = 'p4-local'; c.params.startPixel = 0; c.params.length = 10; c.params.effect = 'LIGHTNING';
      p.tracks.push(t); p.clips.push(c); return JSON.stringify(ShowduinoPackage.toShdo(p)); });
    await prep.close();
    const lib = await context.newPage();
    await lib.goto(base + 'community.html', { waitUntil: 'load' });
    await lib.waitForFunction(() => window.HauntSyncShare, null, { timeout: 15000 });
    const doc = await lib.evaluate((raw) => window.HauntSyncShare.prepare(raw, 'W002 template', 'Mocked community template'), shdo);
    const sharedShow = { id: '20000000-0000-4000-8000-000000000001', title: 'W002 template', summary: 'Mocked', category: 'pixels', license: 'cc0-1.0', author_label: 'W002 Tester', author_id: USER.id, created_at: '2026-10-17T00:00:00Z', document: doc };
    await lib.close();
    await mockSupabase(context, 'ok', writes, sharedShow);
    const page = await context.newPage();
    await page.goto(base + 'community.html', { waitUntil: 'load' });
    const preview = page.locator('button', { hasText: 'Preview & download' }).first();
    await preview.waitFor({ timeout: 10000 }); await preview.click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#hs-preview-download')]);
    const downloaded = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(!/"nodeId"\s*:\s*"[^"]+"/.test(JSON.stringify(JSON.parse(downloaded).devices || [])), 'no hardware binding in the download');
    pass('community template listed, previewed and downloaded without signing in');
    const studio = await context.newPage();
    await studio.goto(base + 'studio.html', { waitUntil: 'load' });
    await studio.waitForFunction(() => window.ShowduinoProjects, null, { timeout: 15000 });
    const imported = await studio.evaluate(async (t) => { try { await ShowduinoProjects.importProject(new File([t], 'template.shdo')); return 'ok'; } catch (e) { return e.message; } }, downloaded);
    assert.strictEqual(imported, 'ok');
    pass('downloaded community template imports into Studio');
    assert.deepStrictEqual(writes, [], 'browsing and downloading write nothing');
    pass('browsing and downloading sent no write requests');
    await context.close();
  }

  // ---- 4: cloud down and offline ----
  for (const mode of ['down', 'offline']) {
    const context = await browser.newContext(); const writes = []; const errors = [];
    await mockSupabase(context, mode, writes);
    const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + 'account.html', { waitUntil: 'load' });
    await page.fill('#login-email', USER.email).catch(() => {}); await page.fill('#login-password', 'x'.repeat(12)).catch(() => {});
    await page.click('#login-form button[type=submit]').catch(() => {});
    await page.waitForTimeout(2500);
    const status = (await page.textContent('#account-status')) || '';
    assert.ok(await page.evaluate(() => document.getElementById('account-panel').hidden), `${mode}: not shown as signed in`);
    assert.ok(status.trim().length > 0, `${mode}: a status message is shown`);
    assert.deepStrictEqual(errors, [], `${mode}: no uncaught errors on the account page`);
    pass(`cloud ${mode}: account page shows "${status.trim().slice(0, 60)}" and stays signed out`);
    const studio = await context.newPage(); const serrors = []; studio.on('pageerror', (e) => serrors.push(e.message));
    await studio.goto(base + 'studio.html', { waitUntil: 'load' });
    await studio.waitForFunction(() => window.ShowduinoProjects, null, { timeout: 15000 });
    const saved = await studio.evaluate(async () => { const p = await ShowduinoProjects.saveCurrentProject({ cloud: false }); return p?.project?.id || null; });
    assert.ok(saved, `${mode}: Studio saves locally`);
    await studio.reload({ waitUntil: 'load' }); await studio.waitForFunction(() => window.ShowduinoProjects, null, { timeout: 15000 });
    const restored = await studio.evaluate(async () => (await ShowduinoProjects.restoreLastLocalProject())?.project?.id || null);
    assert.strictEqual(restored, saved, `${mode}: Studio restores locally`);
    assert.deepStrictEqual(serrors, [], `${mode}: no uncaught errors in Studio`);
    pass(`cloud ${mode}: Studio saves and restores locally without errors`);
    await context.close();
  }

  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(`PASS: ${results.length} mocked HauntSync workflow checks.`);
})().catch((e) => { console.error('FAIL', e.message); server.close(); process.exit(1); });
