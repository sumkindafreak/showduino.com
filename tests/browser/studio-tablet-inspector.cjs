/* Browser test for the tablet Inspector (adapted from old PR #13's inspector sheet idea).
 * Between 761 and 1199 px the Inspector slides in over the timeline when a cue is opened,
 * instead of permanently taking 320 px. Desktop (>= 1200 px) keeps the column. */
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

async function open(browser, viewport, opts = {}) {
  const context = await browser.newContext({ viewport, ...opts });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(page.url = `http://127.0.0.1:${server.address().port}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects && window.ShowduinoPackage && window.ShowduinoInspectorDrawer && window.ShowduinoTimelineTouch, null, { timeout: 15000 });
  await page.evaluate(async () => {
    const project = SHDOModel.createProject('Inspector test');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const t = SHDOModel.createTrack('mixed', 'Track A', 0);
    const c = SHDOModel.createClip(t.id, 'audio', 500, 2500, 'Inspect me'); c.routing.nodeId = 'audio-1'; c.params.file = 'a.wav';
    project.tracks.push(t); project.clips.push(c);
    await ShowduinoProjects.importProject(new File([JSON.stringify(ShowduinoPackage.toShdo(project))], 'i.shdo'));
    document.querySelector('[data-panel="timeline-editor"]')?.click();
  });
  await page.waitForFunction(() => document.querySelector('.timeline-editor .tl-clip[data-clip-id]'), null, { timeout: 10000 });
  await page.evaluate(() => { window.timelineEditor._canvasScroll.scrollLeft = 0; });
  await wait(300);
  return { context, page };
}
const layout = (page) => page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width }; };
  const insp = document.querySelector('.timeline-editor .tl-inspector');
  const cs = getComputedStyle(insp);
  const b = insp.getBoundingClientRect();
  return {
    open: document.body.classList.contains('studio-inspector-open'),
    scroll: r('.timeline-editor .tl-canvas-scroll'),
    insp: { left: b.left, right: b.right, width: b.width, visibility: cs.visibility, onScreen: b.left < innerWidth - 1 && b.right > 0 },
    bar: Boolean(insp.querySelector('.studio-inspector-drawer-bar')),
    hasForm: Boolean(insp.querySelector('input, select, textarea')),
    vw: innerWidth
  };
});
const clipCenter = (page) => page.evaluate(() => { const b = document.querySelector('.timeline-editor .tl-clip[data-clip-id]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const errors = [];

  // 1. Tablet landscape with touch: hidden until a cue is tapped, timeline gets the width.
  let { context, page } = await open(browser, { width: 1024, height: 768 }, { hasTouch: true });
  let L = await layout(page);
  assert.strictEqual(L.open, false);
  assert.ok(!L.insp.onScreen && L.insp.visibility === 'hidden', 'Inspector hidden before a cue is opened');
  assert.ok(L.scroll.right >= L.vw - 2, `timeline reaches the right edge (${L.scroll.right} of ${L.vw})`);
  assert.ok(L.scroll.width > 600, `timeline is wide (${L.scroll.width}px)`);
  console.log(`PASS  tablet 1024x768: Inspector hidden, timeline ${Math.round(L.scroll.width)}px wide (was ~331px)`);

  let c = await clipCenter(page);
  await page.touchscreen.tap(c.x, c.y);
  await wait(450);
  L = await layout(page);
  assert.ok(L.open && L.insp.onScreen && L.insp.visibility === 'visible', 'tap on a cue opens the Inspector');
  assert.ok(L.insp.right <= L.vw + 1 && L.insp.width <= 360.5, `Inspector slides in from the right (${Math.round(L.insp.left)}–${Math.round(L.insp.right)})`);
  assert.ok(L.bar, 'Inspector has a header with a close button');
  assert.ok(L.hasForm, 'Inspector shows the cue settings');
  console.log(`PASS  tap on a cue opens the Inspector (${Math.round(L.insp.width)}px panel with close button and settings)`);

  // Edit a field inside the overlay: it must be interactive (not covered or pointer-events:none).
  const editable = await page.evaluate(() => {
    const el = document.querySelector('.timeline-editor .tl-inspector input:not([type=hidden]):not([disabled]), .timeline-editor .tl-inspector select:not([disabled])');
    if (!el) return null;
    const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + Math.min(10, b.width / 2), b.top + b.height / 2);
    return hit === el || el.contains(hit);
  });
  assert.strictEqual(editable, true, 'Inspector fields receive taps');
  const onTop = await page.evaluate(() => {
    const insp = document.querySelector('.timeline-editor .tl-inspector').getBoundingClientRect();
    const clip = document.querySelector('.timeline-editor .tl-clip[data-clip-id]').getBoundingClientRect();
    if (clip.right <= insp.left) return 'no-overlap';
    const hit = document.elementFromPoint(insp.left + 12, clip.top + clip.height / 2);
    return Boolean(hit && hit.closest('.tl-inspector'));
  });
  assert.ok(onTop === true || onTop === 'no-overlap', 'a selected clip under the panel is not drawn on top of it');
  console.log('PASS  Inspector fields are reachable and the panel is drawn above selected clips');

  await page.click('.studio-inspector-close');
  await wait(400);
  L = await layout(page);
  assert.ok(!L.open && !L.insp.onScreen && L.insp.visibility === 'hidden', 'close button hides it');
  await page.touchscreen.tap(c.x, c.y); await wait(400);
  assert.ok((await layout(page)).open, 'reopens on tap');
  await page.keyboard.press('Escape'); await wait(400);
  assert.ok(!(await layout(page)).open, 'Escape closes');
  console.log('PASS  close button and Escape hide it again');

  // A touch drag on the selected cue moves it without opening the Inspector.
  const cdp = await context.newCDPSession(page);
  c = await clipCenter(page);
  await page.evaluate(() => { window.timelineEditor._snapEnabled = false; });
  const before = await page.evaluate(() => window.timelineEditor._clips()[0].startMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + i * 10, y: c.y, id: 1 }] }); await wait(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(400);
  const after = await page.evaluate(() => window.timelineEditor._clips()[0].startMs);
  assert.ok(after > before + 500, `cue moved (${before} → ${after})`);
  assert.ok(!(await layout(page)).open, 'dragging does not open the Inspector');
  console.log(`PASS  dragging a cue moves it (${before} → ${after} ms) without opening the Inspector`);
  errors.push(...page.errors);
  await context.close();

  // 2. iPad portrait.
  ({ context, page } = await open(browser, { width: 820, height: 1180 }, { hasTouch: true }));
  L = await layout(page);
  assert.ok(!L.insp.onScreen && L.scroll.width > 600, `portrait timeline ${L.scroll.width}px`);
  c = await clipCenter(page); await page.touchscreen.tap(c.x, c.y); await wait(400);
  L = await layout(page);
  assert.ok(L.open && L.insp.onScreen && L.insp.right <= L.vw + 1, 'portrait: tap opens it');
  console.log(`PASS  tablet 820x1180: timeline ${Math.round((await page.evaluate(() => document.querySelector('.timeline-editor .tl-canvas-scroll').getBoundingClientRect().width)))}px wide; tap opens the Inspector`);
  errors.push(...page.errors);
  await context.close();

  // 3. Small laptop window with a mouse: click opens it, Escape closes.
  ({ context, page } = await open(browser, { width: 1100, height: 800 }));
  c = await clipCenter(page); await page.mouse.click(c.x, c.y); await wait(400);
  L = await layout(page);
  assert.ok(L.open && L.insp.onScreen, 'mouse click opens it in a small window');
  // Grow the window into the desktop layout while open: the column takes over, no stale state.
  await page.setViewportSize({ width: 1366, height: 900 }); await wait(400);
  L = await layout(page);
  assert.ok(!L.open && !L.bar && L.insp.onScreen && L.insp.visibility === 'visible', 'resizing to desktop switches to the column cleanly');
  assert.ok(L.scroll.right <= L.insp.left + 1, 'desktop column sits beside the timeline');
  console.log('PASS  small window: mouse click opens it; widening to desktop switches to the column with no leftover drawer');
  errors.push(...page.errors);
  await context.close();

  // 4. Desktop: unchanged column, never an overlay.
  ({ context, page } = await open(browser, { width: 1366, height: 900 }));
  L = await layout(page);
  assert.ok(L.insp.onScreen && L.insp.visibility === 'visible' && !L.open, 'desktop shows the column');
  assert.ok(Math.abs(L.insp.width - 340) < 2, `desktop column width unchanged (${L.insp.width})`);
  assert.ok(L.scroll.right <= L.insp.left + 1, 'column does not cover the timeline');
  c = await clipCenter(page); await page.mouse.click(c.x, c.y); await wait(300);
  L = await layout(page);
  assert.ok(!L.open && !L.bar && L.hasForm, 'desktop click fills the column, no drawer');
  console.log(`PASS  desktop 1366: column unchanged (${Math.round(L.insp.width)}px beside a ${Math.round(L.scroll.width)}px timeline), no drawer`);
  errors.push(...page.errors);
  await context.close();

  assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log('PASS  no page errors');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL ', e.message); process.exit(1); });
