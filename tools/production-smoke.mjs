#!/usr/bin/env node
/* W002 production smoke test (read-only GET requests only).
 *
 *   node tools/production-smoke.mjs [baseUrl] [--strict]
 *
 * Reports, as GitHub annotations when run in Actions:
 *  - HTTP status of every public page and of routes that should NOT be served
 *    (legacy Firebase forum, preview forum, server code, SQL, tests);
 *  - security response headers;
 *  - whether the deployed Studio contains each W001/W002 fix;
 *  - the SRI hash of every third-party script referenced by the pages.
 * Without --strict it never fails: it is an evidence probe. With --strict it
 * exits 1 when an expected protection is missing (use after deployment). */
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const base = (args.find((a) => !a.startsWith('--')) || 'https://show-duino.com').replace(/\/$/, '');
const inActions = !!process.env.GITHUB_ACTIONS;
const failures = [];
const note = (level, msg) => { console.log(inActions ? `::${level}::${msg.replace(/\n/g, ' ')}` : `[${level}] ${msg}`); };

const PUBLIC = ['/', '/index.html', '/system.html', '/studio.html', '/hauntsync.html', '/community.html', '/creators.html',
  '/welcome.html', '/account.html', '/profile.html', '/tools.html', '/aboutme.html', '/docs.html', '/support.html',
  '/privacy.html', '/terms.html', '/retired'];
const SHOULD_NOT_SERVE = ['/HauntSyncForum_Configured/forum.html', '/HauntSyncForum_Configured/index.html',
  '/HauntSyncForum_Configured/auth.js', '/preview/hauntsync.html', '/preview/hauntsync-preview.js',
  '/functions/index.js', '/supabase/hauntsync_shared_shows_v1.sql', '/tests/hauntsync-profile.test.cjs',
  '/firebase.json', '/firestore.rules', '/DEPLOY.md', '/.github/workflows/studio-validate.yml', '/docs/LAUNCH_SETUP.md'];
const HEADERS = ['content-security-policy', 'content-security-policy-report-only', 'strict-transport-security',
  'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'server'];
const FIXES = [
  ['W-001 clip label as text', '/js/timeline-fx-daw.js', "title.textContent = String(clip.label || clip.type || '')"],
  ['W-002 firmware upload pre-flight', '/js/studio-deploy.js', 'function uploadPolicyErrors(plan)'],
  ['W-005 import shape and size', '/js/studio-projects.js', 'function assertImportableShape(parsed)'],
  ['W002 unsafe identifiers refused', '/js/studio-projects.js', 'function assertSafeIdentifiers('],
  ['W002 project browser as text', '/js/timeline.js', "nameEl.textContent = String(p.project.name || 'Untitled Show')"],
  ['W005 Studio controls without inline handlers', '/js/studio-actions.js', 'window.ShowduinoActions = Object.freeze(']
];

// Cloudflare Pages answers /page.html with 308 -> /page, so follow redirects and
// record the chain. Only GET requests are made.
async function get(path, opts = {}) {
  let url = base + path; const chain = [];
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { redirect: 'manual', ...opts });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      chain.push(res.status); url = new URL(res.headers.get('location'), url).toString(); continue;
    }
    const body = await res.text();
    return { res, body, chain, finalUrl: url };
  }
  throw new Error('too many redirects for ' + path);
}
const lines = { public: [], blocked: [], served: [], fixes: [] };

const isHtml404 = (r) => r.res.status === 404 || (r.res.status === 200 && /<title>[^<]*(not found|404)/i.test(r.body.slice(0, 3000)));

(async () => {
  note('notice', `Probing ${base} (read-only)`);
  for (const p of PUBLIC) {
    const r = await get(p);
    const ok = r.res.status === 200;
    lines.public.push(`${p}=${r.chain.concat(r.res.status).join('>')}`);
    if (!ok) failures.push(`public page ${p} returned ${r.res.status}`);
  }
  note(failures.length ? 'warning' : 'notice', `public pages: ${lines.public.join(' ')}`);
  for (const p of SHOULD_NOT_SERVE) {
    const r = await get(p);
    const blocked = isHtml404(r) || r.res.status >= 400 || (r.res.status === 200 && /\/gone(\.html)?$|retired/i.test(r.finalUrl + r.body.slice(0, 400)));
    (blocked ? lines.blocked : lines.served).push(`${p}=${r.chain.concat(r.res.status).join('>')}`);
    if (!blocked) failures.push(`${p} is still served`);
  }
  note('notice', `not served: ${lines.blocked.join(' ') || '(none)'}`);
  note(lines.served.length ? 'warning' : 'notice', `STILL SERVED: ${lines.served.join(' ') || '(none)'}`);
  for (const page of ['/', '/studio.html', '/account.html']) {
    const r = await get(page);
    const parts = HEADERS.map((h) => `${h}=${r.res.headers.get(h) ? r.res.headers.get(h).slice(0, 160) : '(none)'}`);
    note('notice', `headers ${page}: ${parts.join(' | ')}`);
  }
  const home = await get('/');
  if (!home.res.headers.get('content-security-policy') && !home.res.headers.get('content-security-policy-report-only')) failures.push('no CSP header (enforced or report-only)');
  if (!home.res.headers.get('x-content-type-options')) failures.push('no X-Content-Type-Options');
  for (const [name, path, marker] of FIXES) {
    const r = await get(path);
    const present = r.res.status === 200 && r.body.includes(marker);
    lines.fixes.push(`${name}: ${present ? 'DEPLOYED' : 'NOT DEPLOYED'}`);
    if (!present) failures.push(`${name} not deployed`);
  }
  note('notice', `deployed fixes: ${lines.fixes.join('; ')}`);
  // Third-party scripts referenced by public pages, with their SRI hashes.
  const seen = new Map();
  for (const p of PUBLIC.filter((x) => x.endsWith('.html') || x === '/')) {
    const r = await get(p);
    for (const m of r.body.matchAll(/<script[^>]+src="(https:\/\/[^"]+)"([^>]*)>/g)) {
      const integrity = /integrity="([^"]+)"/.exec(m[0]);
      if (!seen.has(m[1])) seen.set(m[1], { pages: [], integrity: integrity ? integrity[1] : null });
      seen.get(m[1]).pages.push(p);
    }
  }
  for (const [url, info] of seen) {
    try {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const sri = 'sha384-' + createHash('sha384').update(buf).digest('base64');
      const match = info.integrity ? (info.integrity === sri ? 'MATCHES' : 'MISMATCH') : 'MISSING';
      note(match === 'MISMATCH' ? 'error' : 'notice', `third-party ${url} status=${res.status} bytes=${buf.length} ${sri} page-integrity=${match} pages=${info.pages.length}`);
      if (match !== 'MATCHES') failures.push(`SRI ${match} for ${url}`);
    } catch (e) { note('warning', `third-party ${url} fetch failed: ${e.message}`); }
  }
  note(failures.length ? 'warning' : 'notice', `summary: ${failures.length} expectation(s) not met${failures.length ? ': ' + failures.join('; ') : ''}`);
  if (strict && failures.length) process.exit(1);
})().catch((e) => { note('error', `smoke test crashed: ${e.message}`); process.exit(2); });
