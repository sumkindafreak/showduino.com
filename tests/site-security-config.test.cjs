/* W002: static guard for the hosting security configuration (Cloudflare Pages). */
const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');

// 1. Every third-party script is pinned to a version and has SRI.
const pages = fs.readdirSync('.').filter((f) => f.endsWith('.html'));
const unsafe = [];
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  for (const m of html.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"[^>]*>/g)) {
    if (!/integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/.test(m[0]) || !/crossorigin="anonymous"/.test(m[0])) unsafe.push(`${page}: ${m[1]}`);
    if (!/@\d+\.\d+\.\d+/.test(m[1])) unsafe.push(`${page}: unpinned ${m[1]}`);
  }
}
assert.deepStrictEqual(unsafe, [], 'third-party scripts without SRI or a pinned version');

// 2. Security headers.
const headers = fs.readFileSync('_headers', 'utf8');
for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy',
  'Permissions-Policy', "Content-Security-Policy: object-src 'none'; base-uri 'self'; frame-ancestors 'none'", 'Content-Security-Policy-Report-Only:']) {
  assert.ok(headers.includes(h), `_headers missing ${h}`);
}
const reportOnly = /Content-Security-Policy-Report-Only: ([^\n]+)/.exec(headers)[1];
assert.ok(!/script-src[^;]*'unsafe-inline'/.test(reportOnly), 'target CSP must not allow inline script');
assert.ok(!/script-src[^;]*'unsafe-eval'/.test(reportOnly), 'target CSP must not allow eval');
execFileSync(process.execPath, ['tools/csp-inline-hashes.mjs', '--check'], { stdio: 'inherit' });

// 3. Legacy and non-site paths are not served.
const redirects = fs.readFileSync('_redirects', 'utf8');
for (const path of ['/HauntSyncForum_Configured/*', '/preview/*', '/supabase/*', '/functions/*', '/tests/*', '/docs/*', '/.github/*', '/firebase.json', '/firestore.rules']) {
  assert.ok(new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\s+/retired\\s+30[1278]\\s*$', 'm').test(redirects), `_redirects does not retire ${path}`);
}
assert.ok(fs.existsSync('retired.html'), 'retired.html exists');
console.log(`Site security config: ${pages.length} pages checked for SRI, headers present, legacy paths retired.`);
