/* W002 browser test: every string in an imported .shdo is hostile.
 *
 * Builds a multi-node production (P4 pixels, Pixel Node, Audio Node pixels,
 * Emergency Node pixels, Audio Node audio, MOSFET, trigger), appends an HTML/JS
 * payload to EVERY string field (names, labels, IDs, routes, file names, params,
 * metadata), imports it, then drives every Studio view: all panels, every clip
 * (select, double-click), legacy and professional inspectors, the project browser,
 * readiness checks, deploy compile, the log, every non-destructive button in each
 * panel, and the phone editor. Any execution of injected script fails the test and
 * prints the DOM location where the payload was inserted.
 *
 * Variants: "text" (IDs untouched, so the file stays valid and every view renders)
 * and "ids" (payload also in IDs: import must refuse it or render it inertly). */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const SAFE_BUTTON = /^(?!.*(sign|log ?out|delete|remove|clear all|reset|erase|publish|share)).*/i;

async function run(browser, base, width, variant) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true })).newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  // Counted in Node so a page reload cannot reset the evidence.
  let hits = 0; const sinkPaths = new Set();
  await page.exposeFunction('__hit', () => { hits++; });
  await page.exposeFunction('__sink', (s) => { sinkPaths.add(s); });
  await page.addInitScript(() => {
    window.__xss = 0; window.__sinks = [];
    const watch = () => new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const hits = [...(n.matches?.('img[src="x"],svg[onload],[onerror],[onload]') ? [n] : []), ...n.querySelectorAll('img[src="x"],svg[onload],[onerror]')];
        for (const h of hits) {
          let p = h.parentElement, trail = [];
          for (let i = 0; p && i < 5; i++, p = p.parentElement) trail.push(p.tagName + (p.id ? '#' + p.id : '') + (typeof p.className === 'string' && p.className ? '.' + p.className.split(' ').slice(0, 2).join('.') : ''));
          window.__sink && window.__sink(trail.join(' < '));
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', watch);
  });
  await page.goto(base + 'studio.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects && window.SHDOModel && window.ShowduinoPackage, null, { timeout: 15000 });

  const importResult = await page.evaluate(async (variant) => {
    const P = '"><img src=x onerror="__hit()">\'<svg onload=__hit()>`${__hit()}\';__hit();//';
    const project = SHDOModel.createProject('Show');
    project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
    const mk = (type, name, idx) => { const t = SHDOModel.createTrack(type, name, idx); project.tracks.push(t); return t; };
    const clip = (t, type, start, dur, label, node, params) => { const c = SHDOModel.createClip(t.id, type, start, dur, label); c.routing.nodeId = node; Object.assign(c.params, params); project.clips.push(c); return c; };
    const px = mk('pixel', 'P4 pixels', 0), pn = mk('pixel', 'Pixel node', 1), ap = mk('pixel', 'Audio pixels', 2), ep = mk('pixel', 'Estop pixels', 3);
    const au = mk('audio', 'Audio', 4), mo = mk('mosfet', 'Mosfet', 5), tr = mk('trigger', 'Trigger', 6);
    clip(px, 'pixel', 0, 2000, 'P4 flash', 'p4-local', { startPixel: 0, length: 10, effect: 'LIGHTNING' });
    clip(pn, 'pixel', 500, 2000, 'Node fire', 'LED-01', { startPixel: 0, length: 10, effect: 'FIRE' });
    clip(ap, 'pixel', 800, 1500, 'Audio px', 'audio-node', { startPixel: 0, length: 5, effect: 'CHASE' });
    clip(ep, 'pixel', 900, 1500, 'Exit sign', 'ESTOP-01', { startPixel: 0, length: 10, effect: 'WARNING' });
    clip(au, 'audio', 1000, 3000, 'Roar', 'audio-1', { file: 'roar.wav', volume: 80 });
    clip(mo, 'mosfet', 1200, 1000, 'Fog', 'MOS-01', { out: 'out1', duty: 100 });
    clip(tr, 'trigger', 1400, 500, 'Sensor', 'IN-01', { input: 'IN1' });
    let shdo;
    try { shdo = ShowduinoPackage.toShdo(project); } catch (e) { return 'toShdo failed: ' + e.message; }
    const structural = new Set(['schema', 'format', 'version', 'type', 'kind', 'policy', 'pixelOverride', 'license', 'route', 'effect', 'mode', 'transport', 'runtimeAuthority', 'nodeAddressing', 'direction', 'role', 'out', 'input', 'unit', 'action']);
    const walk = (o, key, path) => {
      if (Array.isArray(o)) return o.map((v, i) => walk(v, key, path + '[' + i + ']'));
      if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k], k, path + '.' + k); return o; }
      if (typeof o !== 'string') return o;
      if (path.startsWith('.safety') || path.startsWith('.package') || path.startsWith('.architecture')) return o;
      const isId = /(^id$|Id$|Ids$|^nodeId$)/.test(key) || /\.(clipIds|ids)\[/.test(path);
      if (isId) return variant === 'text' ? o : o + P;
      if (structural.has(key)) return o;
      return o + P;
    };
    walk(shdo, '', '');
    if (variant === 'stored-ids') {
      // Simulates a corrupted local save or a hostile cloud row: bypasses the import
      // guard and loads straight from browser storage, so the views themselves must be safe.
      const restored = ShowduinoPackage.fromShdo(shdo);
      const id = 'w002-stored';
      restored.project.id = id;
      localStorage.setItem('showduino_project_' + id, JSON.stringify(restored));
      try { window.ShowduinoProjects.loadLocalProject(id); return 'imported'; } catch (e) { return 'refused: ' + e.message.slice(0, 120); }
    }
    try { await window.ShowduinoProjects.importProject(new File([JSON.stringify(shdo)], 'hostile.shdo')); return 'imported'; }
    catch (e) { return 'refused: ' + e.message.slice(0, 120); }
  }, variant);

  const steps = []; const coverage = { panels: 0, clips: 0, buttons: 0, phoneTabs: 0, phoneEditors: 0 };
  const step = async (name, fn) => { try { await fn(); } catch (e) { /* views that do not exist at this width are skipped */ } await page.waitForTimeout(150); steps.push([name, hits]); };
  if (importResult === 'imported') {
    const panels = await page.$$eval('[data-panel]', (els) => [...new Set(els.map((e) => e.dataset.panel))]);
    for (const panel of panels) {
      await step('panel ' + panel, async () => { await page.evaluate((p) => document.querySelector(`[data-panel="${p}"]`)?.click(), panel); coverage.panels++; });
      await step('clips in ' + panel, async () => {
        for (const h of (await page.$$('[data-clip-id]')).slice(0, 10)) { if (await h.click({ timeout: 400, force: true }).then(() => true, () => false)) coverage.clips++; await h.dblclick({ timeout: 400, force: true }).catch(() => {}); }
      });
      await step('buttons in ' + panel, async () => {
        const buttons = await page.$$('main button:visible, .studio-main button:visible, [role=dialog] button:visible, #studio-mobile-app button:visible');
        for (const b of buttons.slice(0, 30)) {
          const label = ((await b.textContent().catch(() => '')) || '').trim();
          if (!SAFE_BUTTON.test(label)) continue;
          if (await b.click({ timeout: 400 }).then(() => true, () => false)) coverage.buttons++;
          await page.waitForTimeout(60);
          await page.keyboard.press('Escape').catch(() => {});
        }
      });
    }
    // Phone editor: every tab, every cue editor, the time/sync pickers.
    await step('phone editor', async () => {
      // The phone UI re-renders on every tap, so query by attribute each time.
      const tabs = await page.$$eval('#studio-mobile-app [data-sm-tab]', (els) => [...new Set(els.map((e) => e.dataset.smTab))]);
      for (const tab of tabs) {
        const ok = await page.evaluate((t) => { const el = document.querySelector(`#studio-mobile-app [data-sm-tab="${t}"]`); if (!el) return false; el.click(); return true; }, tab);
        if (ok) coverage.phoneTabs++;
        await page.waitForTimeout(150);
        const editors = await page.$$eval('[data-sm-edit]', (els) => els.length);
        for (let i = 0; i < Math.min(editors, 8); i++) {
          const opened = await page.evaluate((n) => { const el = document.querySelectorAll('[data-sm-edit]')[n]; if (!el) return false; el.click(); return true; }, i);
          if (opened) coverage.phoneEditors++;
          await page.waitForTimeout(150);
          await page.evaluate(() => { document.querySelectorAll('[data-sm-picker-open],[data-sm-time],[data-sm-sync-at]').forEach((el, n) => { if (n < 4) el.click(); }); });
          await page.waitForTimeout(100);
          await page.evaluate(() => document.querySelector('[data-sm-editor-close],[data-sm-editor-exit],[data-sm-picker-close],[data-sm-sync-close]')?.click());
          await page.waitForTimeout(100);
          await page.evaluate((t) => document.querySelector(`#studio-mobile-app [data-sm-tab="${t}"]`)?.click(), tab);
        }
      }
    });
    await step('legacy inspector', () => page.evaluate(() => { const te = window.timelineEditor; const c = te?._clips?.()[0]; if (c && te.__proto__.constructor.prototype._showInspector) te._showInspector(c.id); }));
    await step('project browser', () => page.evaluate(() => window.timelineEditor?._openProjectBrowser?.()));
    await step('readiness and deploy compile', () => page.evaluate(async () => { const s = window.ShowduinoPackage.toShdo(window.ShowduinoProjects ? (window.studioState || window.state || {}).project || {} : {}); window.ShowduinoDeploy?.compileShdoForStage?.(s); }));
    await step('deploy (local origin, no hardware)', () => page.evaluate(() => window.ShowduinoDeploy?.deployCurrentProject?.().catch(() => {})));
    await step('reload and restore', async () => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.ShowduinoProjects, null, { timeout: 15000 }); await page.waitForTimeout(800); });
    await step('project browser after reload', () => page.evaluate(() => window.timelineEditor?._openProjectBrowser?.()));
  }
  await page.waitForTimeout(300);
  await page.close();
  return { width, variant, importResult, executed: hits, sinks: [...sinkPaths].slice(0, 12), firstExecution: (steps.find(([, n]) => n > 0) || [])[0] || null, steps: steps.length, coverage };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  let failed = 0;
  for (const variant of ['text', 'ids', 'stored-ids']) for (const width of [1366, 390]) {
    const r = await run(browser, base, width, variant);
    console.log(JSON.stringify(r));
    if (r.executed > 0) failed++;
    if (variant !== 'ids' && r.importResult !== 'imported') { console.log(variant + ' variant must load'); failed++; }
    if (variant === 'ids' && r.importResult === 'imported') { console.log('hostile identifiers must be refused at import'); failed++; }
  }
  await browser.close(); server.close();
  if (failed) { console.error(`FAIL: ${failed} run(s) executed injected script or did not import`); process.exit(1); }
  console.log('PASS: every hostile string in an imported .shdo stayed inert across all Studio views (desktop and phone).');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
