/* W002: open each public page of a DEPLOYED site in Chromium and count the
 * Content-Security-Policy-Report-Only violations the browser logs. Read-only.
 *   node tools/csp-report-scan.cjs https://<preview>.pages.dev */
const { chromium } = require('playwright');
const base = (process.argv[2] || 'https://show-duino.com').replace(/\/$/, '');
const pages = ['/', '/system', '/studio', '/hauntsync', '/community', '/creators', '/welcome', '/account', '/profile', '/tools', '/aboutme', '/docs', '/support', '/privacy', '/terms'];
const say = (l, m) => console.log(process.env.GITHUB_ACTIONS ? `::${l}::${m}` : `[${l}] ${m}`);
(async () => {
  const browser = await chromium.launch(); const summary = []; const kinds = new Map();
  for (const p of pages) {
    const page = await browser.newPage(); let n = 0; let errors = 0;
    page.on('console', (m) => {
      const t = m.text();
      if (/Report Only|report-only/i.test(t)) { n++; const d = (/violates the following Content Security Policy directive: "([^"]+)"/.exec(t) || [])[1] || 'other'; kinds.set(d, (kinds.get(d) || 0) + 1); }
    });
    page.on('pageerror', () => { errors++; });
    await page.goto(base + p, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);
    summary.push(`${p}=${n}${errors ? '(pageerrors ' + errors + ')' : ''}`);
    await page.close();
  }
  await browser.close();
  say('notice', `CSP report-only violations per page: ${summary.join(' ')}`);
  say('notice', `CSP report-only violations by directive: ${[...kinds].map(([k, v]) => `${k} x${v}`).join('; ') || 'none'}`);
})().catch((e) => { say('warning', 'CSP scan failed: ' + e.message); });
