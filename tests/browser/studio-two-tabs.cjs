/* Phase 3 browser test: two real tabs of one browser on the same show, and the timeline
 * editor's start-up.
 * Proves: a save in one tab is announced in the other; the stale tab's autosave and its
 * Save button do not overwrite; "keep both" makes a copy; a show deleted in another tab is
 * not saved back; opening the timeline never swaps the open show for the shared backup
 * copy; shortcuts and the editor timer are bound once however often the panel opens.
 * Same browser, same device only. Browser emulation, not a physical device. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

/**
 * Open Studio in a new tab of the context and wait for the project manager.
 * @param {import('playwright').BrowserContext} context Shared browser context (one localStorage).
 * @returns {Promise<import('playwright').Page>} The tab; tab.dialogs records confirm() texts.
 */
async function openStudio(context) {
  const page = await context.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  page.dialogs = []; page.answers = [];
  page.on('dialog', (d) => { page.dialogs.push(d.message()); (page.answers.length ? page.answers.shift() : false) ? d.accept() : d.dismiss(); });
  await page.goto(`http://127.0.0.1:${server.address().port}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects && window.state?.project?.project?.id, null, { timeout: 15000 });
  await page.evaluate(() => { window.__log = []; const original = window.studioLog; window.studioLog = function (message, level) { window.__log.push({ message: String(message), level }); return original && original.apply(this, arguments); }; });
  return page;
}
const addCue = (page, label) => page.evaluate((name) => {
  const p = window.state.project; let t = p.tracks[0];
  if (!t) { t = SHDOModel.createTrack('audio', 'Audio', 0); p.tracks.push(t); }
  const c = SHDOModel.createClip(t.id, 'audio', p.clips.length * 1000, 500, name); c.params.file = 'a.wav'; p.clips.push(c);
}, label);
const storedLabels = (page, id) => page.evaluate((k) => (JSON.parse(localStorage.getItem('showduino_project_' + k) || '{"clips":[]}').clips || []).map((c) => c.name || c.label), id);
const openId = (page) => page.evaluate(() => window.state.project.project.id);
const warnings = (page, pattern) => page.evaluate((src) => window.__log.filter((l) => new RegExp(src).test(l.message)).length, pattern);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, ...(process.env.SHOWDUINO_BROWSER_CHANNEL ? { channel: process.env.SHOWDUINO_BROWSER_CHANNEL } : {}) });

  // ---- Two tabs, same show
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.route(/^https:\/\//, (route) => route.abort());
    const one = await openStudio(context);
    const id = await openId(one);
    await addCue(one, 'From tab one'); await one.evaluate(() => ShowduinoProjects.saveCurrentProject({ cloud: false }));
    const two = await openStudio(context);
    assert.strictEqual(await openId(two), id, 'the second tab opens the same show');

    await addCue(one, 'Tab one again'); await one.evaluate(() => ShowduinoProjects.saveCurrentProject({ cloud: false }));
    await two.waitForFunction(() => window.__log.some((l) => /changed in another tab/.test(l.message)), null, { timeout: 5000 });
    await addCue(two, 'From tab two');
    await two.waitForTimeout(3500);   // two 1.5 s autosave ticks
    assert.deepStrictEqual(await storedLabels(one, id), ['From tab one', 'Tab one again'], 'the stale tab\'s autosave did not overwrite');
    assert.strictEqual(await warnings(two, 'changed in another tab'), 1, 'one warning, not one per tick');

    // The editor's own Save button must not bypass the check.
    await two.evaluate(() => document.querySelector('[data-panel="timeline-editor"]').click());
    await two.waitForFunction(() => window.timelineEditor, null, { timeout: 5000 });
    two.answers = [false, false];
    await two.evaluate(() => window.timelineEditor._saveToLocalStorage());
    for (let i = 0; i < 50 && two.dialogs.length < 2; i++) await two.waitForTimeout(100);
    await two.waitForTimeout(200);
    assert.strictEqual(two.dialogs.length, 2, 'the editor Save button asks the same two questions');
    assert.deepStrictEqual(await storedLabels(one, id), ['From tab one', 'Tab one again'], 'declining saves nothing');

    two.answers = [true];
    await two.evaluate(() => ShowduinoProjects.saveCurrentProject({ cloud: false }));
    const copyId = await openId(two);
    assert.notStrictEqual(copyId, id, 'keep both: this tab now has a new show');
    assert.deepStrictEqual(await storedLabels(two, copyId), ['From tab one', 'From tab two']);
    assert.deepStrictEqual(await storedLabels(two, id), ['From tab one', 'Tab one again'], 'the other tab\'s version is unchanged');
    assert.strictEqual(await warnings(one, 'another tab'), 0, 'the up-to-date tab saw no conflict');

    // Delete tab one's show from tab two (it is not open there any more).
    two.answers = [true];
    await two.evaluate((k) => ShowduinoProjects.deleteLocalProject(k), id);
    await one.waitForFunction(() => window.__log.some((l) => /deleted in another tab/.test(l.message)), null, { timeout: 5000 });
    await addCue(one, 'After delete'); await one.waitForTimeout(3500);
    assert.strictEqual(await one.evaluate((k) => localStorage.getItem('showduino_project_' + k), id), null, 'autosave does not bring the deleted show back');
    one.answers = [true];
    await one.evaluate(() => ShowduinoProjects.saveCurrentProject({ cloud: false }));
    assert.strictEqual((await storedLabels(one, id)).length, 3, 'the user can still choose to keep it');
    assert.deepStrictEqual([...one.errors, ...two.errors].filter((e) => !/supabase/i.test(e)), [], 'no script errors in either tab');
    await context.close();
    console.log('PASS  two tabs, same show: announced, not overwritten, keep-both copy, deleted show not resurrected');
  }

  // ---- Timeline start-up: no show swap, shortcuts and timer bound once
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.route(/^https:\/\//, (route) => route.abort());
    const page = await openStudio(context);
    const result = await page.evaluate(async () => {
      const make = (name) => { const x = SHDOModel.createProject(name); x.assets = {}; x.scenes = []; x.globalSettings = {}; x.metadata = {}; return x; };
      const a = make('Show A'); const b = make('Show B');
      localStorage.setItem('showduino_project_' + b.project.id, JSON.stringify(b));
      localStorage.setItem('showduino_current_project', JSON.stringify(a));   // the shared editor backup holds another show
      let timers = 0; const original = window.setInterval;
      window.setInterval = function (cb, ms) { if (ms === 30000) timers += 1; return original.apply(this, arguments); };
      ShowduinoProjects.loadLocalProject(b.project.id);
      const names = [window.state.project.project.name];
      for (let i = 0; i < 3; i++) {
        document.querySelector('[data-panel="timeline-editor"]').click(); await new Promise((r) => setTimeout(r, 500));
        names.push(window.state.project.project.name);
        document.querySelector('[data-panel="settings"]').click(); await new Promise((r) => setTimeout(r, 200));
      }
      document.querySelector('[data-panel="timeline-editor"]').click(); await new Promise((r) => setTimeout(r, 500));
      let toggles = 0; const editor = window.timelineEditor;
      const play = editor.play.bind(editor); const pause = editor.pause.bind(editor);
      editor.play = function () { toggles += 1; return play(); }; editor.pause = function () { toggles += 1; return pause(); };
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));
      const result = { names, timers, toggles, playing: editor._playing };
      pause();
      return result;
    });
    assert.deepStrictEqual(result.names, ['Show B', 'Show B', 'Show B', 'Show B'], 'opening the timeline keeps the show that was opened');
    assert.ok(result.timers <= 1, `the editor backup timer starts once (started ${result.timers} times)`);
    assert.strictEqual(result.toggles, 1, 'Space toggles playback once after the panel was opened four times');
    assert.strictEqual(result.playing, true, 'and playback actually started');
    assert.deepStrictEqual(page.errors.filter((e) => !/supabase/i.test(e)), [], 'no script errors');
    await context.close();
    console.log('PASS  timeline start-up: open show kept, one timer, shortcuts bound once');
  }
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=studio-two-tabs::${String(e.message).replace(/\r?\n/g, ' ').slice(0, 900)}`); server.close(); process.exit(1); });
