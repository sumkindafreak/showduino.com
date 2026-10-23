/* W005 P2 browser test (W5-16, W5-17): every page at 320, 375, 768, 1024 and 1440 px.
 *
 *  - no sideways scrolling;
 *  - exactly one visible h1 and no skipped heading levels;
 *  - the first Tab reaches "Skip to main content", which is then visible, and
 *    activating it moves focus to <main>;
 *  - every visible control is at least 24 x 24 px (WCAG 2.2 target size), apart from
 *    links inside a sentence;
 *  - every image has alt text.
 * Studio is also checked with a show loaded, so the timeline track buttons are measured.
 * Supabase, the CDNs and the hardware LAN addresses are never contacted. */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const WIDTHS = [320, 375, 768, 1024, 1440];
const problems = [];

function audit() {
  const out = { overflow: null, h1: 0, jumps: [], small: [], noAlt: [] };
  const sw = document.documentElement.scrollWidth;
  if (sw > window.innerWidth + 1) out.overflow = `${sw}px wide in a ${window.innerWidth}px window`;
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
  out.h1 = headings.filter((h) => h.tagName === 'H1').length;
  let prev = 0;
  for (const h of headings) { const level = +h.tagName[1]; if (prev && level > prev + 1) out.jumps.push(`h${prev} → ${h.tagName.toLowerCase()} "${h.textContent.trim().slice(0, 30)}"`); prev = level; }
  for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])')) {
    if (el.classList.contains('skip-link') || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (el.type === 'file' && (parseFloat(cs.opacity) === 0 || cs.clip !== 'auto' || el.getBoundingClientRect().width <= 1)) continue; // visually hidden; its label is the target
    const r = el.getBoundingClientRect();
    if (r.width >= 24 && r.height >= 24) continue;
    if (el.tagName === 'A' && cs.display.startsWith('inline')) {
      const block = el.closest('p,li,td,dd,figcaption,small,label,h1,h2,h3,h4,.muted');
      if (block && block.textContent.trim().length > el.textContent.trim().length + 3) continue; // link inside a sentence
    }
    out.small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  // A sufficiently large title still fails as a touch target if project buttons cover it.
  const title = document.querySelector('.show-name');
  const actions = document.querySelector('.studio-project-actions');
  if (title && actions && visible(title) && visible(actions)) {
    const a = title.getBoundingClientRect(), b = actions.getBoundingClientRect();
    if (Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) {
      out.small.push('show title is covered by project actions');
    }
  }
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.noAlt.push(img.getAttribute('src'));
  return out;
}

