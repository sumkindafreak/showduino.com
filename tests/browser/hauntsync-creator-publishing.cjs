/* W002 browser test: public creator publishing against a MOCKED Supabase.
 *
 * No real account, email or database row is used. Proves the website's behaviour:
 *   1. Publish sends exactly one upsert to creator_publications for the signed-in
 *      user's own creator_id, with only the public fields (never the email).
 *   2. Unpublish deletes only the signed-in user's row.
 *   3. The public directory and creator page render hostile published values
 *      (display name, bio, focus, website, avatar) inertly: no script runs, the
 *      website link is never javascript:/http:, and a non-HTTPS avatar is not loaded.
 * Needs the CDN (supabase-js), so it runs in CI, not in the offline sandbox. */
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
const USER = { id: '00000000-0000-4000-8000-0000000000c2', aud: 'authenticated', role: 'authenticated', email: 'w002-publisher@example.test',
  app_metadata: { provider: 'email' }, user_metadata: { display_name: 'W002 Publisher' }, created_at: '2026-10-17T00:00:00Z' };
const now = () => Math.floor(Date.now() / 1000);
const SESSION = { access_token: 'header.' + Buffer.from(JSON.stringify({ sub: USER.id, exp: now() + 3600, role: 'authenticated' })).toString('base64url') + '.sig',
  token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'w002-refresh', user: USER };
const PROFILE = { id: USER.id, display_name: 'W002 Publisher', username: 'w002_publisher', bio: 'Builds scary corridors.', creator_focus: 'Haunted attractions',
  website_url: 'https://example.test/', avatar_url: null, created_at: USER.created_at, updated_at: USER.created_at, haunt_name: null };
const P = '"><img src=x onerror="window.__xss=(window.__xss||0)+1"><script>window.__xss=(window.__xss||0)+1</script>';
const HOSTILE = { creator_id: '00000000-0000-4000-8000-0000000000d1', username: 'hostile_creator', display_name: 'Evil' + P, bio: 'Bio' + P,
  creator_focus: 'Focus' + P, website_url: 'javascript:window.__xss=1', avatar_url: 'http://tracker.example.test/pixel.png',
  published_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z' };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const results = []; const pass = (n) => results.push('PASS  ' + n);

  // ---- 1 & 2: publish and unpublish own page ----
  {
    const context = await browser.newContext(); const writes = []; let published = null; const errors = [];
    await context.addInitScript(([key, s]) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch (_) {} }, ['sb-fczxcvlyydcqdhjkejmd-auth-token', SESSION]);
    await context.route(SUPA + '/**', async (route) => {
      const req = route.request(); const url = new URL(req.url()); const m = req.method();
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
      if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') writes.push({ m, path: url.pathname, search: url.search, body: req.postData() });
      if (url.pathname === '/auth/v1/user') return json(200, USER);
      if (url.pathname === '/auth/v1/token') return json(200, SESSION);
      if (url.pathname === '/rest/v1/profiles') return json(200, one ? PROFILE : [PROFILE]);
      if (url.pathname === '/rest/v1/creator_publications') {
        if (m === 'POST') { published = { ...JSON.parse(req.postData()), published_at: '2026-10-17T00:00:00Z' }; return json(201, one ? published : [published]); }
        if (m === 'DELETE') { published = null; return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' }); }
        return json(200, one ? published : (published ? [published] : []));
      }
      if (url.pathname.startsWith('/rest/v1/')) return json(200, one ? null : []);
      if (url.pathname.startsWith('/storage/')) return json(200, []);
      return json(404, { message: 'not mocked' });
    });
    const page = await context.newPage(); page.on('dialog', (d) => d.accept()); page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + 'profile.html', { waitUntil: 'load' });
    await page.waitForSelector('#hs-profile-publish:not([disabled])', { timeout: 15000 });
    await page.click('#hs-profile-publish');
    await page.waitForSelector('#hs-profile-unpublish:not([hidden])', { timeout: 10000 });
    const posts = writes.filter((w) => w.path === '/rest/v1/creator_publications' && w.m === 'POST');
    assert.strictEqual(posts.length, 1, 'one publish request');
    const body = JSON.parse(posts[0].body);
    assert.strictEqual(body.creator_id, USER.id, 'publishes only the signed-in user\'s own creator_id');
    assert.deepStrictEqual(Object.keys(body).sort(), ['avatar_url', 'bio', 'creator_focus', 'creator_id', 'display_name', 'updated_at', 'username', 'website_url'].sort(), 'only public fields are sent');
    assert.ok(!JSON.stringify(body).includes(USER.email), 'the account email is never sent');
    pass('publish sends one upsert for the own creator_id with only public fields (no email)');
    await page.click('#hs-profile-unpublish');
    await page.waitForSelector('#hs-profile-unpublish[hidden]', { state: 'attached', timeout: 10000 });
    const dels = writes.filter((w) => w.path === '/rest/v1/creator_publications' && w.m === 'DELETE');
    assert.strictEqual(dels.length, 1, 'one unpublish request');
    assert.ok(dels[0].search.includes('creator_id=eq.' + USER.id), 'unpublish targets only the own row');
    pass('unpublish deletes only the signed-in user\'s publication');
    const other = writes.filter((w) => !['/rest/v1/creator_publications', '/rest/v1/profiles', '/auth/v1/token'].includes(w.path));
    assert.deepStrictEqual(other, [], 'no other writes');
    assert.deepStrictEqual(errors, []);
    await context.close();
  }

  // ---- 3: hostile published values render inertly ----
  {
    const context = await browser.newContext(); const avatarRequests = [];
    await context.route(SUPA + '/**', async (route) => {
      const req = route.request(); const url = new URL(req.url());
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
      if (url.pathname === '/rest/v1/creator_publications') return json(200, one ? HOSTILE : [HOSTILE]);
      if (url.pathname.startsWith('/rest/v1/')) return json(200, one ? null : []);
      if (url.pathname.startsWith('/auth/')) return json(401, { message: 'no session' });
      return json(200, []);
    });
    await context.route('http://tracker.example.test/**', (route) => { avatarRequests.push(route.request().url()); route.abort(); });
    for (const target of ['creators.html', 'creator.html?u=hostile_creator']) {
      const page = await context.newPage(); page.on('dialog', (d) => d.dismiss());
      await page.goto(base + target, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.innerText.includes('Evil'), null, { timeout: 15000 });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ xss: window.__xss || 0, links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        imgs: [...document.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter(Boolean) }));
      assert.strictEqual(r.xss, 0, target + ': no script executed');
      assert.ok(!r.links.some((h) => /^\s*(javascript|data|http):/i.test(h)), target + ': no javascript:/data:/http: links');
      assert.ok(!r.imgs.some((s) => s.startsWith('http://')), target + ': non-HTTPS avatar not loaded');
      await page.close();
    }
    assert.deepStrictEqual(avatarRequests, [], 'no request to the non-HTTPS avatar host');
    pass('directory and creator page render hostile published values inertly (no script, no javascript: link, no http avatar)');
    await context.close();
  }

  await browser.close(); server.close();
  results.forEach((r) => console.log(r));
  console.log('PASS: creator publishing workflows (' + results.length + ' checks).');
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
