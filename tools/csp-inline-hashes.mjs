#!/usr/bin/env node
/* W002/W005: list the SHA-256 hashes of every inline <script> in the public pages, as
 * used in the Content-Security-Policy in _headers.
 *
 *   node tools/csp-inline-hashes.mjs           list hashes and the pages using them
 *   node tools/csp-inline-hashes.mjs --check   fail when a policy in _headers lacks a
 *                                              current hash, or holds a stale one
 *
 * W005 fixes: hashes are computed on the script text as a browser sees it (HTML parsing
 * turns CRLF and CR into LF, so a page saved with Windows line endings used to get a hash
 * the browser never matched), and only the Content-Security-Policy header values are
 * searched (a hash that appeared only in a comment in _headers used to pass the check). */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pages = readdirSync('.').filter((f) => f.endsWith('.html'));
const hashes = new Map();
for (const page of pages) {
  const html = readFileSync(page, 'utf8').replace(/\r\n?/g, '\n');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const h = `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`;
    if (!hashes.has(h)) hashes.set(h, []);
    hashes.get(h).push(page);
  }
}

if (process.argv.includes('--check')) {
  const policies = readFileSync('_headers', 'utf8').split('\n')
    .map((line) => line.match(/^\s+(Content-Security-Policy(?:-Report-Only)?):\s*(.+)$/))
    .filter(Boolean)
    .map(([, name, value]) => ({ name, value, scriptSrc: (value.split(';').find((d) => d.trim().startsWith('script-src ')) || '') }));
  if (!policies.length) { console.error('No Content-Security-Policy found in _headers.'); process.exit(1); }
  let failed = false;
  for (const policy of policies) {
    if (!policy.scriptSrc) continue;
    const missing = [...hashes].filter(([h]) => !policy.scriptSrc.includes(h));
    const listed = policy.scriptSrc.match(/'sha256-[A-Za-z0-9+/=]+'/g) || [];
    const stale = listed.filter((h) => !hashes.has(h));
    if (missing.length) {
      failed = true;
      console.error(`${policy.name}: script-src is missing inline scripts:\n` + missing.map(([h, p]) => `  ${h} in ${p.join(', ')}`).join('\n'));
    }
    if (stale.length) {
      failed = true;
      console.error(`${policy.name}: script-src lists hashes no page uses:\n  ${stale.join('\n  ')}`);
    }
  }
  if (failed) process.exit(1);
  console.log(`CSP inline-script hashes: all ${hashes.size} current hashes are in each script-src policy, and none are stale.`);
} else {
  for (const [h, p] of hashes) console.log(`${h}  ${p.join(', ')}`);
}
