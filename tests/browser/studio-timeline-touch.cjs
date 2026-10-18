/* Browser test for timeline touch gestures on a tablet (adapted from old PR #19).
 * Uses real touch input through the Chromium DevTools protocol, so the browser's own
 * touch-action and pointer-event rules apply. No network or hardware is used. */
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

async function touchDrag(cdp, points, { holdMs = 0 } = {}) {
  const [first, ...rest] = points;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first.x, y: first.y, id: 1 }] });
  if (holdMs) await wait(holdMs);
  for (const p of rest) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await wait(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(120);
}
function line(from, to, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }));
}
async function tap(cdp, p) { await touchDrag(cdp, [p]); }

const state = (page) => page.evaluate(() => {
  const ed = window.timelineEditor;
  const c = ed._clips().find((x) => x.label === 'Touch me');
  return { id: c.id, startMs: c.startMs, durationMs: c.durationMs, trackId: c.trackId, selected: ed._selectedClipId, px: ed._pxPerMs, scrollLeft: ed._canvasScroll.scrollLeft, undo: ed._undoStack?.length ?? null };
});
const box = (page, id) => page.evaluate((cid) => {
  const r = document.querySelector(`.timeline-editor .tl-clip[data-clip-id="${CSS.escape(cid)}"]`).getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, width: r.width };
}, id);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/studio.html`;
  const browser = await chromium.launch();
  const errors = [];

  // ---------- Tablet (iPad-sized, touch) ----------
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects && window.ShowduinoPackage && window.ShowduinoTimelineTouch, null, { timeout: 15000 });
  await page.evaluate(async () => {
    const project = SHDOModel.createProject('Touch test');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const t1 = SHDOModel.createTrack('mixed', 'Track A', 0);
    const t2 = SHDOModel.createTrack('mixed', 'Track B', 1);
    const c = SHDOModel.createClip(t1.id, 'audio', 500, 2500, 'Touch me'); c.routing.nodeId = 'audio-1'; c.params.file = 'a.wav';
    const other = SHDOModel.createClip(t2.id, 'audio', 40000, 3000, 'Other');
    project.tracks.push(t1, t2); project.clips.push(c, other);
    await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(project))], 't.shdo'));
    document.querySelector('[data-panel="timeline-editor"]')?.click();
  });
  await page.waitForFunction(() => window.timelineEditor?._clips?.().some((c) => c.label === 'Touch me') && document.querySelector('.timeline-editor .tl-clip[data-clip-id]'), null, { timeout: 10000 });
  await page.evaluate(() => { const ed = window.timelineEditor; ed._snapEnabled = false; ed._selectedClipId = null; ed._canvasScroll.scrollLeft = 0; window.ShowduinoTimelineTouch.armSelected(); });
  await wait(200);
  const cdp = await context.newCDPSession(page);

  // 1. A finger on an unselected clip scrolls the timeline; the clip does not move.
  let s0 = await state(page);
  let b = await box(page, s0.id);
  await touchDrag(cdp, line({ x: b.cx, y: b.cy }, { x: b.cx - 300, y: b.cy }));
  let s1 = await state(page);
  assert.strictEqual(s1.startMs, s0.startMs, 'unselected clip not moved by a swipe');
  assert.ok(s1.scrollLeft > s0.scrollLeft + 100, `swipe scrolled the timeline (${s0.scrollLeft} → ${s1.scrollLeft})`);
  console.log(`PASS  swipe on an unselected clip scrolls (${s0.scrollLeft} → ${s1.scrollLeft}px), clip stays at ${s1.startMs} ms`);

  // 2. Tap selects.
  await wait(1500);   // let the swipe's fling finish; a tap during a fling only stops it
  await page.evaluate(() => { window.timelineEditor._canvasScroll.scrollLeft = 0; });
  await wait(200);
  b = await box(page, s0.id);
  await tap(cdp, { x: b.cx, y: b.cy });
  await wait(150);
  s1 = await state(page);
  assert.strictEqual(s1.selected, s0.id, 'tap selected the clip');
  assert.strictEqual(s1.startMs, s0.startMs, 'tap did not move the clip');
  const armed = await page.evaluate((cid) => getComputedStyle(document.querySelector(`.tl-clip[data-clip-id="${CSS.escape(cid)}"]`)).touchAction, s0.id);
  assert.strictEqual(armed, 'none', 'selected clip is armed for touch drag');
  console.log('PASS  tap selects the clip without moving it; selected clip is armed (touch-action:none)');

  // 3. Drag the selected clip right by ~1 s and down one track.
  const before = await state(page);
  b = await box(page, s0.id);
  const dx = 1000 * before.px;
  const trackH = await page.evaluate(() => window.timelineEditor._trackHeight);
  const scrollBefore = before.scrollLeft;
  await touchDrag(cdp, line({ x: b.cx, y: b.cy }, { x: b.cx + dx, y: b.cy + trackH }));
  let after = await state(page);
  assert.ok(Math.abs(after.startMs - (before.startMs + 1000)) < 120, `moved by ~1000 ms (${before.startMs} → ${after.startMs})`);
  assert.notStrictEqual(after.trackId, before.trackId, 'moved to the next track');
  assert.strictEqual(after.durationMs, before.durationMs, 'move keeps the duration');
  assert.ok(Math.abs(after.scrollLeft - scrollBefore) < 2, 'dragging a clip did not scroll the timeline');
  if (before.undo !== null) assert.ok(after.undo > before.undo, 'move recorded for undo');
  console.log(`PASS  drag selected clip: ${before.startMs} → ${after.startMs} ms, moved to the next track, timeline did not scroll, undo recorded`);

  // 4. Trim the right edge by about +1.5 s.
  b = await box(page, s0.id);
  let st = await state(page);
  await touchDrag(cdp, line({ x: b.right - 6, y: b.cy }, { x: b.right - 6 + 1500 * st.px, y: b.cy }));
  after = await state(page);
  assert.strictEqual(after.startMs, st.startMs, 'right trim keeps the start');
  assert.ok(Math.abs(after.durationMs - (st.durationMs + 1500)) < 120, `right edge trimmed (${st.durationMs} → ${after.durationMs})`);
  console.log(`PASS  trim right edge: ${st.durationMs} → ${after.durationMs} ms`);

  // 5. Trim the left edge by +1 s (start later, shorter).
  b = await box(page, s0.id);
  st = await state(page);
  await touchDrag(cdp, line({ x: b.left + 6, y: b.cy }, { x: b.left + 6 + 1000 * st.px, y: b.cy }));
  after = await state(page);
  assert.ok(Math.abs(after.startMs - (st.startMs + 1000)) < 120 && Math.abs((after.startMs + after.durationMs) - (st.startMs + st.durationMs)) < 120,
    `left trim keeps the end (${st.startMs}+${st.durationMs} → ${after.startMs}+${after.durationMs})`);
  console.log(`PASS  trim left edge: start ${st.startMs} → ${after.startMs} ms, end unchanged`);

  // 6. A small wobble on the selected clip is still a tap: nothing moves, no undo entry.
  b = await box(page, s0.id);
  st = await state(page);
  await touchDrag(cdp, [{ x: b.cx, y: b.cy }, { x: b.cx + 3, y: b.cy + 2 }]);
  after = await state(page);
  assert.strictEqual(after.startMs, st.startMs); assert.strictEqual(after.durationMs, st.durationMs);
  if (st.undo !== null) assert.strictEqual(after.undo, st.undo, 'no undo entry for a tap');
  console.log('PASS  small wobble is treated as a tap (no change, no undo entry)');

  // 7. Locked track: the selected clip cannot be dragged by touch.
  await page.evaluate(() => { const ed = window.timelineEditor; ed._getClipTrack(ed._selectedClipId).locked = true; });
  b = await box(page, s0.id);
  st = await state(page);
  await touchDrag(cdp, line({ x: b.cx, y: b.cy }, { x: b.cx + 200, y: b.cy }));
  after = await state(page);
  assert.strictEqual(after.startMs, st.startMs, 'locked clip not moved');
  await page.evaluate(() => { const ed = window.timelineEditor; ed._getClipTrack(ed._selectedClipId).locked = false; });
  console.log('PASS  clip on a locked track does not move');

  // 8. Pinch out zooms the timeline (not the page) around the fingers.
  st = await state(page);
  const area = await page.evaluate(() => { const r = window.timelineEditor._canvasScroll.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height - 10, 40) }; });
  const vvBefore = await page.evaluate(() => window.visualViewport?.scale || 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: area.x - 40, y: area.y, id: 1 }, { x: area.x + 40, y: area.y, id: 2 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: area.x - 40 - i * 8, y: area.y, id: 1 }, { x: area.x + 40 + i * 8, y: area.y, id: 2 }] });
    await wait(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(150);
  after = await state(page);
  const vvAfter = await page.evaluate(() => window.visualViewport?.scale || 1);
  assert.ok(after.px > st.px * 1.6, `pinch out zoomed in (${st.px} → ${after.px} px/ms)`);
  assert.strictEqual(vvAfter, vvBefore, 'page itself did not zoom');
  assert.strictEqual(after.startMs, st.startMs, 'pinch did not move the clip');
  // pinch in
  st = after;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: area.x - 120, y: area.y, id: 1 }, { x: area.x + 120, y: area.y, id: 2 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: area.x - 120 + i * 8, y: area.y, id: 1 }, { x: area.x + 120 - i * 8, y: area.y, id: 2 }] });
    await wait(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(150);
  after = await state(page);
  assert.ok(after.px < st.px * 0.6, `pinch in zoomed out (${st.px} → ${after.px} px/ms)`);
  console.log('PASS  pinch zooms the timeline in and out; the page does not zoom; clips do not move');

  // 9. Hostile clip id cannot break the arming stylesheet.
  await page.evaluate(() => { const ed = window.timelineEditor; ed._selectedClipId = '"]{}body{display:none}x[a="'; window.ShowduinoTimelineTouch.armSelected(); });
  const bodyShown = await page.evaluate(() => getComputedStyle(document.body).display !== 'none');
  assert.ok(bodyShown, 'clip id is escaped in the arming rule');
  console.log('PASS  hostile clip id is escaped in the arming rule');
  await context.close();

  // ---------- Desktop mouse: unchanged ----------
  const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const dp = await desk.newPage();
  dp.on('dialog', (d) => d.accept());
  dp.on('pageerror', (e) => errors.push(e.message));
  await dp.goto(url, { waitUntil: 'load' });
  await dp.waitForFunction(() => window.ShowduinoProjects && window.ShowduinoPackage && window.ShowduinoTimelineTouch, null, { timeout: 15000 });
  await dp.evaluate(async () => {
    const project = SHDOModel.createProject('Mouse test');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const t1 = SHDOModel.createTrack('mixed', 'Track A', 0);
    const c = SHDOModel.createClip(t1.id, 'audio', 500, 2500, 'Touch me');
    project.tracks.push(t1); project.clips.push(c);
    await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(project))], 'm.shdo'));
    document.querySelector('[data-panel="timeline-editor"]')?.click();
  });
  await dp.waitForFunction(() => window.timelineEditor?._clips?.().some((c) => c.label === 'Touch me') && document.querySelector('.timeline-editor .tl-clip[data-clip-id]'), null, { timeout: 10000 });
  await dp.evaluate(() => { const ed = window.timelineEditor; ed._snapEnabled = false; ed._canvasScroll.scrollLeft = 0; });
  const m0 = await state(dp);
  const mb = await box(dp, m0.id);
  // Mouse drag works on an unselected clip, as before.
  await dp.mouse.move(mb.cx, mb.cy); await dp.mouse.down();
  await dp.mouse.move(mb.cx + 1500 * m0.px, mb.cy, { steps: 10 }); await dp.mouse.up();
  const m1 = await state(dp);
  assert.ok(Math.abs(m1.startMs - (m0.startMs + 1500)) < 120, `mouse drag unchanged (${m0.startMs} → ${m1.startMs})`);
  console.log(`PASS  desktop mouse drag unchanged: ${m0.startMs} → ${m1.startMs} ms`);
  await desk.close();

  assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log('PASS  no page errors');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL ', e.message); process.exit(1); });
