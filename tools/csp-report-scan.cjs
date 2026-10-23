/* W002/W005: open each public page of a DEPLOYED site in Chromium and record every
 * Content-Security-Policy violation the browser logs (enforced since W005, W5-06;
 * report-only messages are counted too). On Studio it also opens every panel and
 * presses non-destructive buttons, because handlers are only checked when they run.
 * Read-only: nothing is saved or sent.
 *   node tools/csp-report-scan.cjs https://<preview>.pages.dev */
const { chromium } = require('playwright');
const base = (process.argv[2] || 'https://show-duino.com').replace(/\/$/, '');
const pages = ['/', '/system', '/studio', '/hauntsync', '/community', '/creators', '/welcome', '/account', '/profile', '/tools', '/aboutme', '/docs', '/support', '/privacy', '/terms'];
const SAFE = /^(?!.*(sign|log ?out|delete|remove|clear|reset|erase|publish|share|deploy|send|upload|export|import)).*/i;
const say = (l, m) => console.log(process.env.GITHUB_ACTIONS ? `::${l}::${m}` : `[${l}] ${m}`);
(async () => {
  const browser = await chromium.launch(); const perPage = []; const kinds = new Map();
  for (const p of pages) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }); let n = 0;
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('console', (m) => {
      const t = m.text();
      if (!/Content Security Policy/i.test(t) || !/Refused to|violates/i.test(t)) return;
      n++;
      const what = (/Refused to (\w+(?: \w+)?) '?([^' ]*)/.exec(t) || []);
      const dir = (/directive: "([a-z-]+)/.exec(t) || [])[1] || 'unknown';
      const key = `${dir}: ${what[1] || ''} ${(what[2] || (/inline event handler/i.test(t) ? 'inline event handler' : /inline script/i.test(t) ? 'inline script' : '')).slice(0, 80)}`.trim();
      kinds.set(key, (kinds.get(key) || 0) + 1);
    });
    await page.goto(base + p, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (p === '/studio') {
      const panels = await page.$$eval('[data-panel]', (els) => [...new Set(els.map((e) => e.dataset.panel))]).catch(() => []);
      for (const panel of panels) {
        await page.evaluate((x) => document.querySelector(`[data-panel="${x}"]`)?.click(), panel);
        await page.waitForTimeout(250);
        for (const b of (await page.$$('main button:visible, [role=dialog] button:visible')).slice(0, 25)) {
          const label = ((await b.textContent().catch(() => '')) || '').trim();
          if (!SAFE.test(label)) continue;
          await b.click({ timeout: 400 }).catch(() => {});
          await page.waitForTimeout(50);
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
    }
    perPage.push(`${p}=${n}`);
    await page.close();
  }
  await browser.close();
  say('notice', `CSP violations per page: ${perPage.join(' ')}`);
  const list = [...kinds].sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < list.length; i += 6) say('notice', `CSP violations ${i + 1}-${Math.min(i + 6, list.length)} of ${list.length}: ` + list.slice(i, i + 6).map(([k, v]) => `${k} x${v}`).join(' | '));
  if (!list.length) say('notice', 'CSP violations: none');
})().catch((e) => { say('warning', 'CSP scan failed: ' + e.message); });
