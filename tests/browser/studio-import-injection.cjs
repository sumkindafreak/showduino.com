/* W001 browser test: import a hostile .shdo into the real Studio and visit every
 * panel on desktop and phone widths. Fails if any injected markup executes.
 * Run: npx playwright@1.48.2 install chromium && node tests/browser/studio-import-injection.cjs */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.avif': 'image/avif' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const PANELS = ['introduction', 'timeline-editor', 'playback', 'audio-manager', 'hauntsync', 'connect', 'devices', 'diagnostics', 'settings', 'help'];
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  let failures = 0;
  for (const width of [1366, 390]) {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    page.on('dialog', (d) => d.dismiss());
    await page.goto(base + 'studio.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.ShowduinoProjects && window.SHDOModel && window.ShowduinoPackage, null, { timeout: 15000 });
    const imported = await page.evaluate(async () => {
      const P = '"><img src=x onerror="window.__xss=(window.__xss||0)+1">\'<svg onload=window.__xss=(window.__xss||0)+1>';
      const project = SHDOModel.createProject('Show' + P);
      project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
      const t1 = SHDOModel.createTrack('pixel', 'Track' + P, 0); const t2 = SHDOModel.createTrack('audio', 'Audio' + P, 1);
      const c1 = SHDOModel.createClip(t1.id, 'pixel', 1000, 2500, 'Clip' + P); c1.routing.nodeId = 'p4-local'; c1.params.startPixel = 0; c1.params.length = 10; c1.params.effect = 'LIGHTNING';
      const c2 = SHDOModel.createClip(t2.id, 'audio', 2000, 3000, 'Roar' + P); c2.routing.nodeId = 'audio-1'; c2.params.file = 'a' + P + '.wav';
      project.tracks.push(t1, t2); project.clips.push(c1, c2);
      const shdo = ShowduinoPackage.toShdo(project);
      (shdo.devices || []).forEach((d) => { d.name = (d.name || 'Device') + P; });
      await window.ShowduinoProjects.importProject(new File([JSON.stringify(shdo)], 'hostile.shdo'));
      return true;
    });
    for (const panel of PANELS) {
      await page.evaluate((p) => document.querySelector(`[data-panel="${p}"]`)?.click(), panel);
      await page.waitForTimeout(400);
      for (const h of (await page.$$('[data-clip-id],[class*="clip"]')).slice(0, 8)) {
        try { await h.click({ timeout: 500, force: true }); await h.dblclick({ timeout: 500, force: true }); } catch (_) {}
      }
    }
    await page.waitForTimeout(500);
    const executed = await page.evaluate(() => window.__xss || 0);
    console.log(`${width}px: imported=${imported} panels=${PANELS.length} injected-script-executions=${executed}`);
    if (executed) failures++;
  }
  await browser.close(); server.close();
  if (failures) { console.error('FAIL: imported .shdo text executed as script'); process.exit(1); }
  console.log('PASS: hostile .shdo import executed no script on desktop or phone.');
})().catch((e) => { console.error(e); process.exit(1); });
