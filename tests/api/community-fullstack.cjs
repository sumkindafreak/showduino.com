/* W004 full-stack browser test (CI): the real HauntSync pages, the real pinned supabase-js from
 * the CDN, real PostgREST and PostgreSQL with the W004 migration (tools/community-api-env.sh).
 * The test server serves the site, points config/runtime-config.js at itself, proxies /rest/v1 to
 * PostgREST and stands in for Supabase Auth /user (tokens are signed with the local test secret).
 * Signs in as the founder and as a hostile member and checks what each can see and do. */
'use strict';
const fs = require('fs'); const path = require('path'); const http = require('http'); const crypto = require('crypto'); const assert = require('assert');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const API = process.env.POSTGREST_URL; const SECRET = process.env.POSTGREST_JWT_SECRET;
const DB = process.env.COMMUNITY_TEST_DB || 'showduino_api_test';
if (!API || !SECRET) throw new Error('Run tools/community-api-env.sh start first.');
const OWNER = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea';
const MAL = '00000000-0000-4000-8000-00000000fa11';
const HOSTILE = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

const sql = (text) => execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-d', DB, '-c', text], { encoding: 'utf8' }).trim();
function jwt(claims) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'HS256', typ: 'JWT' });
  const body = b({ aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}

let base;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const send = (code, type, data) => { res.writeHead(code, { 'content-type': type }); res.end(data); };
  if (url.pathname === '/config/runtime-config.js') {
    return send(200, 'text/javascript', `window.SHOWDUINO_CONFIG = Object.freeze({ environment: 'test', features: { supabase: true, authentication: true, cloudSync: true }, supabase: { url: ${JSON.stringify(base.replace(/\/$/, ''))}, publishableKey: ${JSON.stringify(jwt({ role: 'anon' }))} } });`);
  }
  if (url.pathname === '/auth/v1/user') {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    let claims = {}; try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch (_) {}
    if (!claims.sub) return send(401, 'application/json', '{"message":"Auth session missing!"}');
    return send(200, 'application/json', JSON.stringify({ id: claims.sub, aud: 'authenticated', role: 'authenticated', email: 'x@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-18T00:00:00Z' }));
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
    const r = await fetch(API + url.pathname.slice(8) + url.search, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const h = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k] = v; });
    res.writeHead(r.status, h); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const p = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(404, 'text/plain', 'not found');
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

async function signedIn(browser, sub) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Spam' : undefined));
  await page.goto(base + 'guidelines.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoSupabase?.enabled?.(), null, { timeout: 15000 });
  if (sub) {
    const err = await page.evaluate(async (token) => (await window.ShowduinoSupabase.client().auth.setSession({ access_token: token, refresh_token: 'unused' })).error?.message || null, jwt({ sub, role: 'authenticated' }));
    assert.strictEqual(err, null, 'session set');
  }
  return { context, page };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  sql(`insert into auth.users (id, email) values ('${MAL}', 'mal@example.test') on conflict do nothing;
       insert into public.profiles (id, display_name) values ('${OWNER}', 'Showduino-admin') on conflict do nothing;
       insert into public.creator_publications (creator_id, username, display_name) values
         ('${OWNER}', 'showduino_admin', 'Showduino-admin'), ('${MAL}', 'malfs', 'Mal') on conflict do nothing;`);
  const browser = await chromium.launch();
  const errors = [];

  // Mallory posts through the real composer, reports nothing, and is refused the admin page.
  let { context, page } = await signedIn(browser, MAL);
  await page.goto(base + 'feed.html', { waitUntil: 'load' });
  await page.click('#hs-composer-open', { timeout: 15000 });
  await page.fill('#hs-post-title', 'Full stack ' + HOSTILE);
  await page.fill('#hs-post-content', 'Body ' + HOSTILE);
  await page.selectOption('#hs-post-category', 'effects');
  await page.click('#hs-post-submit');
  await page.waitForURL(/feed\.html\?post=/, { timeout: 15000 });
  await page.waitForSelector('#hs-post-detail h1', { timeout: 15000 });
  const postId = new URL(page.url()).searchParams.get('post');
  assert.ok((await page.textContent('#hs-post-detail h1')).includes('<img src=x'), 'title stored and shown as text');
  assert.strictEqual(sql(`select author_name from public.community_posts where id = '${postId}'`), 'Mal', 'server-side author name');
  await page.goto(base + 'admin.html', { waitUntil: 'load' });
  await page.waitForFunction(() => /only for the Showduino founder/.test(document.getElementById('hs-admin-gate').textContent), null, { timeout: 15000 });
  const forced = await page.evaluate(async () => { try { await window.HauntSyncCommunity.admin.stats(); return 'allowed'; } catch (e) { return e.message; } });
  assert.ok(/Only the Showduino owner/.test(forced), 'database refuses admin_stats for a member: ' + forced);
  const tamper = await page.evaluate(async () => { try { const r = await window.ShowduinoSupabase.client().from('app_owner').select('*'); return r.error ? r.error.message : 'rows: ' + r.data.length; } catch (e) { return e.message; } });
  assert.ok(/permission denied/.test(tamper), 'app_owner unreadable: ' + tamper);
  assert.strictEqual(await page.evaluate(() => window.__xss || 0), 0);
  errors.push(...page.errors); await context.close();
  console.log('PASS  member (real stack): posts via the UI with server-set author; admin page closed; database refuses admin calls and app_owner reads');

  // The founder sees the dashboard and hides the post.
  ({ context, page } = await signedIn(browser, OWNER));
  await page.goto(base + 'admin.html', { waitUntil: 'load' });
  await page.waitForSelector('#hs-admin:not([hidden])', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#hs-stats .hs-stat').length > 5, null, { timeout: 15000 });
  await page.click('[data-section="content"]');
  await page.waitForSelector('#hs-content-list .hs-admin-item', { timeout: 15000 });
  await page.click(`#hs-content-list .hs-admin-item:has(a[href*="${postId}"]) .btn:text-is("Hide")`);
  await page.waitForFunction((id) => true, postId);
  await new Promise((r) => setTimeout(r, 1500));
  assert.strictEqual(sql(`select status from public.community_posts where id = '${postId}'`), 'hidden', 'post hidden in the database');
  assert.strictEqual(sql(`select count(*) from public.moderation_log where action = 'hide' and actor_id = '${OWNER}' and target_id = '${postId}'`), '1', 'audit log entry');
  await page.click('[data-section="members"]');
  await page.waitForFunction(() => /Owner \(protected\)/.test(document.getElementById('hs-member-table').textContent), null, { timeout: 15000 });
  assert.strictEqual(await page.evaluate(() => window.__xss || 0), 0);
  errors.push(...page.errors); await context.close();
  console.log('PASS  founder (real stack): dashboard loads, hides the post (database + audit log), owner row protected');

  // A visitor no longer sees it.
  ({ context, page } = await signedIn(browser, null));
  await page.goto(base + 'feed.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('hs-feed-status').textContent), null, { timeout: 15000 });
  assert.ok(!(await page.textContent('#hs-feed-list')).includes('Full stack'), 'hidden post not shown to visitors');
  errors.push(...page.errors); await context.close();
  console.log('PASS  visitor (real stack): hidden post is gone');

  assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log('PASS  no page errors');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e.stack || e); if (process.env.GITHUB_ACTIONS) console.log(`::error title=community-fullstack::${String(e.message).replace(/\r?\n/g, ' ').slice(0, 900)}`); server.close(); process.exit(1); });
