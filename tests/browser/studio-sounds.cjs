/* Browser test for the Sounds panel (local sound library, adapted from old PRs #14/#11).
 * Imports real files through the file picker, checks Audio Node compatibility badges,
 * persistence across reload (IndexedDB), "Use in selected cue", removal, hostile file
 * names staying inert, and phone layout. No network or hardware is used. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
function wav({ rate = 44100, channels = 2, bits = 16, seconds = 0.25 } = {}) {
  const dataBytes = Math.round(rate * seconds) * channels * bits / 8;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * bits / 8, 28);
  b.writeUInt16LE(channels * bits / 8, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  return b;
}
const HOSTILE = '"><img src=x onerror="window.__xss=(window.__xss||0)+1">.wav';
const rows = (page) => page.$$eval('.sounds-section:first-of-type .sounds-row', (els) => els.map((r) => ({
  name: r.querySelector('.sounds-name')?.textContent, badge: r.querySelector('.sounds-badge')?.textContent,
  useDisabled: [...r.querySelectorAll('button')].find((b) => /Use in selected cue/.test(b.textContent))?.disabled })));
async function openSounds(page) {
  await page.waitForFunction(() => window.ShowduinoSounds && window.ShowduinoProjects, null, { timeout: 15000 });
  await page.evaluate(() => document.querySelector('[data-panel="audio-manager"]')?.click());
  await page.waitForSelector('#sounds-file-input', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => window.ShowduinoSounds.library.init());
  await page.waitForTimeout(300);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/studio.html`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await openSounds(page);

  // 1. Import through the real file picker.
  await page.setInputFiles('#sounds-file-input', [
    { name: 'good.wav', mimeType: 'audio/wav', buffer: wav() },
    { name: 'hires.wav', mimeType: 'audio/wav', buffer: wav({ bits: 24 }) },
    { name: 'roar.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00fake') },
    { name: HOSTILE, mimeType: 'audio/wav', buffer: wav() },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not audio') }
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.sounds-section:first-of-type .sounds-row').length === 4, null, { timeout: 10000 });
  let r = await rows(page);
  const byName = Object.fromEntries(r.map((x) => [x.name, x]));
  assert.ok(/Audio Node ✓/.test(byName['good.wav'].badge), 'compatible WAV marked playable');
  assert.ok(/Won’t play/.test(byName['hires.wav'].badge), '24-bit WAV flagged');
  assert.ok(/Won’t play/.test(byName['roar.mp3'].badge), 'MP3 flagged');
  assert.ok(byName[HOSTILE], 'hostile name shown as plain text');
  assert.strictEqual(byName[HOSTILE].useDisabled, true, 'name that does not fit a cue cannot be used');
  assert.ok(/notes\.txt: not an audio file/.test(await page.textContent('.sounds-section:first-of-type .sounds-status')), 'non-audio file skipped with a reason');
  console.log('PASS  import: 4 sounds added, badges match the Audio Node rule, non-audio skipped');

  // 2. Persist across reload.
  await page.reload({ waitUntil: 'load' });
  await openSounds(page);
  await page.waitForFunction(() => document.querySelectorAll('.sounds-section:first-of-type .sounds-row').length === 4, null, { timeout: 10000 });
  console.log('PASS  library kept in this browser after reload');

  // 3. Use in the selected timeline audio cue.
  const clipId = await page.evaluate(async () => {
    const project = SHDOModel.createProject('Sounds test');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const t = SHDOModel.createTrack('audio', 'Audio', 0);
    const c = SHDOModel.createClip(t.id, 'audio', 0, 2000, 'Scream'); c.routing.nodeId = 'audio-1'; c.params.file = 'old.wav';
    project.tracks.push(t); project.clips.push(c);
    await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(project))], 's.shdo'));
    document.querySelector('[data-panel="timeline-editor"]')?.click();
    return null;
  });
  await page.waitForFunction(() => window.timelineEditor && window.timelineEditor._clips && window.timelineEditor._clips().some((c) => c.type === 'audio'), null, { timeout: 10000 });
  await page.evaluate(() => { const ed = window.timelineEditor; const c = ed._clips().find((x) => x.type === 'audio'); (ed._selectClip ? ed._selectClip(c.id) : (ed._selectedClipId = c.id)); });
  await openSounds(page);
  await page.evaluate(() => [...document.querySelectorAll('.sounds-section:first-of-type .sounds-row')].find((r) => r.querySelector('.sounds-name').textContent === 'good.wav').querySelector('button.btn-primary').click());
  const file = await page.evaluate(() => window.timelineEditor.getSelectedClip()?.params?.file);
  assert.strictEqual(file, 'good.wav', 'selected audio cue now plays good.wav');
  assert.match(await page.textContent('.sounds-section:first-of-type .sounds-status'), /now plays good\.wav/);
  console.log('PASS  "Use in selected cue" sets the audio cue file name');

  // 4. Remove one; stays removed after reload.
  await page.evaluate(() => [...document.querySelectorAll('.sounds-section:first-of-type .sounds-row')].find((r) => r.querySelector('.sounds-name').textContent === 'roar.mp3').querySelector('button.btn-secondary').click());
  await page.waitForFunction(() => document.querySelectorAll('.sounds-section:first-of-type .sounds-row').length === 3, null, { timeout: 10000 });
  await page.reload({ waitUntil: 'load' });
  await openSounds(page);
  await page.waitForFunction(() => document.querySelectorAll('.sounds-section:first-of-type .sounds-row').length === 3, null, { timeout: 10000 });
  console.log('PASS  remove deletes from this browser and stays removed after reload');

  // 5. Nothing executed; no page errors.
  assert.strictEqual(await page.evaluate(() => window.__xss || 0), 0, 'hostile file name executed script');
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join(' | '));
  console.log('PASS  hostile file name inert; no page errors');

  // 6. Phone layout.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await phone.goto(url, { waitUntil: 'load' });
  await openSounds(phone);
  const overflow = await phone.evaluate(() => { const root = document.getElementById('studio-sounds-root'); return root ? root.scrollWidth - root.clientWidth : -1; });
  assert.ok(overflow >= 0 && overflow <= 1, 'Sounds panel has no horizontal overflow on a phone');
  console.log('PASS  phone layout without horizontal overflow');

  await browser.close(); server.close();
  console.log('PASS: Sounds panel (6 checks).');
})().catch((e) => { console.error('FAIL', e.message); server.close(); process.exit(1); });
