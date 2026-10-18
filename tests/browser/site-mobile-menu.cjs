/* Browser test for the mobile menu button (js/site-nav.js, adapted from old PR #12)
 * on every page with the shared header: hidden on desktop; on a phone the menu
 * opens and closes by button, link, Escape (focus returns) and outside click,
 * links are at least 44 px tall, and no page scrolls sideways. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && fs.readFileSync(path.join(ROOT, f), 'utf8').includes('class="site-nav"'));
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  for (const pg of pages) {
    const p = await phone.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(base + pg, { waitUntil: 'load' });
    await p.waitForSelector('.site-nav-toggle', { timeout: 5000 });
    const closed = await p.evaluate(() => ({ nav: getComputedStyle(document.querySelector('.site-nav')).display, expanded: document.querySelector('.site-nav-toggle').getAttribute('aria-expanded') }));
    assert.strictEqual(closed.nav, 'none', pg + ': menu starts closed on a phone'); assert.strictEqual(closed.expanded, 'false');
    await p.click('.site-nav-toggle');
    const open = await p.evaluate(() => { const links = [...document.querySelectorAll('.site-nav a')]; return { expanded: document.querySelector('.site-nav-toggle').getAttribute('aria-expanded'),
      visible: links.filter((a) => a.getBoundingClientRect().height > 0).length, total: links.length, minH: Math.min(...links.map((a) => a.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth - window.innerWidth }; });
    assert.strictEqual(open.expanded, 'true'); assert.strictEqual(open.visible, open.total, pg + ': all links visible when open');
    assert.ok(open.minH >= 44, pg + ': links at least 44 px tall (got ' + open.minH + ')');
    assert.ok(open.overflow <= 1, pg + ': no sideways scroll with menu open (' + open.overflow + ' px)');
    await p.keyboard.press('Escape');
    const esc = await p.evaluate(() => ({ expanded: document.querySelector('.site-nav-toggle').getAttribute('aria-expanded'), focus: document.activeElement === document.querySelector('.site-nav-toggle') }));
    assert.strictEqual(esc.expanded, 'false', pg + ': Escape closes'); assert.ok(esc.focus, pg + ': focus returns to the button');
    await p.click('.site-nav-toggle'); await p.mouse.click(200, 800);
    assert.strictEqual(await p.getAttribute('.site-nav-toggle', 'aria-expanded'), 'false', pg + ': outside click closes');
    const closedOverflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(closedOverflow <= 1, pg + ': no sideways scroll (' + closedOverflow + ' px)');
    assert.deepStrictEqual(errors, [], pg + ': page errors ' + errors.join(' | '));
    await p.close();
    const d = await desk.newPage(); await d.goto(base + pg, { waitUntil: 'load' });
    const dv = await d.evaluate(() => ({ toggle: getComputedStyle(document.querySelector('.site-nav-toggle')).display, nav: getComputedStyle(document.querySelector('.site-nav')).display }));
    assert.strictEqual(dv.toggle, 'none', pg + ': no menu button on desktop'); assert.notStrictEqual(dv.nav, 'none', pg + ': desktop nav visible');
    await d.close();
  }
  // Link click closes the menu (navigates) — checked once.
  const p = await phone.newPage(); await p.goto(base + 'index.html', { waitUntil: 'load' }); await p.click('.site-nav-toggle');
  await Promise.all([p.waitForNavigation(), p.click('.site-nav a[href="docs.html"]')]);
  assert.match(p.url(), /docs\.html$/);
  await browser.close(); server.close();
  console.log(`PASS: mobile menu on ${pages.length} pages (closed by default, opens, 44 px links, Escape/outside close, no sideways scroll, desktop unchanged).`);
})().catch((e) => { console.error('FAIL', e.message); server.close(); process.exit(1); });
