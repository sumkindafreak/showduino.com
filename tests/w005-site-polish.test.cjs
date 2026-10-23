/* W005 P2 static checks (W5-17 to W5-21): skip links, canonical and social tags, sitemap,
 * no hotlinked images, unused files archived and not served, home-page messaging,
 * retired Relay wording and no internal checklist links on public pages. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const problems = [];
const fail = (msg) => problems.push(msg);

const noindex = (html) => /<meta name="robots" content="[^"]*noindex/i.test(html);
for (const page of pages) {
  const html = read(page);

  // Skip link (W5-17): in the HTML, or added by js/site-nav.js on pages that load it.
  const link = /<body[^>]*>\s*<a class="skip-link" href="#([^"]+)">Skip to main content<\/a>/.exec(html);
  const nav = html.includes('js/site-nav.js');
  if (!link && !nav) fail(`${page}: no skip link`);
  if (link) {
    const main = /<main\b[^>]*>/.exec(html);
    if (!main) fail(`${page}: skip link but no <main>`);
    else if (!main[0].includes(`id="${link[1]}"`) && !nav) fail(`${page}: skip link target #${link[1]} is not the <main>`);
  }

  // Canonical and social tags (W5-18) on every indexable page.
  if (noindex(html)) continue;
  if (page === '404.html') { fail('404.html must be noindex'); continue; }
  const slug = page === 'index.html' ? '' : page.replace(/\.html$/, '');
  const canonical = /<link rel="canonical" href="([^"]+)">/.exec(html);
  if (page === 'creator.html') {
    if (canonical) fail('creator.html renders many profiles (?u=); it must not declare one canonical URL');
  } else if (!canonical || canonical[1] !== `https://show-duino.com/${slug}`) {
    fail(`${page}: canonical should be https://show-duino.com/${slug} (found ${canonical ? canonical[1] : 'none'})`);
  }
  for (const tag of ['og:title', 'og:description', 'og:image', 'og:type']) {
    if (!new RegExp(`<meta property="${tag}" content="[^"]+">`).test(html)) fail(`${page}: missing ${tag}`);
  }
  if (!/<meta name="twitter:card" content="summary_large_image">/.test(html)) fail(`${page}: missing twitter:card`);
  const image = /<meta property="og:image" content="https:\/\/show-duino\.com\/([^"]+)">/.exec(html);
  if (image && !fs.existsSync(path.join(ROOT, image[1]))) fail(`${page}: og:image ${image[1]} does not exist`);
}

// Sitemap lists canonical URLs of real, indexable pages.
const sitemap = [...read('sitemap.xml').matchAll(/<loc>https:\/\/show-duino\.com\/([^<]*)<\/loc>/g)].map((m) => m[1]);
assert.ok(sitemap.length >= 10, 'sitemap lists the public pages');
for (const slug of sitemap) {
  const file = slug === '' ? 'index.html' : `${slug}.html`;
  if (slug.endsWith('.html')) fail(`sitemap: ${slug} should be the extensionless canonical URL`);
  else if (!fs.existsSync(path.join(ROOT, file))) fail(`sitemap: ${slug} has no page`);
  else if (noindex(read(file))) fail(`sitemap: ${slug} is noindex`);
}

// Images (W5-20): no page hotlinks a photo from another site.
for (const page of pages) {
  for (const m of read(page).matchAll(/<img\b[^>]*\bsrc="(https?:\/\/[^"]+)"/g)) fail(`${page}: hotlinked image ${m[1]}`);
}

// Legacy files (W5-19): archived, retired by _redirects, and referenced by nothing served.
const redirects = read('_redirects');
for (const route of ['/archive/*', '/touchscreen-ui.html']) {
  if (!new RegExp(`^${route.replace(/[.*/]/g, '\\$&')}\\s+/retired\\s+30[1278]\\s*$`, 'm').test(redirects)) fail(`_redirects does not retire ${route}`);
}
assert.ok(!fs.existsSync(path.join(ROOT, 'touchscreen-ui.html')), 'touchscreen-ui.html is archived');
const archived = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel); else if (e.name !== 'README.md') archived.push(e.name);
  }
})('archive');
const servedText = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (/^(archive|node_modules|tests|docs|tools|supabase|functions|preview|HauntSyncForum_Configured|\.)/.test(rel)) continue;
    if (e.isDirectory()) walk(rel);
    else if (/\.(html|js|css|json|webmanifest|xml)$/.test(e.name)) servedText.push([rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]);
  }
})('');
const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const name of archived) {
  const ref = new RegExp(`(^|[/"'(\\s=])${escape(name)}`);
  for (const [file, text] of servedText) if (ref.test(text)) fail(`${file} references archived ${name}`);
}
for (const [file, text] of servedText) if (/["'(/]archive\//.test(text)) fail(`${file} references the archive folder`);
for (const [file] of servedText) {
  const size = fs.statSync(path.join(ROOT, file)).size;
  if (size > 3 * 1024 * 1024) fail(`${file} is ${(size / 1048576).toFixed(1)} MB`);
}

// Messaging (W5-21).
const home = read('index.html');
for (const phrase of ['Off-the-shelf', 'Modular', 'Field-replaceable', 'not a certified life-safety system', 'tools.html#modules']) {
  if (!home.includes(phrase)) fail(`home page lacks "${phrase}"`);
}
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
for (const page of ['index.html', 'system.html', 'tools.html', 'support.html', 'aboutme.html', 'docs.html']) {
  const body = text(read(page));
  for (const m of body.matchAll(/\brelay node\b|\brelay outputs?\b/gi)) {
    const around = body.slice(Math.max(0, m.index - 80), m.index + 80);
    if (!/retired|legacy/i.test(around)) fail(`${page}: "${m[0]}" described as current: …${around.trim()}…`);
  }
}
for (const page of pages) {
  if (/showduino\.com\/blob\/main\/docs\/[A-Z_]*CHECKLIST/i.test(read(page))) fail(`${page}: links to an internal launch checklist`);
}

if (problems.length) {
  console.error('FAIL\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`W005 site polish: ${pages.length} pages have skip links and social tags where indexable; sitemap canonical; no hotlinks; ${archived.length} archived files unreferenced; messaging checks pass.`);
