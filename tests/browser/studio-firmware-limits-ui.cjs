/* W005 browser test (W5-03, W5-09, W5-15, W5-22) in real Chromium:
 *  - Diagnostics shows the P4 limits: a 17-pixel-cue show is an error, a 16-cue show is not.
 *  - Export .shdo of a 60-audio-cue show is written compact so it fits the P4's 48 KB
 *    Persist to SD limit; a small show stays spaced and readable.
 *  - Export of a show the P4 would refuse says so in the Studio Log.
 *  - Phone (375 px): pixel cue rows keep the time and the name as separate elements. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

async function open(browser, base, viewport, touch) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: !!touch, isMobile: !!touch });
  await context.route(/cdn\.jsdelivr\.net|unpkg\.com|supabase\.co|192\.168\.4\.1|showduino\.local/, (r) => r.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(base + 'studio.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects && window.SHDOModel && window.ShowduinoPackage && window.ShowduinoFirmwareLimits, null, { timeout: 15000 });
  return { context, page, errors };
}

const build = (page, spec) => page.evaluate(async (spec) => {
  const p = SHDOModel.createProject(spec.name);
  p.assets = {}; p.scenes = []; p.globalSettings = {}; p.metadata = {};
  const px = SHDOModel.createTrack('pixel', 'P4 pixels', 0); const au = SHDOModel.createTrack('audio', 'Audio', 1);
  p.tracks.push(px, au);
  for (let i = 0; i < spec.pixel; i++) { const c = SHDOModel.createClip(px.id, 'pixel', i * 1000, 800, spec.label || `Flash ${i}`); c.routing.nodeId = 'p4-local'; Object.assign(c.params, { startPixel: 0, length: 30, effect: 'LIGHTNING' }); p.clips.push(c); }
  for (let i = 0; i < spec.audio; i++) { const c = SHDOModel.createClip(au.id, 'audio', i * 1000 + 500, 900, `Sting ${i}`); c.routing.nodeId = 'audio-node'; Object.assign(c.params, { file: `sting${i % 9}.wav`, volume: 80 }); p.clips.push(c); }
  await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(p))], 'seed.shdo'));
}, spec);

const exportFile = async (page) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => ShowduinoProjects.exportCurrentProject())]);
  return fs.readFileSync(await dl.path(), 'utf8');
};
const logText = (page) => page.evaluate(() => document.getElementById('studio-log-output')?.textContent || '');
const diagnostics = (page) => page.evaluate(async () => {
  document.querySelector('[data-panel="diagnostics"]')?.click();
  await new Promise((r) => setTimeout(r, 400));
  window.ShowduinoStudioV4?.refreshDiagnostics?.();
  return [...document.querySelectorAll('#v4-project-checks .project-check-item')].map((el) => ({ level: [...el.classList].find((c) => ['ok', 'warn', 'error'].includes(c)), text: el.textContent.replace(/\s+/g, ' ').trim() }));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    const { context, page, errors } = await open(browser, base, { width: 1366, height: 900 });

    await build(page, { name: 'Sixteen pixel cues', pixel: 16, audio: 0 });
    let checks = await diagnostics(page);
    const slots16 = checks.find((c) => c.text.includes('Pixel segment slots'));
    assert.ok(slots16, 'Diagnostics lists the pixel segment slot check');
    assert.strictEqual(slots16.level, 'ok', '16 pixel cues fit');

    await build(page, { name: 'Seventeen pixel cues', pixel: 17, audio: 0 });
    checks = await diagnostics(page);
    const slots17 = checks.find((c) => c.text.includes('Pixel segment slots'));
    assert.strictEqual(slots17.level, 'error', '17 pixel cues on one device are an error');
    assert.match(slots17.text, /16 segment slots/);
    await exportFile(page);
    assert.match(await logText(page), /The P4 will refuse this file/, 'export warns about what the P4 refuses');

    await build(page, { name: 'Small show', pixel: 2, audio: 2 });
    const small = await exportFile(page);
    assert.ok(small.includes('\n  "schema"'), 'small show export stays spaced and readable');

    await build(page, { name: 'Sixty audio cues', pixel: 0, audio: 60 });
    const big = await exportFile(page);
    assert.ok(Buffer.byteLength(big) <= 48 * 1024, `60-cue export fits 48 KB (${Buffer.byteLength(big)} bytes)`);
    assert.ok(!big.includes('\n'), 'large show exported compact');
    assert.strictEqual(JSON.parse(big).clips.length, 60, 'compact export keeps every cue');
    assert.match(await logText(page), /Exported without spacing/);
    checks = await diagnostics(page);
    assert.strictEqual(checks.find((c) => c.text.includes('P4 file size')).level, 'ok');

    await build(page, { name: 'Long label', pixel: 1, audio: 0, label: 'L'.repeat(70) });
    checks = await diagnostics(page);
    assert.strictEqual(checks.find((c) => c.text.includes('P4 compatibility')).level, 'error', 'a 70-character cue name is flagged');
    assert.deepStrictEqual(errors, [], 'no page errors on desktop');
    await context.close();

    // Phone: pixel rows keep separate time and name elements.
    const phone = await open(browser, base, { width: 375, height: 812 }, true);
    await build(phone.page, { name: 'Phone rows', pixel: 2, audio: 1 });
    await phone.page.waitForTimeout(800);
    const rows = await phone.page.evaluate(() => [...document.querySelectorAll('#studio-mobile-app .sm-cue-row')].map((row) => ({
      time: row.querySelector('.sm-cue-time')?.textContent || null,
      name: row.querySelector('.sm-cue-name')?.textContent || null,
      detail: row.querySelector('.sm-cue-detail')?.textContent || ''
    })));
    const pixelRows = rows.filter((r) => /Flash/.test(r.name || ''));
    assert.ok(pixelRows.length === 2, `two pixel rows rendered (${JSON.stringify(rows)})`);
    pixelRows.forEach((r) => {
      assert.match(r.time || '', /^\d{2}:\d{2}\.\d{3}$/, 'pixel row keeps its time element');
      assert.match(r.name, /^Flash \d$/, 'pixel row keeps its name element');
      assert.strictEqual((r.detail.match(/PX/g) || []).length, 1, `pixel summary added once (${r.detail})`);
    });
    assert.deepStrictEqual(phone.errors, [], 'no page errors on phone');
    await phone.context.close();
    console.log('PASS: P4 limits in Diagnostics and Export (16/17 pixel cues, 48 KB compact export, long names); phone pixel rows keep time and name.');
  } finally {
    await browser.close(); server.close();
  }
})().catch((e) => { console.error('FAIL', e.message); server.close(); process.exit(1); });
