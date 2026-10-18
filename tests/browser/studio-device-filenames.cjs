/* Browser test: audio file names reported by a Showduino device (SD card listing,
 * Sounds panel) and device error messages are shown as text, never run as script.
 * The device API is stubbed in the page; no network or hardware is used. */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const P = '"><img src=x onerror="window.__xss=(window.__xss||0)+1">\')+alert(1)+(\'';
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('dialog', (d) => { page.__dialogs = (page.__dialogs || 0) + 1; d.dismiss(); });
  await page.goto(`http://127.0.0.1:${server.address().port}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects, null, { timeout: 15000 });
  // Device file names are listed by the Sounds panel (js/studio-sounds.js) when Studio
  // runs from the local Showduino network (this test server is a local origin).
  await page.evaluate(() => document.querySelector('[data-panel="audio-manager"]')?.click());
  await page.waitForSelector('#studio-sounds-root .sounds-section:nth-of-type(2) button', { timeout: 10000 });
  const result = await page.evaluate(async (payload) => {
    let played = null;
    window.api = window.api || {};
    window.api.listAudioFiles = async () => ({ files: ['scream' + payload + '.wav', { name: 'roar' + payload + '.wav' }] });
    window.api.playAudio = (n) => { played = n; };
    const section = document.querySelector('#studio-sounds-root .sounds-section:nth-of-type(2)');
    const listButton = [...section.querySelectorAll('button')].find((b) => /List Audio Node files/.test(b.textContent));
    listButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const text = section.querySelector('.sounds-list').textContent;
    const rows = section.querySelectorAll('.sounds-row').length;
    [...section.querySelectorAll('.sounds-row button')].find((b) => /Play on Showduino/.test(b.textContent))?.click();
    window.api.listAudioFiles = async () => { throw new Error('device said ' + payload); };
    listButton.click();
    await new Promise((r) => setTimeout(r, 300));
    return { rows, nameShownAsText: text.includes('<img src=x'), played, errorText: section.querySelector('.sounds-status').textContent };
  }, P);
  await page.waitForTimeout(300);
  const executed = await page.evaluate(() => window.__xss || 0);
  await browser.close(); server.close();
  const ok = executed === 0 && !page.__dialogs && result.nameShownAsText && result.played === 'scream' + P + '.wav' && result.errorText.includes('<img src=x');
  console.log(JSON.stringify({ executed, dialogs: page.__dialogs || 0, ...result, errorText: undefined }));
  if (!ok) { console.error('FAIL: device-supplied text was not rendered inertly'); process.exit(1); }
  console.log('PASS: device file names and error messages render as text; the play button passes the exact name.');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
