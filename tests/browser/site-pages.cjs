/* W002 browser test: every public page loads, has no uncaught script errors, and its
 * pinned third-party scripts load with matching SRI (when the CDN is reachable). */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
(async () => {
  let cdnReachable = true;
  try { await fetch('https://cdn.jsdelivr.net/npm/animejs@4.5.0/package.json', { signal: AbortSignal.timeout(5000) }); } catch (_) { cdnReachable = false; }
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const problems = [];
  for (const width of [1366, 390]) for (const page of pages) {
    const tab = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    tab.on('console', (m) => { if (m.type() === 'error' && /integrity|Subresource/i.test(m.text())) errors.push('SRI: ' + m.text().slice(0, 160)); });
    await tab.goto(base + page, { waitUntil: 'load' }).catch((e) => errors.push('nav: ' + e.message));
    await tab.waitForTimeout(300);
    const libs = await tab.evaluate(() => ({ needsSupabase: !!document.querySelector('script[src*="supabase-js"]'), supabase: typeof window.supabase?.createClient, needsAnime: !!document.querySelector('script[src*="animejs"]'), anime: typeof window.anime }));
    if (cdnReachable) {
      if (libs.needsSupabase && libs.supabase !== 'function') errors.push('supabase-js did not load');
      if (libs.needsAnime && libs.anime === 'undefined') errors.push('anime.js did not load');
    } else {
      // Offline sandbox: CDN scripts cannot load, so ignore errors that only follow from that.
      for (let i = errors.length - 1; i >= 0; i--) if (/supabase|anime|AOS|firebase/i.test(errors[i])) errors.splice(i, 1);
    }
    if (errors.length) problems.push(`${width}px ${page}: ${errors.join(' | ')}`);
    await tab.close();
  }
  await browser.close(); server.close();
  console.log(`${pages.length} pages × 2 widths; CDN ${cdnReachable ? 'reachable: SRI and library loading checked' : 'unreachable: SRI not checked (offline)'}`);
  if (problems.length) {
    console.error('FAIL\n' + problems.join('\n'));
    // Job logs are not always reachable; put the reasons on the check run as annotations.
    if (process.env.GITHUB_ACTIONS) problems.slice(0, 10).forEach((p) => console.log(`::error title=site-pages::${p.replace(/\r?\n/g, ' ').slice(0, 900)}`));
    process.exit(1);
  }
  console.log('PASS: all pages load without script errors' + (cdnReachable ? ' and all pinned third-party scripts pass SRI.' : '.'));
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
