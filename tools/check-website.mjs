// Static site smoke check. Run: node tools/check-website.mjs
// Checks deployment asset paths and JavaScript syntax without emulating hardware.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html','system.html','studio.html','hauntsync.html','community.html','profile.html','account.html',
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
// The homepage image must be committed to GitHub, not linked to temporary
// chat media. Validate both formats as binaries and that markup uses them.
const home = content('index.html');
const imageFiles = [
  { path: 'media/showduino-chosen-main-hero.webp', minimum: 50000, format: 'webp' },
  { path: 'media/showduino-chosen-main-hero-mobile.avif', minimum: 8000, format: 'avif' }
];
for (const asset of imageFiles) {
  const fullPath = path.join(root, asset.path);
  assert.ok(existsSync(fullPath), `Homepage media missing: ${asset.path}`);
  const data = readFileSync(fullPath);
  assert.ok(data.length >= asset.minimum, `Homepage media looks truncated: ${asset.path}`);
  if (asset.format === 'webp') {
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  } else {
    assert.equal(data.toString('ascii', 4, 12), 'ftypavif');
  }
  assert.ok(home.includes(asset.path), `Homepage does not use ${asset.path}`);
}
assert.ok(home.includes('media="(max-width: 760px)"'), 'Mobile image source missing');
assert.ok(home.includes('og:image" content="https://show-duino.com/media/showduino-chosen-main-hero.webp"'), 'Social preview is stale');

// HauntSync uses its official logo (not a placeholder) and its own account identity.
const hsLogo = 'media/hauntsync-official-logo.webp';
const hsLogoFile = path.join(root, hsLogo);
assert.ok(existsSync(hsLogoFile), 'HauntSync logo was not committed');
const hsLogoData = readFileSync(hsLogoFile);
assert.ok(hsLogoData.length > 3000, 'HauntSync logo is missing or truncated');
assert.equal(hsLogoData.toString('ascii', 0, 4), 'RIFF', 'HauntSync logo must be a WebP image');
assert.equal(hsLogoData.toString('ascii', 8, 12), 'WEBP', 'HauntSync logo must be a WebP image');
for (const page of ['hauntsync.html', 'profile.html']) {
  assert.ok(content(page).includes(hsLogo), 'Official HauntSync logo missing from ' + page);
}
assert.ok(content('hauntsync.html').includes('js/cloud/supabase-service.js'),
  'HauntSync must use the same Supabase account service as Studio');
assert.ok(!content('hauntsync.html').includes('js/cloud/firebase-service.js'),
  'HauntSync unexpectedly reverted to the retired Firebase service');
assert.ok(content('profile.html').includes('id="hs-profile-form"'),
  'Creator profile editor missing');

const community = content('community.html');
for(const asset of ['js/hauntsync-share-model.js','js/hauntsync-library.js','js/cloud/supabase-service.js']) {
  assert.ok(community.includes(asset), 'HauntSync community page missing ' + asset);
}
assert.ok(content('hauntsync.html').includes('community.html'), 'Missing dashboard link to community');
assert.ok(community.includes('id="hs-share-consent"'), 'Community sharing must be opt-in');
// HauntSync and Showduino have their own identity. Never publish cross-project
// attributions, links or internal inspiration notes in website assets.
// Walk the deployed source tree, not just the top-level page templates.
const forbiddenCrossBrand = /\\bwrite[\\s-]?lite\\b|novels[-_]community|github\\.com\\/sumkindafreak\\/novels/i;
const checkedExtensions = new Set(['.html', '.css', '.js', '.md', '.sql', '.json']);
const excludedDirs = new Set(['.git', '.github', 'node_modules', 'tests', 'tools']);
const unwantedReferences = [];
function checkBrandReferences(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) checkBrandReferences(fullPath);
      continue;
    }
    if (!entry.isFile() || !checkedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    if (forbiddenCrossBrand.test(readFileSync(fullPath, 'utf8'))) {
      unwantedReferences.push(path.relative(root, fullPath));
    }
  }
}
checkBrandReferences(root);
assert.deepEqual(unwantedReferences, [], 'Cross-project branding is not allowed in Showduino website files');

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
