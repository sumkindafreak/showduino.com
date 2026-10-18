/* W004 phase 2: Studio must tell locally imported sounds apart from files the Audio Node
 * actually reported, refuse names the Audio Node firmware refuses, keep the exact device file
 * name in exported .shdo files, and never claim a transfer that did not happen.
 * The Audio Node is simulated by stubbing window.api.listAudioFiles; no hardware is used. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function wav() {
  const rate = 44100, channels = 2, bits = 16, dataBytes = Math.round(rate * 0.2) * channels * bits / 8;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * bits / 8, 28);
  b.writeUInt16LE(channels * bits / 8, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  return b;
}
const HOSTILE = '<img src=x onerror="window.__xss=1">.wav';
const CUES = [
  ['Scream', 'scream.wav'],
  ['Bad name', 'Bad Name.wav'],
  ['Thunder', 'thunder.wav'],
  ['Roar', 'effects/Roar_01.WAV'],
  ['Hostile', HOSTILE]
];
const cueRows = (page) => page.$$eval('.sounds-cue-check .sounds-cue-row', (rows) => rows.map((r) => ({
  label: r.querySelector('.sounds-name')?.textContent, file: r.querySelector('.sounds-meta')?.textContent,
  state: r.dataset.state, chip: r.querySelector('.sounds-chip')?.textContent, text: r.querySelector('.sounds-reason')?.textContent })));
const byLabel = (rows) => Object.fromEntries(rows.map((r) => [r.label, r]));

async function openSounds(page) {
  await page.evaluate(() => document.querySelector('[data-panel="audio-manager"]')?.click());
  await page.waitForSelector('.sounds-cue-check', { timeout: 10000 });
  await page.evaluate(() => window.ShowduinoSounds.library.init());
  await wait(300);
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
  await page.waitForFunction(() => window.ShowduinoSounds && window.ShowduinoProjects && window.ShowduinoAudioCheck && window.ShowduinoDeploy, null, { timeout: 15000 });

  // A show with five audio cues.
  await page.evaluate(async (cues) => {
    const project = SHDOModel.createProject('Audio check');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const t = SHDOModel.createTrack('audio', 'Audio', 0);
    project.tracks.push(t);
    cues.forEach(([label, file], i) => { const c = SHDOModel.createClip(t.id, 'audio', i * 3000, 2000, label); c.routing.nodeId = 'audio-node'; c.params.file = file; project.clips.push(c); });
    await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(project))], 'a.shdo'));
    document.querySelector('[data-panel="timeline-editor"]')?.click();
  }, CUES);
  await page.waitForFunction(() => window.timelineEditor?._clips?.().filter((c) => c.type === 'audio').length === 5, null, { timeout: 10000 });

  // 1. Import scream.wav locally; nothing has been read from the device yet.
  await openSounds(page);
  await page.setInputFiles('#sounds-file-input', [{ name: 'scream.wav', mimeType: 'audio/wav', buffer: wav() }, { name: 'My Scream.wav', mimeType: 'audio/wav', buffer: wav() }]);
  await page.waitForFunction(() => document.querySelectorAll('.sounds-section:first-of-type .sounds-row').length === 2, null, { timeout: 10000 });
  await wait(200);
  let rows = byLabel(await cueRows(page));
  assert.strictEqual(rows.Scream.state, 'local-only', 'imported locally only');
  assert.ok(/Only on this computer/.test(rows.Scream.chip) && /\/showduino\/audio\/scream\.wav/.test(rows.Scream.text), 'tells where to copy it');
  assert.strictEqual(rows['Bad name'].state, 'invalid');
  assert.ok(/refuses a space/.test(rows['Bad name'].text), 'explains the firmware refusal');
  assert.strictEqual(rows.Thunder.state, 'unconfirmed');
  assert.strictEqual(rows.Roar.state, 'unconfirmed');
  assert.strictEqual(rows.Hostile.state, 'invalid');
  assert.strictEqual(rows.Hostile.file, HOSTILE, 'hostile name shown as text');
  const summary = await page.textContent('.sounds-cue-check .sounds-status');
  assert.ok(/has not read the Audio Node file list/.test(summary), 'summary says nothing is confirmed');
  assert.ok(!/On Audio Node/.test(JSON.stringify(rows)), 'no cue claims to be on the Audio Node');
  console.log('PASS  before any device list: local-only, unconfirmed and invalid cues reported; nothing claimed on the Audio Node');

  // The local row with a space cannot be used in a cue, and says why.
  const localSpace = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.sounds-section:first-of-type .sounds-row')].find((r) => r.querySelector('.sounds-name').textContent === 'My Scream.wav');
    return { disabled: [...row.querySelectorAll('button')].find((b) => /Use in selected cue/.test(b.textContent)).disabled, reason: row.textContent };
  });
  assert.ok(localSpace.disabled && /refuses a space/.test(localSpace.reason), 'local file with a space cannot be used, with the reason shown');
  console.log('PASS  a local file the Audio Node would refuse cannot be assigned, and the reason is shown');

  // 2. Inspector status under the file field.
  await page.evaluate(() => document.querySelector('[data-panel="timeline-editor"]')?.click());
  await page.waitForFunction(() => document.querySelector('.timeline-editor .tl-clip[data-clip-id]'), null, { timeout: 5000 });
  await wait(500);
  await page.evaluate(() => { const ed = window.timelineEditor; const c = ed._clips().find((x) => x.label === 'Bad name'); ed._selectClip(c.id); ed._showInspector(c.id); });
  await page.waitForSelector('#audio-file-status', { state: 'attached', timeout: 5000 });
  let inspector = await page.evaluate(() => ({ state: document.getElementById('audio-file-status').dataset.state, text: document.getElementById('audio-file-status').textContent, placeholder: document.getElementById('audio-file').placeholder }));
  assert.strictEqual(inspector.state, 'invalid');
  assert.ok(/Will not play/.test(inspector.text) && /space/.test(inspector.text));
  assert.ok(!/mp3/i.test(inspector.placeholder), 'placeholder no longer suggests MP3');
  await page.fill('#audio-file', 'bad_name.wav');
  inspector = await page.evaluate(() => ({ state: document.getElementById('audio-file-status').dataset.state, text: document.getElementById('audio-file-status').textContent }));
  assert.strictEqual(inspector.state, 'unconfirmed', 'status updates while typing');
  console.log('PASS  Inspector shows "Will not play" for a refused name and updates while typing');
  await page.fill('#audio-file', 'Bad Name.wav');
  await page.dispatchEvent('#audio-file', 'change');

  // 3. A real device listing confirms files (case-insensitive, FAT card).
  await openSounds(page);
  await page.evaluate(() => { window.api = window.api || {}; window.api.listAudioFiles = async () => ({ files: ['thunder.wav', 'effects/roar_01.wav', 'ambience/rain.wav'] }); });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'List Audio Node files').click());
  await page.waitForFunction(() => /3 files on the Audio Node/.test(document.body.textContent), null, { timeout: 5000 });
  rows = byLabel(await cueRows(page));
  assert.strictEqual(rows.Thunder.state, 'on-node');
  assert.ok(/Seen on the Audio Node SD card/.test(rows.Thunder.text));
  assert.strictEqual(rows.Roar.state, 'on-node', 'effects/Roar_01.WAV matches effects/roar_01.wav');
  assert.strictEqual(rows.Scream.state, 'local-only', 'imported but not in the device list');
  assert.ok(/did not include it/.test(rows.Scream.text));
  console.log('PASS  after a device list: Thunder and Roar confirmed (case-insensitive), Scream still only on this computer');

  // 4. Firmware without a list route (all current firmware): honest message, no new confirmation.
  await page.evaluate(() => { window.api.listAudioFiles = async () => { throw new Error('HTTP 404'); }; });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'List Audio Node files').click());
  await page.waitForFunction(() => /does not give Studio an audio file list yet/.test(document.body.textContent), null, { timeout: 5000 });
  await page.evaluate(() => { window.api.listAudioFiles = async () => ({ status: 'ok' }); });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'List Audio Node files').click());
  await page.waitForFunction(() => /Nothing on the SD card has been confirmed/.test(document.body.textContent), null, { timeout: 5000 });
  console.log('PASS  a 404 or a reply without a file list is reported plainly and confirms nothing');

  // 5. Forget the list: everything goes back to unconfirmed.
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Forget Audio Node list').click());
  await wait(150);
  rows = byLabel(await cueRows(page));
  assert.strictEqual(rows.Thunder.state, 'unconfirmed');
  console.log('PASS  "Forget Audio Node list" removes every confirmation');

  // 6. Export keeps the exact device file names; re-import keeps them too.
  const roundTrip = await page.evaluate(async () => {
    const project = window.timelineEditor._project();
    const shdo = ShowduinoPackage.toShdo(project);
    const files = (shdo.clips || []).map((c) => c.action?.params?.file ?? c.params?.file);
    await ShowduinoProjects.importProject(new File([JSON.stringify(shdo)], 'b.shdo'));
    const again = ShowduinoPackage.toShdo(window.timelineEditor._project());
    return { files, again: (again.clips || []).map((c) => c.action?.params?.file ?? c.params?.file) };
  });
  assert.deepStrictEqual(roundTrip.files.sort(), CUES.map((c) => c[1]).sort(), 'export keeps every file name exactly');
  assert.deepStrictEqual(roundTrip.again.sort(), roundTrip.files.sort(), 're-import keeps them');
  console.log('PASS  .shdo export and re-import keep the exact device file names (including case and sub-folder)');

  // 7. Deploy pre-flight refuses names the Audio Node refuses and warns about unconfirmed files.
  const plan = await page.evaluate(() => {
    const p = ShowduinoDeploy.compileShdoForStage(ShowduinoPackage.toShdo(window.timelineEditor._project()));
    return { ok: p.ok, errors: p.errors, warnings: p.warnings, commands: p.commands.map((c) => c.command) };
  });
  assert.strictEqual(plan.ok, false);
  assert.ok(plan.errors.some((e) => /Bad name: .*refuses a space/.test(e)), 'refused name is a deploy error');
  assert.ok(plan.warnings.some((w) => /scream\.wav is not confirmed on the Audio Node SD card/.test(w)), 'unconfirmed file is a warning');
  assert.ok(!plan.commands.some((c) => /Bad Name/.test(c)), 'no command for the refused name');
  console.log('PASS  deploy pre-flight: refused name is an error, unconfirmed file a warning');

  // 8. Opening Sounds before the timeline still lists the show's audio cues.
  const fresh = await context.newPage();
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto(url, { waitUntil: 'load' });
  await fresh.waitForFunction(() => window.ShowduinoProjects && window.ShowduinoAudioCheck, null, { timeout: 15000 });
  await fresh.evaluate(async () => {
    const project = SHDOModel.createProject('Sounds first');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const t = SHDOModel.createTrack('audio', 'Audio', 0); project.tracks.push(t);
    const c = SHDOModel.createClip(t.id, 'audio', 0, 2000, 'Only cue'); c.params.file = 'only.wav'; project.clips.push(c);
    await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(project))], 'f.shdo'));
  });
  await openSounds(fresh);
  const freshRows = await cueRows(fresh);
  assert.deepStrictEqual(freshRows.map((r) => r.label), ['Only cue'], 'cue list does not depend on the timeline being opened first');
  await fresh.close();
  console.log('PASS  opening Sounds before the timeline still lists the show\'s audio cues');

  // 9. Nothing executed from hostile names.
  assert.strictEqual(await page.evaluate(() => window.__xss || 0), 0, 'no script ran');
  assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log('PASS  hostile file name stayed inert; no page errors');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL ', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=studio-audio-confirmation::${String(e.message).replace(/\r?\n/g, ' ').slice(0, 900)}`); server.close(); process.exit(1); });
