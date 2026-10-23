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
    // jsDelivr invents .min.js files that a package does not ship; pin the published file instead.
    if (/supabase-js@[^/]+\/dist\/umd\/supabase\.min\.js/.test(m[1])) unsafe.push(`${page}: supabase.min.js is CDN-generated, not in the npm package`);
  }
}
assert.deepStrictEqual(unsafe, [], 'third-party scripts without SRI or a pinned version');

// 2. Security headers.
const headers = fs.readFileSync('_headers', 'utf8');
for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy',
  'Permissions-Policy', 'Content-Security-Policy:']) {
  assert.ok(headers.includes(h), `_headers missing ${h}`);
}
// W005 (W5-06): the full policy is ENFORCED, not report-only.
assert.ok(!/Content-Security-Policy-Report-Only:/.test(headers), 'the CSP is enforced; a report-only copy would drift from it');
const csp = /^\s+Content-Security-Policy: ([^\n]+)/m.exec(headers)[1];
const directive = (name) => (csp.split(';').map((d) => d.trim()).find((d) => d === name || d.startsWith(name + ' ')) || '');
const scriptSrc = directive('script-src');
assert.ok(scriptSrc, 'enforced CSP has script-src');
assert.ok(!/'unsafe-inline'|'unsafe-eval'|'unsafe-hashes'|'strict-dynamic'|\*|data:|blob:|http:/.test(scriptSrc), `script-src must not allow inline, eval, wildcards or plain-http/data/blob script: ${scriptSrc}`);
for (const host of scriptSrc.split(/\s+/).slice(1).filter((s) => !s.startsWith("'"))) {
  assert.ok(['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://challenges.cloudflare.com'].includes(host), `unexpected script host ${host}`);
}
for (const [name, value] of [['default-src', "default-src 'self'"], ['object-src', "object-src 'none'"], ['base-uri', "base-uri 'self'"],
  ['frame-ancestors', "frame-ancestors 'none'"], ['form-action', "form-action 'self'"], ['frame-src', 'frame-src https://challenges.cloudflare.com']]) {
  assert.strictEqual(directive(name), value, `enforced CSP ${name}`);
}
assert.ok(/connect-src [^;]*https:\/\/fczxcvlyydcqdhjkejmd\.supabase\.co/.test(csp), 'connect-src allows the Showduino Supabase project');
execFileSync(process.execPath, ['tools/csp-inline-hashes.mjs', '--check'], { stdio: 'inherit' });

// 3. Legacy and non-site paths are not served.
const redirects = fs.readFileSync('_redirects', 'utf8');
for (const path of ['/HauntSyncForum_Configured/*', '/preview/*', '/supabase/*', '/functions/*', '/tests/*', '/docs/*', '/.github/*', '/firebase.json', '/firestore.rules',
  '/archive/*', '/touchscreen-ui', '/touchscreen-ui.html']) {
  assert.ok(new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\s+/retired\\s+30[1278]\\s*$', 'm').test(redirects), `_redirects does not retire ${path}`);
}
assert.ok(fs.existsSync('retired.html'), 'retired.html exists');
console.log(`Site security config: ${pages.length} pages checked for SRI, headers present, legacy paths retired.`);
