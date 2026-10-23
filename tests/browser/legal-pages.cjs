/* W005 (W5-04) browser test: the privacy notice, terms and guidelines read well on phone,
 * tablet and desktop: no sideways scrolling, the data table stacks on phones, founder
 * markers and the draft banner are visible, and in-page links resolve. */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  for (const [label, width] of [['phone', 390], ['tablet', 820], ['desktop', 1366]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    // Third-party scripts are irrelevant to layout; keep the test offline and deterministic.
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    for (const page of ['privacy.html', 'terms.html', 'guidelines.html']) {
      const tab = await ctx.newPage();
      await tab.goto(base + page, { waitUntil: 'load' });
      const r = await tab.evaluate(() => {
        const doc = document.documentElement;
        const table = document.querySelector('.legal-table');
        const row = table?.querySelector('tbody tr');
        const firstCell = row?.querySelector('td');
        const markers = [...document.querySelectorAll('[data-legal-todo]')];
        const anchors = [...document.querySelectorAll('a[href^="#"], a[href*=".html#"]')].map((a) => a.getAttribute('href'));
        const banner = document.querySelector('.legal-status');
        return {
          overflow: doc.scrollWidth - doc.clientWidth,
          h1: document.querySelectorAll('h1').length,
          tableDisplay: table ? getComputedStyle(row).display : null,
          cellLabel: firstCell ? getComputedStyle(firstCell, '::before').content : null,
          markers: markers.length,
          hiddenMarkers: markers.filter((m) => !m.offsetWidth || getComputedStyle(m).visibility === 'hidden').length,
          banner: banner ? banner.getBoundingClientRect().height > 0 : null,
          anchors
        };
      });
      if (r.overflow > 1) fail(`${label} ${page}: page scrolls sideways by ${r.overflow}px`);
      if (r.h1 !== 1) fail(`${label} ${page}: expected one h1, found ${r.h1}`);
      if (r.markers && r.hiddenMarkers) fail(`${label} ${page}: ${r.hiddenMarkers} founder marker(s) not visible`);
      if (r.markers && r.banner !== true) fail(`${label} ${page}: draft banner missing while founder items are open`);
      if (r.tableDisplay !== null) {
        if (width < 761 && r.tableDisplay !== 'block') fail(`${label} ${page}: data table should stack on narrow screens`);
        if (width < 761 && !/Information/.test(r.cellLabel || '')) fail(`${label} ${page}: stacked cells need their column label`);
        if (width >= 761 && r.tableDisplay !== 'table-row') fail(`${label} ${page}: data table should be a table on wide screens`);
      }
      for (const href of r.anchors) {
        const [file, id] = href.startsWith('#') ? [page, href.slice(1)] : href.split('#');
        const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
        if (!new RegExp(`id="${id}"`).test(html)) fail(`${page}: link ${href} has no target`);
      }
      await tab.close();
    }
    await ctx.close();
  }
  await browser.close(); server.close();
  if (!process.exitCode) console.log('PASS: legal pages lay out on phone, tablet and desktop; markers visible; in-page links resolve.');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
