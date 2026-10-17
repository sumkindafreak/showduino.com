/* W002 browser test: audio file names reported by a Showduino device (SD card
 * listing) and device error messages are shown as text, never run as script.
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
  // The legacy audio library is dormant in this build: its loader lives in an
  // inline <script> inside the panel template, which innerHTML never runs. Run
  // that template's own script so the path is exercised exactly as written.
  const activated = await page.evaluate(() => {
    const pm = window.panelManager || (window.PanelManager && new window.PanelManager());
    if (!pm?.audioManager) return 'panel manager not exposed';
    const holder = document.createElement('div');
    holder.innerHTML = pm.audioManager();
    document.body.append(holder);
    holder.querySelectorAll('script').forEach((s) => { try { (0, eval)(s.textContent); } catch (_) {} });
    return typeof window._loadAudioLibrary === 'function' ? 'ok' : 'loader not defined';
  });
  if (activated !== 'ok') { console.error('FAIL: could not activate the legacy audio library: ' + activated); process.exit(1); }
  const result = await page.evaluate(async (payload) => {
    let played = null;
    const host = document.getElementById('audio-library-list') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'audio-library-list' });
    window.api = window.api || {};
    window.api.listAudioFiles = async () => ({ files: ['scream' + payload + '.wav', { name: 'roar' + payload + '.wav' }] });
    window.api.playAudio = (n) => { played = n; };
    await window._loadAudioLibrary();
    const text = host.textContent;
    host.querySelector('button')?.click();
    window.api.listAudioFiles = async () => { throw new Error('device said ' + payload); };
    await window._loadAudioLibrary();
    return { rows: host.children.length, nameShownAsText: text.includes('<img src=x'), played, errorText: host.textContent };
  }, P);
  await page.waitForTimeout(300);
  const executed = await page.evaluate(() => window.__xss || 0);
  await browser.close(); server.close();
  const ok = executed === 0 && !page.__dialogs && result.nameShownAsText && result.played === 'scream' + P + '.wav' && result.errorText.includes('<img src=x');
  console.log(JSON.stringify({ executed, dialogs: page.__dialogs || 0, ...result, errorText: undefined }));
  if (!ok) { console.error('FAIL: device-supplied text was not rendered inertly'); process.exit(1); }
  console.log('PASS: device file names and error messages render as text; the play button passes the exact name.');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
