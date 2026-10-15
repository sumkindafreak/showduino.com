// Static site smoke check. Run: node tools/check-website.mjs
// Checks deployment asset paths and JavaScript syntax without emulating hardware.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html','system.html','studio.html','hauntsync.html',
  'tools.html','aboutme.html','docs.html','support.html','privacy.html','terms.html'];
const content = (p) => readFileSync(path.join(root, p), 'utf8');
const localAsset = (url) => {
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('#') || url.startsWith('data:')) return null;
  const pathname = url.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  return pathname.startsWith('/') ? pathname.slice(1) : pathname;
};
let count = 0;
const scripts = new Set();

for (const page of pages) {
  assert.ok(existsSync(path.join(root, page)), `Missing page: ${page}`);
  const html = content(page);
  assert.match(html, /<main\b/i, `No main landmark: ${page}`);
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const file = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag);
    if (!file) continue;
    if (/^<link/i.test(tag) && !/\brel=["']stylesheet["']/i.test(tag)) continue;
    const target = localAsset(file[1]);
    if (!target) continue;
    assert.ok(existsSync(path.join(root, target)), `Broken asset on ${page}: ${file[1]}`);
    if (/^<script/i.test(tag) && target.endsWith('.js')) scripts.add(target);
    count += 1;
  }
  assert.ok(html.includes('showduino-stage-theme.css') || page === 'studio.html',
    `Missing stage theme on ${page}`);
}
const studio = content('studio.html');
for (const panel of ['introduction','timeline-editor','playback','audio-manager',
  'hauntsync','connect','devices','diagnostics','settings','help']) {
  assert.ok(studio.includes(`data-panel="${panel}"`), `Missing Studio navigation: ${panel}`);
}
for (const id of ['studio-save-button','studio-preview-button','studio-import-button',
  'studio-export-button','studio-header-more','studio-mobile-menu']) {
  assert.ok(studio.includes(`id="${id}"`), `Missing Studio action: ${id}`);
}
assert.ok(studio.includes('showduino-studio-theme.css'), 'Studio branding not loaded');
assert.ok(content('app.js').includes('if (!window.SHOWDUINO_CONFIG?.features?.subscriptions)'),
  'Legacy subscription lock fix not found');
for (const script of scripts) {
  const run = spawnSync(process.execPath, ['--check', script], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `JavaScript syntax: ${script}\n${run.stderr}`);
}
console.log(`PASS: ${pages.length} pages, ${count} asset references, ${scripts.size} scripts parsed.`);
console.log('Static check only: live browser interaction, network APIs, deployment and hardware need separate tests.');
