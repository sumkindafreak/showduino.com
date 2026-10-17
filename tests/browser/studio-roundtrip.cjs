/* W001 browser test: Studio import → export → reload → restore → re-import, plus
 * rejection of malformed, non-Showduino and oversized files. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/studio.html`;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  page.on('dialog', (d) => d.accept());
  const ready = () => page.waitForFunction(() => window.ShowduinoProjects && window.SHDOModel && window.ShowduinoPackage, null, { timeout: 15000 });
  await page.goto(url, { waitUntil: 'load' }); await ready();
  const file = await page.evaluate(() => {
    const project = SHDOModel.createProject('W001 Round Trip');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const t = SHDOModel.createTrack('pixel', 'Pixels', 0); const c = SHDOModel.createClip(t.id, 'pixel', 1000, 2000, 'Flash');
    c.routing.nodeId = 'p4-local'; c.params.startPixel = 0; c.params.length = 10; c.params.effect = 'LIGHTNING';
    project.tracks.push(t); project.clips.push(c); return JSON.stringify(ShowduinoPackage.toShdo(project));
  });
  const imp = (text, name) => page.evaluate(async ([t, n]) => { try { await ShowduinoProjects.importProject(new File([t], n)); return 'ok'; } catch (e) { return e.message; } }, [text, name]);
  assert.strictEqual(await imp(file, 'good.shdo'), 'ok');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => ShowduinoProjects.exportCurrentProject())]);
  const exported = fs.readFileSync(await dl.path(), 'utf8');
  assert.strictEqual(dl.suggestedFilename(), 'W001_Round_Trip.shdo');
  assert.strictEqual(JSON.parse(exported).schema, 'showduino-production-v2');
  assert.ok(await page.evaluate((t) => ShowduinoPackage.validateShdo(JSON.parse(t)).valid, exported), 'export validates');
  await page.reload({ waitUntil: 'load' }); await ready();
  const restored = await page.evaluate(async () => (await ShowduinoProjects.restoreLastLocalProject())?.project?.name);
  assert.strictEqual(restored, 'W001 Round Trip', 'last local project restored after reload');
  assert.strictEqual(await imp(exported, 're.shdo'), 'ok', 're-import of exported file');
  assert.match(await imp('{not json', 'bad.shdo'), /import failed/i);
  assert.match(await imp(JSON.stringify({ schema: 'x', project: { name: 'evil' } }), 'x.shdo'), /not a Showduino production/);
  assert.match(await imp('x'.repeat(6 * 1048576), 'big.shdo'), /larger than 5 MB/);
  console.log('PASS: Studio import/export/reload/restore round trip; malformed, foreign and oversized files refused.');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e.message); server.close(); process.exit(1); });
