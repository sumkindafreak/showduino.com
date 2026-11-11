/* Phase 2 browser test: the Studio Settings and Projects panels work with real clicks on a
 * tablet and a desktop, and the phone Project tab keeps the open show.
 * Proves: Settings controls are on screen, saving stores the values and applies the theme,
 * the setting survives a reload, "Timed saves off" is the honest label, the Projects panel
 * lists the local show and opens it, moving between panels never drops the open show, and
 * a settings change in a second tab restarts this tab's autosave timer.
 * Browser emulation only: this is not a test on a physical Android device. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

/**
 * Open Studio in a new page of the given context and wait until it has started.
 * @param {import('playwright').BrowserContext} context Browser context.
 * @returns {Promise<import('playwright').Page>} The page, with page.errors collecting script errors.
 */
async function openStudio(context) {
  const page = await context.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ShowduinoProjects && window.ShowduinoPanelRuntime && window.state?.project?.project?.id, null, { timeout: 15000 });
  return page;
}
const openPanel = (page, name) => page.evaluate((n) => document.querySelector(`[data-panel="${n}"]`).click(), name);
const projectId = (page) => page.evaluate(() => window.state?.project?.project?.id || null);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, ...(process.env.SHOWDUINO_BROWSER_CHANNEL ? { channel: process.env.SHOWDUINO_BROWSER_CHANNEL } : {}) });

  for (const [label, profile] of [['tablet 820x1180 touch', { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['desktop 1366x768', { viewport: { width: 1366, height: 768 } }]]) {
    const context = await browser.newContext(profile);
    await context.route(/^https:\/\//, (route) => route.abort());   // never the CDN or Supabase
    const page = await openStudio(context);
    const id = await projectId(page);

    await openPanel(page, 'settings');
    await page.waitForSelector('#settings-autosave', { timeout: 5000 });
    const offScreen = await page.evaluate(() => ['settings-theme', 'settings-autosave', 'settings-snap', 'settings-showduino-target'].filter((key) => {
      const r = document.getElementById(key).getBoundingClientRect();
      return !(r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth + 1);
    }));
    assert.deepStrictEqual(offScreen, [], `${label}: every Settings control is on screen`);
    assert.deepStrictEqual(await page.$$eval('#settings-autosave option', (o) => o.map((x) => x.textContent)),
      ['Continuous (1.5 seconds)', '10 seconds', '30 seconds', '1 minute', 'Timed saves off'], `${label}: autosave choices`);

    await page.selectOption('#settings-autosave', '30000');
    await page.selectOption('#settings-theme', 'darker');
    await page.locator('[data-sd-click="save-settings"]').click();
    await page.waitForFunction(() => /saved on this device/i.test(document.getElementById('settings-save-status')?.textContent || ''), null, { timeout: 5000 });
    assert.deepStrictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('showduino_settings'))), { theme: 'darker', autosave: 30000, snap: 1000 }, `${label}: settings stored`);
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('theme-darker')), true, `${label}: theme applied at once`);

    // An unsupported address is refused and nothing is stored.
    await page.fill('#settings-showduino-target', 'not a host!!');
    await page.selectOption('#settings-autosave', '10000');
    await page.locator('[data-sd-click="save-settings"]').click();
    await page.waitForFunction(() => /valid/i.test(document.getElementById('settings-save-status')?.textContent || ''), null, { timeout: 5000 });
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('showduino_settings'))).autosave, 30000, `${label}: a refused save changes nothing`);

    await openPanel(page, 'hauntsync');
    await page.waitForSelector('[data-sd-click="studio-project-open-local"]', { timeout: 5000 });
    assert.match(await page.textContent('#studio-project-list'), /Saved on this device/, `${label}: local shows are listed`);
    assert.doesNotMatch(await page.textContent('#studio-project-list'), /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/, `${label}: dates are shown for people, not as raw timestamps`);
    await page.locator('[data-sd-click="studio-project-open-local"]').first().click();
    await page.waitForTimeout(400);
    assert.strictEqual(await projectId(page), id, `${label}: opening the listed show keeps it open`);

    // Delete: offered for a saved show that is not open, never for the open one; asks first.
    const spareId = await page.evaluate(async () => {
      const spare = SHDOModel.createProject('Spare show');
      spare.assets = {}; spare.scenes = []; spare.globalSettings = {}; spare.metadata = {};
      localStorage.setItem('showduino_project_' + spare.project.id, JSON.stringify(spare));
      const index = JSON.parse(localStorage.getItem('showduino_local_projects') || '[]');
      index.push({ id: spare.project.id, name: spare.project.name, updatedAt: spare.project.updatedAt });
      localStorage.setItem('showduino_local_projects', JSON.stringify(index));
      return spare.project.id;
    });
    await openPanel(page, 'hauntsync');
    await page.waitForSelector(`[data-sd-click="studio-project-delete-local"][data-sd-arg="${spareId}"]`, { timeout: 5000 });
    assert.strictEqual(await page.locator(`[data-sd-click="studio-project-delete-local"][data-sd-arg="${id}"]`).count(), 0, `${label}: the open show has no Delete button`);
    const dialogs = [];
    page.once('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.locator(`[data-sd-click="studio-project-delete-local"][data-sd-arg="${spareId}"]`).click();
    await page.waitForTimeout(200);
    assert.match(dialogs[0] || '', /Delete "Spare show" from this device\? This cannot be undone/, `${label}: deletion asks first`);
    assert.ok(await page.evaluate((k) => localStorage.getItem('showduino_project_' + k) !== null, spareId), `${label}: cancelling keeps the show`);
    page.once('dialog', (d) => d.accept());
    await page.locator(`[data-sd-click="studio-project-delete-local"][data-sd-arg="${spareId}"]`).click();
    await page.waitForFunction((k) => localStorage.getItem('showduino_project_' + k) === null, spareId, { timeout: 5000 });
    assert.match(await page.textContent('#studio-project-status'), /Deleted "Spare show"/, `${label}: deletion is confirmed on screen`);
    assert.strictEqual(await projectId(page), id, `${label}: deleting another show leaves the open show alone`);

    await openPanel(page, 'timeline-editor'); await openPanel(page, 'settings'); await openPanel(page, 'timeline-editor');
    assert.strictEqual(await projectId(page), id, `${label}: the open show survives panel changes`);

    // A second tab turns timed saves off; this tab must follow without a reload.
    const timers = () => page.evaluate(() => window.__autosaveRestarts || 0);
    await page.evaluate(() => { const original = window.setInterval; window.__autosaveRestarts = 0; window.setInterval = function (cb, ms) { if (ms === 60000) window.__autosaveRestarts += 1; return original.apply(this, arguments); }; });
    const other = await context.newPage();
    await other.goto(`http://127.0.0.1:${server.address().port}/privacy.html`, { waitUntil: 'load' });
    await other.evaluate(() => localStorage.setItem('showduino_settings', JSON.stringify({ theme: 'darker', autosave: 60000, snap: 1000 })));
    await page.waitForFunction(() => (window.__autosaveRestarts || 0) >= 1, null, { timeout: 5000 });
    assert.ok(await timers() >= 1, `${label}: a setting saved in another tab restarts the autosave timer here`);
    await other.close();

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.state?.project?.project?.id, null, { timeout: 15000 });
    assert.strictEqual(await projectId(page), id, `${label}: reload restores the same show`);
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('theme-darker')), true, `${label}: theme survives reload`);
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${label}: no sideways scroll`);
    assert.deepStrictEqual(page.errors.filter((e) => !/supabase/i.test(e)), [], `${label}: no script errors`);
    await context.close();
    console.log(`PASS  ${label}: Settings save, refuse, persist; Projects list, open and delete; cross-tab autosave; reload`);
  }

  // Phone: the simple builder's Project tab offers save, export and import at touch size.
  {
    const context = await browser.newContext(devices['Pixel 7']);
    await context.route(/^https:\/\//, (route) => route.abort());
    const page = await openStudio(context);
    const id = await projectId(page);
    await page.getByText('PROJECT').last().tap();
    for (const name of ['Save', 'Rename', 'Export .shdo', 'Import', 'Open advanced timeline']) {
      const box = await page.getByRole('button', { name, exact: true }).first().boundingBox();
      assert.ok(box && box.height >= 40 && box.x >= 0 && box.x + box.width <= 412 + 1, `phone: "${name}" is a full-size touch target on screen`);
    }
    await page.getByText('BUILD').last().tap(); await page.getByText('PROJECT').last().tap();
    assert.strictEqual(await projectId(page), id, 'phone: the open show survives tab changes');
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'phone: no sideways scroll');
    assert.deepStrictEqual(page.errors.filter((e) => !/supabase/i.test(e)), [], 'phone: no script errors');
    await context.close();
    console.log('PASS  phone (Pixel 7 emulation): Project tab controls are touch-sized and keep the open show');
  }
  await browser.close(); server.close();
})().catch((e) => { console.error("FAIL", e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=studio-settings-projects::${String(e.message).replace(/\r?\n/g, ' ').slice(0, 900)}`); server.close(); process.exit(1); });
