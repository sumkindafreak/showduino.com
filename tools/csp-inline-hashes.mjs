#!/usr/bin/env node
/* W002: list the SHA-256 hashes of every inline <script> in the public pages, as
 * used in the Content-Security-Policy in _headers. `--check` fails when _headers
 * is missing a current hash (an inline script was edited without updating CSP). */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const pages = readdirSync('.').filter((f) => f.endsWith('.html'));
const hashes = new Map();
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const h = `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`;
    if (!hashes.has(h)) hashes.set(h, []);
    hashes.get(h).push(page);
  }
}
if (process.argv.includes('--check')) {
  const headers = readFileSync('_headers', 'utf8');
  const missing = [...hashes].filter(([h]) => !headers.includes(h));
  if (missing.length) {
    console.error('Inline scripts not covered by _headers CSP:\n' + missing.map(([h, p]) => `  ${h} in ${p.join(', ')}`).join('\n'));
    process.exit(1);
  }
  console.log(`CSP inline-script hashes: all ${hashes.size} current hashes are in _headers.`);
} else {
  for (const [h, p] of hashes) console.log(`${h}  ${p.join(', ')}`);
}
