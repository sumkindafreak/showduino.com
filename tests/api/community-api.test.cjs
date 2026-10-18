/* W004 end-to-end data test: the site's own modules (js/cloud/supabase-service.js and
 * js/cloud/hauntsync-community.js) with the real @supabase/supabase-js client, against a real
 * PostgREST server over a throw-away PostgreSQL database that has the W004 migration applied
 * (tools/community-api-env.sh). Only Supabase Auth's /user endpoint and Storage are stubbed by
 * the small gateway below; every table, policy, grant, trigger and function is real.
 *
 *   npm install --no-save @supabase/supabase-js@2.111.0
 *   POSTGREST_URL=... POSTGREST_JWT_SECRET=... node tests/api/community-api.test.cjs
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync } = require('child_process');
const supabaseJs = require('@supabase/supabase-js');

const API = process.env.POSTGREST_URL;
const SECRET = process.env.POSTGREST_JWT_SECRET;
const DB = process.env.COMMUNITY_TEST_DB || 'showduino_api_test';
if (!API || !SECRET) throw new Error('Run tools/community-api-env.sh start first.');

const OWNER = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea';
const U = { alice: '00000000-0000-4000-8000-00000000a11c', bob: '00000000-0000-4000-8000-00000000b0b0', carol: '00000000-0000-4000-8000-00000000ca01', mallory: '00000000-0000-4000-8000-00000000ba0d' };
const HOSTILE = '<img src=x onerror="window.__xss=1"><script>alert(1)</script>';

function sql(text) {
  return execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-d', DB, '-c', text], { encoding: 'utf8' }).trim();
}
function jwt(claims) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'HS256', typ: 'JWT' });
  const body = b({ aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
const ANON_KEY = jwt({ role: 'anon' });

// Gateway: /rest/v1 -> PostgREST, plus minimal Auth /user and Storage stand-ins.
const uploads = [];
const removed = [];
const gateway = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://gateway');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const auth = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const claims = (() => { try { return JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString()); } catch (_) { return {}; } })();
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (url.pathname === '/auth/v1/user') {
    if (!claims.sub) return json(401, { message: 'Auth session missing!' });
    return json(200, { id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.sub.slice(-4) + '@example.test', app_metadata: claims.app_metadata || {}, user_metadata: {}, created_at: '2026-10-18T00:00:00Z' });
  }
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
  if (url.pathname.startsWith('/storage/v1/object/community-images/') && req.method === 'POST') {
    const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/community-images/'.length));
    uploads.push({ path, sub: claims.sub, bytes: body.length });
    return json(200, { Key: 'community-images/' + path, Id: crypto.randomUUID() });
  }
  if (url.pathname === '/storage/v1/object/community-images' && req.method === 'DELETE') {
    removed.push(...(JSON.parse(body.toString() || '{}').prefixes || []));
    return json(200, []);
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const target = API + url.pathname.slice('/rest/v1'.length) + url.search;
    const headers = { ...req.headers };
    delete headers.host; delete headers['content-length'];
    const r = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const out = Buffer.from(await r.arrayBuffer());
    const h = {};
    r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k] = v; });
    res.writeHead(r.status, h);
    return res.end(out);
  }
  json(404, { message: 'not stubbed: ' + url.pathname });
});

const siteCode = ['js/cloud/supabase-service.js', 'js/cloud/hauntsync-community.js'].map((f) => [f, fs.readFileSync(f, 'utf8')]);

// One isolated browser-like context per person, each with its own client and session.
async function person(sub) {
  const store = new Map();
  const ctx = {
    console, URL, URLSearchParams, setTimeout, clearTimeout, Promise, TextEncoder, TextDecoder, Blob,
    crypto: crypto.webcrypto,
    location: { origin: 'https://show-duino.com', href: 'https://show-duino.com/' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    supabase: supabaseJs,
    SHOWDUINO_CONFIG: { features: { supabase: true, authentication: true }, supabase: { url: GATEWAY, publishableKey: ANON_KEY } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const [file, code] of siteCode) vm.runInContext(code, ctx, { filename: file });
  if (sub) {
    const { error } = await ctx.ShowduinoSupabase.client().auth.setSession({ access_token: jwt({ sub, role: 'authenticated' }), refresh_token: 'unused' });
    if (error) throw error;
  }
  return ctx.HauntSyncCommunity;
}

async function rejects(promise, pattern, label) {
  try { await promise; } catch (error) {
    assert.ok(pattern.test(String(error.message)), `${label}: unexpected error "${error.message}"`);
    return;
  }
  assert.fail(`${label}: should have been refused`);
}

let GATEWAY;
const results = [];
const pass = (msg) => { results.push(msg); console.log('PASS  ' + msg); };

(async () => {
  await new Promise((r) => gateway.listen(0, '127.0.0.1', r));
  GATEWAY = `http://127.0.0.1:${gateway.address().port}`;

  // Fixture accounts (as the database superuser, like Supabase Auth signups).
  sql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${U.alice}', 'alice@example.test', '{"display_name":"Alice"}'), ('${U.bob}', 'bob@example.test', '{"display_name":"Bob"}'),
    ('${U.carol}', 'carol@example.test', '{"display_name":"Carol"}'), ('${U.mallory}', 'mallory@example.test', '{"display_name":"Mallory"}')
    on conflict do nothing;
    insert into public.profiles (id, display_name) values ('${OWNER}', 'Showduino-admin') on conflict do nothing;
    insert into public.creator_publications (creator_id, username, display_name) values
      ('${OWNER}', 'showduino_admin', 'Showduino-admin'), ('${U.alice}', 'alice', 'Alice'),
      ('${U.bob}', 'bob', 'Bob'), ('${U.mallory}', 'mallory', 'Mallory') on conflict do nothing;`);

  const visitor = await person(null);
  const alice = await person(U.alice);
  const bob = await person(U.bob);
  const carol = await person(U.carol);
  const mallory = await person(U.mallory);
  const owner = await person(OWNER);

  // Visitor
  assert.strictEqual((await visitor.status()).role, 'visitor');
  assert.strictEqual((await visitor.categories()).length, 8);
  assert.strictEqual(await visitor.founderId(), OWNER);
  pass('visitor: status, 8 categories, founder id');

  // Statuses
  assert.strictEqual((await alice.status()).role, 'member');
  assert.strictEqual((await owner.status()).role, 'owner');
  assert.strictEqual((await carol.status()).can_participate, false);
  pass('status: Alice member, founder owner, unpublished Carol cannot participate');

  // Posting, with an image and hostile text
  const png = new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/png' });
  const postId = await alice.createPost({ title: 'Fog chiller ' + HOSTILE, content: 'Day one.\n' + HOSTILE, category: 'effects', kind: 'build_log', imageFile: png });
  assert.ok(uploads.length === 1 && uploads[0].path.startsWith(U.alice + '/post-') && uploads[0].path.endsWith('.png'), 'image uploaded to own folder');
  const post = await visitor.getPost(postId);
  assert.ok(post && post.author_name === 'Alice' && post.author.username === 'alice' && !post.is_founder);
  assert.ok(post.title.includes(HOSTILE), 'text stored verbatim (rendering is tested in the browser suite)');
  assert.ok(/\/storage\/v1\/object\/public\/community-images\//.test(post.image_url), 'public image URL built from the stored path');
  await rejects(alice.createPost({ title: 'x', content: 'y', imageFile: new Blob(['<svg onload=alert(1)>'], { type: 'image/png' }) }), /JPEG, PNG or WebP/, 'fake PNG');
  pass('Alice posts a build log with an image; author set by the server; fake image refused');

  // Search, filters
  assert.strictEqual((await visitor.listPosts({ search: 'chiller' })).length, 1);
  assert.strictEqual((await visitor.listPosts({ search: 'chiller),author_id.eq.x' })).length, 0, 'filter syntax in search is neutralised');
  assert.strictEqual((await visitor.listPosts({ category: 'audio' })).length, 0);
  assert.strictEqual((await visitor.listPosts({ kind: 'build_log' })).length, 1);
  pass('search, category and kind filters; filter syntax in search is neutralised');

  // Comments and replies
  const c1 = await bob.addComment(postId, 'Nice! ' + HOSTILE);
  const r1 = await alice.addComment(postId, 'Thanks', c1);
  await alice.addComment(postId, 'Reply to a reply', r1);
  const comments = await visitor.listComments(postId);
  assert.strictEqual(comments.length, 3);
  assert.ok(comments.slice(1).every((c) => c.parent_id === c1), 'replies stay one level deep');
  assert.strictEqual((await visitor.listPosts({ search: 'chiller' }))[0].comment_count, 3);
  await rejects(alice.updateComment(c1, 'hijack'), /not yours/, 'edit other comment');
  pass('comments and one-level replies; comment counts; cannot edit others');

  // Unpublished member
  await rejects(carol.createPost({ title: 't', content: 'c', category: 'general' }), /publish/i, 'unpublished post');
  pass('unpublished member is told to publish a creator profile first');

  // Following feed
  await alice.follow(U.bob);
  const bobPost = await bob.createPost({ title: 'Audio Node wiring', content: 'Photos soon', category: 'audio' });
  const feed = await alice.listPosts({ following: true });
  assert.deepStrictEqual(feed.map((p) => p.id), [bobPost]);
  assert.ok(await alice.isFollowing(U.bob));
  await alice.unfollow(U.bob);
  assert.deepStrictEqual(await alice.listPosts({ following: true }), []);
  await rejects(alice.follow(U.alice), /cannot follow/, 'self follow');
  pass('following feed shows only followed creators; unfollow; no self-follow');

  // Mallory attempts administration
  for (const [label, call] of [
    ['stats', () => mallory.admin.stats()], ['members', () => mallory.admin.members('')],
    ['suspend', () => mallory.admin.setMemberStatus(U.alice, 'suspended', 'x')],
    ['moderate', () => mallory.admin.moderate('post', postId, 'hide', 'x')],
    ['category', () => mallory.admin.saveCategory({ slug: 'mallory', name: 'M' })]
  ]) await rejects(call(), /Only the Showduino owner/, 'Mallory ' + label);
  assert.deepStrictEqual(await mallory.admin.log(), [], 'Mallory reads an empty moderation log');
  assert.deepStrictEqual(await mallory.admin.reports(), [], 'Mallory reads no reports');
  pass('Mallory: every owner function refused by the database; log and reports empty for her');

  // Reports
  const spam = await mallory.createPost({ title: 'Cheap fog', content: 'buy now', category: 'effects' });
  await alice.report('post', spam, 'spam', 'Advert');
  await rejects(alice.report('post', spam, 'spam', 'again'), /already/, 'duplicate report');
  await rejects(alice.report('post', spam, 'not-a-reason', ''), /reason/, 'bad reason');
  pass('reports: filed once, duplicates and bad reasons refused');

  // Owner moderation
  const stats = await owner.admin.stats();
  assert.ok(stats.members >= 5 && stats.open_reports === 1);
  const reports = await owner.admin.reports('open');
  assert.strictEqual(reports.length, 1);
  assert.strictEqual(reports[0].target.title, 'Cheap fog');
  assert.strictEqual(reports[0].reporter.username, 'alice');
  await owner.admin.moderate('post', spam, 'hide', 'Spam');
  await owner.admin.resolveReport(reports[0].id, 'actioned', 'Hidden');
  assert.strictEqual((await visitor.listPosts({ search: 'Cheap' })).length, 0, 'hidden post gone for visitors');
  assert.strictEqual((await mallory.getPost(spam)).status, 'hidden', 'author still sees it, marked hidden');
  await owner.admin.moderate('post', postId, 'feature');
  assert.strictEqual((await visitor.listPosts({ featured: true }))[0].id, postId);
  const members = await owner.admin.members('');
  assert.strictEqual(members.filter((m) => m.is_owner).length, 1);
  assert.strictEqual(members.find((m) => m.is_owner).user_id, OWNER);
  await rejects(owner.admin.setMemberStatus(OWNER, 'suspended', 'oops'), /cannot be restricted or suspended/, 'owner lockout');
  await owner.admin.setMemberStatus(U.mallory, 'suspended', 'Spam');
  assert.strictEqual((await visitor.creatorsById([U.mallory])).size, 0, 'suspended creator hidden');
  await rejects(mallory.createPost({ title: 't', content: 'c', category: 'effects' }), /cannot do that|Restricted and suspended/, 'suspended post');
  await owner.admin.removeImage(uploads[0].path);
  assert.deepStrictEqual(removed, [uploads[0].path]);
  const log = await owner.admin.log();
  assert.ok(['hide', 'report_actioned', 'feature', 'member_suspended'].every((a) => log.some((l) => l.action === a && l.actor_id === OWNER)), 'actions logged with the owner as actor');
  assert.ok((await owner.creatorStats(OWNER)).founder === true && (await owner.creatorStats(U.alice)).founder === false);
  pass('owner: stats, report queue with targets, hide, resolve, feature, member list (one owner), cannot suspend self, suspend Mallory, remove image, audit log, founder badge data');

  console.log(`PASS: ${results.length} end-to-end community checks against real PostgREST + PostgreSQL.`);
  gateway.close();
})().catch((error) => {
  console.error('FAIL', error && error.stack || error);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=community-api::${String(error?.message || error).replace(/\r?\n/g, ' ').slice(0, 900)}`);
  gateway.close();
  process.exit(1);
});