async function check(ctx, base, page, width, label = page) {
  const tab = await ctx.newPage();
  tab.on('dialog', (d) => d.dismiss().catch(() => {}));
  await tab.goto(base + page, { waitUntil: 'load' }).catch((e) => problems.push(`${width}px ${label}: ${e.message}`));
  if (page === 'studio.html') await tab.waitForFunction(() => document.querySelector('h1'), null, { timeout: 10000 }).catch(() => {});
  await tab.waitForTimeout(350);
  const r = await tab.evaluate(audit);
  const where = `${width}px ${label}`;
  if (r.overflow) problems.push(`${where}: scrolls sideways (${r.overflow})`);
  if (r.h1 !== 1) problems.push(`${where}: ${r.h1} visible h1 elements`);
  r.jumps.forEach((j) => problems.push(`${where}: heading skips a level: ${j}`));
  r.small.slice(0, 5).forEach((s) => problems.push(`${where}: target under 24 px: ${s}`));
  r.noAlt.forEach((s) => problems.push(`${where}: image without alt: ${s}`));

  // Keyboard: the first Tab reaches the skip link, which appears and moves focus to <main>.
  await tab.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await tab.keyboard.press('Tab');
  const skip = await tab.evaluate(() => {
    const el = document.activeElement;
    if (!el?.classList.contains('skip-link')) return { ok: false, got: el ? `${el.tagName} ${el.textContent.trim().slice(0, 30)}` : 'nothing' };
    const r = el.getBoundingClientRect();
    return { ok: true, visible: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 40 };
  });
  if (!skip.ok) problems.push(`${where}: first Tab focuses ${skip.got}, not the skip link`);
  else {
    if (!skip.visible) problems.push(`${where}: skip link is not visible when focused`);
    await tab.keyboard.press('Enter');
    await tab.waitForTimeout(100);
    // Phone Studio is its own app view (#studio-mobile-app); everywhere else it is <main>.
    const landed = await tab.evaluate(() => { const a = document.activeElement; return a?.tagName === 'MAIN' || a?.id === 'studio-mobile-app' ? 'ok' : `${a?.tagName} ${a?.id || ''}`; });
    if (landed !== 'ok') problems.push(`${where}: skip link moves focus to ${landed}, not the main content`);
  }
  await tab.close();
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 1024 });
    await ctx.route(/supabase\.co|192\.168\.4\.1|showduino\.local|cdn\.jsdelivr\.net|unpkg\.com|fonts\.g|challenges\.cloudflare\.com/, (r) => r.abort());
    for (const page of pages) await check(ctx, base, page, width);
    await ctx.close();
  }

  // Studio timeline with a show loaded: track Mute / Visible / Lock buttons.
  for (const width of [1440, 1024, 820]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 1024 });
    await ctx.route(/supabase\.co|192\.168\.4\.1|showduino\.local|cdn\.jsdelivr\.net|unpkg\.com|fonts\.g/, (r) => r.abort());
    const tab = await ctx.newPage();
    tab.on('dialog', (d) => d.accept().catch(() => {}));
    await tab.goto(base + 'studio.html', { waitUntil: 'load' });
    await tab.waitForFunction(() => window.ShowduinoProjects && window.ShowduinoPackage, null, { timeout: 15000 });
    await tab.evaluate(async () => {
      const project = SHDOModel.createProject('Target sizes');
      project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
      const a = SHDOModel.createTrack('mixed', 'Track A', 0); const b = SHDOModel.createTrack('pixel', 'Track B', 1);
      const c = SHDOModel.createClip(a.id, 'audio', 500, 2500, 'Cue'); c.routing.nodeId = 'audio-1'; c.params.file = 'a.wav';
      project.tracks.push(a, b); project.clips.push(c);
      await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(project))], 't.shdo'));
      document.querySelector('[data-panel="timeline-editor"]')?.click();
    });
    await tab.waitForFunction(() => document.querySelectorAll('.tl-track-btn').length >= 6, null, { timeout: 10000 }).catch(() => problems.push(`${width}px studio timeline: track buttons did not render`));
    const sizes = await tab.$$eval('.tl-track-btn', (els) => els.filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, label: e.getAttribute('aria-label'), pressed: e.getAttribute('aria-pressed') }; }));
    if (sizes.filter((s) => /^(Mute|Visible|Lock)$/.test(s.label)).length < 6) problems.push(`${width}px studio timeline: expected Mute, Visible and Lock on both tracks`);
    for (const s of sizes) {
      if (s.w < 24 || s.h < 24) problems.push(`${width}px studio timeline: ${s.label} button ${Math.round(s.w)}×${Math.round(s.h)}`);
      if (/^(Mute|Visible|Lock)$/.test(s.label) && !/^(true|false)$/.test(String(s.pressed))) problems.push(`${width}px studio timeline: ${s.label} has no pressed state`);
    }
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(`${pages.length} pages × ${WIDTHS.length} widths (${WIDTHS.join(', ')} px) plus Studio's timeline at 3 widths.`);
  if (problems.length) {
    console.error('FAIL\n' + problems.join('\n'));
    if (process.env.GITHUB_ACTIONS) problems.slice(0, 10).forEach((p) => console.log(`::error title=site-responsive-a11y::${p.replace(/\r?\n/g, ' ').slice(0, 900)}`));
    process.exit(1);
  }
  console.log('PASS: no sideways scrolling, one h1 and no skipped heading levels, working skip links, 24 px targets, alt text on every image.');
})().catch((e) => { console.error(problems.join('\n')); console.error(e); server.close(); process.exit(1); });
