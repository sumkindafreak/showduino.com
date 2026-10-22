/* W005 (W5-09) browser test: Studio warns, before export, about productions the P4 Show
 * Engine will refuse, and exports compact files. Optional firmware contract: when
 * SHDO_CHECK_BIN points at a host build of new_showduino's SHDO compiler
 * (tools/shdo-contract/shdo_check.cpp), the exported file is compiled by it. */
const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path'); const assert = require('assert');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'w005-p4-'));

async function studio(browser, base) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route(/cdn\.jsdelivr\.net|unpkg\.com|supabase\.co|192\.168\.4\.1|showduino\.local/, (r) => r.abort());
  const page = await context.newPage(); page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message)); page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(base + 'studio.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects && window.ShowduinoP4Limits && window.ShowduinoStudioV4, null, { timeout: 15000 });
  return { context, page };
}
async function importFixture(page, name) {
  await page.setInputFiles('#studio-import-file', path.join(ROOT, 'tests/fixtures/shdo', name));
  await page.waitForFunction(() => (window.state?.project?.clips?.length || 0) > 0, null, { timeout: 5000 });
}
async function exportFile(page, name) {
  await page.evaluate(() => { const m = document.getElementById('studio-header-menu'); if (m) m.hidden = false; });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#studio-export-button', { force: true })]);
  const dest = path.join(OUT, name); await dl.saveAs(dest); return dest;
}
const log = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#studio-log-output > *')).map((n) => n.textContent).join('\n'));
async function checks(page) {
  await page.evaluate(() => window.ShowduinoStudioV4.openPanel('diagnostics'));
  await page.waitForSelector('#v4-project-checks .project-check-item', { timeout: 5000 });
  return page.evaluate(() => Array.from(document.querySelectorAll('#v4-project-checks .project-check-item')).map((n) => ({ level: n.className, text: n.textContent })));
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  // 1. A show within the limits: check passes; the export is compact JSON.
  {
    const { context, page } = await studio(browser, base);
    await importFixture(page, 'website-studio-export.shdo');
    const p4 = (await checks(page)).find((c) => /P4 production limits/.test(c.text));
    assert.ok(p4 && /\bok\b/.test(p4.level), 'P4 limits check passes: ' + JSON.stringify(p4));
    const file = await exportFile(page, 'within-limits.shdo');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.includes('\n'), 'export is compact JSON');
    assert.strictEqual(JSON.parse(text).schema, 'showduino-production-v2');
    assert.ok(!/P4 will refuse/.test(await log(page)), 'no refusal warning');
    if (process.env.SHDO_CHECK_BIN) {
      const out = execFileSync(process.env.SHDO_CHECK_BIN, [file], { encoding: 'utf8' });
      assert.match(out, /status=OK cues=28/, 'firmware SHDO compiler accepts the Studio export: ' + out.split('\n')[0]);
      for (const cmd of ['PIXEL:SEGMENT:0:FX:LIGHTNING', 'PIXEL:NODE:LED-01:SEGMENT:0:FX:FIRE', 'AUDIO:NODE:PLAY:thunder.wav', 'AUDIO:NODE:PLAY:scream.wav']) {
        assert.ok(out.includes(cmd), 'compiled cue ' + cmd);
      }
      console.log('PASS  firmware contract: new_showduino SHDO compiler accepts a fresh Studio export (28 cues)');
    }
    assert.deepStrictEqual(page.errors, []); await context.close();
    console.log('PASS  within limits: check OK, compact export, no warning');
  }

  // 2. 17 pixel cues on one device: Project check shows an error; export still works (backup) but warns.
  {
    const { context, page } = await studio(browser, base);
    await importFixture(page, 'website-17-pixel-clips.shdo');
    const p4 = (await checks(page)).find((c) => /P4 production limits/.test(c.text));
    assert.ok(p4 && /\berror\b/.test(p4.level), 'P4 limits check is an error: ' + JSON.stringify(p4));
    assert.match(p4.text, /at most 16 per pixel device/);
    await exportFile(page, 'too-many-pixels.shdo');
    assert.match(await log(page), /Saved as a backup, but the P4 will refuse this production/);
    if (process.env.SHDO_CHECK_BIN) {
      let out = '';
      try { out = execFileSync(process.env.SHDO_CHECK_BIN, [path.join(OUT, 'too-many-pixels.shdo')], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || ''); }
      assert.match(out, /TOO_MANY_CUES/, 'firmware agrees: ' + out.split('\n')[0]);
      console.log('PASS  firmware contract: the compiler refuses what Studio flags (TOO_MANY_CUES)');
    }
    assert.deepStrictEqual(page.errors, []); await context.close();
    console.log('PASS  over the pixel limit: Project check error, export warns');
  }

  // 3. A cue name longer than the firmware buffer is flagged.
  {
    const { context, page } = await studio(browser, base);
    await importFixture(page, 'website-studio-export.shdo');
    await page.evaluate(() => { window.state.project.clips[0].label = 'A very long cue name that the P4 Show Engine cannot store in its buffer'; });
    const p4 = (await checks(page)).find((c) => /P4 production limits/.test(c.text));
    assert.ok(p4 && /\berror\b/.test(p4.level) && /bytes; the P4 accepts at most 63/.test(p4.text), 'long cue name flagged: ' + JSON.stringify(p4));
    await context.close();
    console.log('PASS  long cue name flagged before export');
  }
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=studio-p4-limits::${String(e.message).replace(/\r?\n/g, ' ').slice(0, 900)}`); server.close(); process.exit(1); });
