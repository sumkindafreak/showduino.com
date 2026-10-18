/* W004 browser test for the HauntSync community pages (feed, post, admin, creator, guidelines).
 * The data layer is replaced by tests/browser/fixtures/fake-community.js (no network); the real
 * data layer is tested against PostgREST + PostgreSQL in tests/api/community-api.test.cjs.
 * Checks: hostile names and posts stay inert text, role-based display (visitor, unpublished,
 * member, restricted, owner), posting, replying, reporting (keyboard), owner-only admin page,
 * owner account protected in the member list, and phone layout. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const FAKE = fs.readFileSync(path.join(__dirname, 'fixtures', 'fake-community.js'), 'utf8');
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/js/cloud/supabase-service.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(FAKE); }
  if (url === '/js/cloud/hauntsync-community.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* replaced by fixture */'); }
  const p = path.join(ROOT, decodeURIComponent(url));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let base;

async function open(browser, role, page, viewport) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  await context.route(/cdn\.jsdelivr\.net|unpkg\.com/, (r) => r.abort());
  await context.addInitScript((scenario) => { window.__HS_SCENARIO = scenario; }, { role });
  const tab = await context.newPage();
  tab.errors = [];
  tab.on('pageerror', (e) => tab.errors.push(e.message));
  tab.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Test reason' : undefined));
  await tab.goto(base + page, { waitUntil: 'load' });
  await wait(400);
  return { context, tab };
}
const xss = (tab) => tab.evaluate(() => window.__xss || 0);
const calls = (tab) => tab.evaluate(() => window.__HS_CALLS.slice());
const text = (tab, sel) => tab.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent).join(' | '), sel);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];

  // 1. Visitor
  let { context, tab } = await open(browser, 'visitor', 'feed.html');
  await tab.waitForSelector('#hs-feed-list .hs-post', { timeout: 5000 });
  const titles = await text(tab, '.hs-post-title');
  assert.ok(titles.includes('Free fog <img src=x onerror='), 'hostile title shown as text');
  assert.strictEqual(await tab.locator('.hs-post img').count(), 0, 'no image element created from hostile text');
  assert.ok(/Sign in or create a free Showduino account/.test(await tab.textContent('#hs-composer-gate')), 'visitor asked to sign in');
  assert.ok(await tab.locator('#hs-composer').isHidden());
  assert.strictEqual(await tab.locator('.hs-subnav-admin').count(), 0, 'no admin link for visitors');
  assert.strictEqual(await tab.locator('.hs-report').count(), 0, 'visitors cannot report');
  assert.ok((await text(tab, '.hs-founder-badge')).includes('Showduino Founder'), 'founder badge on the founder post');
  assert.strictEqual(await tab.locator('#hs-feed-list .hs-founder-badge').count(), 1, 'only one founder badge');
  const subnav = await text(tab, '.hs-subnav a');
  assert.ok(['Community', 'Creators', 'Projects', 'My Profile'].every((s) => subnav.includes(s)), 'HauntSync entry points present');
  // featured tab and search
  await tab.click('.hs-tab[data-tab="featured"]'); await wait(300);
  assert.strictEqual(await tab.locator('#hs-feed-list .hs-post').count(), 1);
  await tab.click('.hs-tab[data-tab="latest"]'); await tab.fill('#hs-filter-search', 'chiller'); await wait(600);
  assert.strictEqual(await tab.locator('#hs-feed-list .hs-post').count(), 1);
  assert.ok(/q=chiller/.test(tab.url()), 'search kept in the URL');
  // hostile post page
  await tab.goto(base + 'feed.html?post=20000000-0000-4000-8000-0000000000e1', { waitUntil: 'load' }); await wait(400);
  assert.ok((await tab.textContent('#hs-post-detail')).includes('<script>window.__xss=99</script>'), 'hostile body shown as text');
  await tab.goto(base + 'feed.html?post=not-a-uuid', { waitUntil: 'load' }); await wait(300);
  assert.ok(/not valid/.test(await tab.textContent('#hs-post-detail')), 'bad post id handled');
  // admin page refuses visitors without calling admin functions
  await tab.goto(base + 'admin.html', { waitUntil: 'load' }); await wait(400);
  assert.ok(/Sign in with the founder account/.test(await tab.textContent('#hs-admin-gate')));
  assert.ok(await tab.locator('#hs-admin').isHidden());
  assert.deepStrictEqual((await calls(tab)).filter((c) => c.startsWith('admin.')), [], 'no admin calls for a visitor');
  assert.strictEqual(await xss(tab), 0); errors.push(...tab.errors); await context.close();
  console.log('PASS  visitor: hostile text inert, sign-in prompt, no report/admin controls, founder badge, filters, admin page closed');

  // 2. Signed in, profile not published
  ({ context, tab } = await open(browser, 'unpublished', 'feed.html'));
  assert.ok(/publish your creator profile/.test(await tab.textContent('#hs-composer-gate')), 'asked to publish first');
  assert.ok(await tab.locator('#hs-composer').isHidden());
  errors.push(...tab.errors); await context.close();
  console.log('PASS  unpublished member: told to publish a creator profile before posting');

  // 3. Restricted member
  ({ context, tab } = await open(browser, 'restricted', 'feed.html'));
  const notice = await tab.textContent('.hs-account-notice');
  assert.ok(/restricted/.test(notice) && notice.includes('Cool-off <img'), 'restriction notice with the reason as text');
  assert.ok(/restricted/.test(await tab.textContent('#hs-composer-gate')));
  assert.strictEqual(await xss(tab), 0); errors.push(...tab.errors); await context.close();
  console.log('PASS  restricted member: notice with reason, cannot post');

  // 4. Member: post, comment, reply, report, follow; admin page closed
  ({ context, tab } = await open(browser, 'member', 'feed.html'));
  assert.ok(await tab.locator('#hs-composer').isHidden(), 'composer collapsed until asked for');
  await tab.click('#hs-composer-open');
  assert.ok(await tab.locator('#hs-composer').isVisible(), 'composer opens');
  assert.strictEqual(await tab.evaluate(() => document.activeElement.id), 'hs-post-title', 'focus moves to the title');
  assert.strictEqual(await tab.locator('.hs-subnav-admin').count(), 0, 'no admin link for members');
  await tab.setInputFiles('#hs-post-image', { name: 'evil.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload=alert(1)>') });
  await wait(200);
  assert.ok(/JPEG, PNG or WebP/.test(await tab.textContent('#hs-composer-status')), 'fake image refused before upload');
  await tab.fill('#hs-post-title', 'My first pixel tree ' + '<b>bold?</b>');
  await tab.fill('#hs-post-content', 'Built with a C3 Pixel Node.');
  await tab.selectOption('#hs-post-category', 'show-control');
  await tab.click('#hs-post-submit');
  await tab.waitForURL(/feed\.html\?post=/, { timeout: 5000 }); await wait(400);
  assert.ok((await tab.textContent('#hs-post-detail h1')).includes('<b>bold?</b>'), 'own post shown, markup as text');
  assert.ok(/Edit/.test(await text(tab, '#hs-post-detail .hs-link-button')), 'own post can be edited');
  await tab.fill('#hs-comment-text', 'First comment');
  await tab.click('#hs-comment-form button[type=submit]'); await wait(300);
  assert.ok((await tab.textContent('#hs-comment-list')).includes('First comment'));
  // reply on Alice's post to Bob's comment
  await tab.goto(base + 'feed.html?post=20000000-0000-4000-8000-0000000000a1', { waitUntil: 'load' }); await wait(400);
  assert.strictEqual(await tab.locator('#hs-comment-list img').count(), 0, 'hostile comment inert');
  await tab.click('.hs-comment .hs-link-button:text-is("Reply")');
  await tab.fill('.hs-reply-form textarea', 'Thanks Bob');
  await tab.click('.hs-reply-form button[type=submit]'); await wait(300);
  assert.ok((await tab.textContent('.hs-replies')).includes('Thanks Bob'), 'reply shown in the thread');
  // report Mallory's post with the keyboard
  await tab.goto(base + 'feed.html?post=20000000-0000-4000-8000-0000000000e1', { waitUntil: 'load' }); await wait(400);
  await tab.focus('#hs-post-detail .hs-report'); await tab.keyboard.press('Enter'); await wait(200);
  assert.ok(await tab.locator('dialog.hs-dialog').isVisible(), 'report dialog opens');
  assert.strictEqual(await tab.evaluate(() => document.activeElement.tagName), 'SELECT', 'focus moves into the dialog');
  await tab.keyboard.press('Escape'); await wait(200);
  assert.strictEqual(await tab.locator('dialog.hs-dialog').count(), 0, 'Escape closes it');
  assert.ok(await tab.evaluate(() => document.activeElement.classList.contains('hs-report')), 'focus returns to the Report button');
  await tab.click('#hs-post-detail .hs-report'); await wait(150);
  await tab.click('dialog .btn[type=submit]'); await wait(150);
  assert.ok(/Choose a reason/.test(await tab.textContent('dialog .hs-inline-status')), 'reason required');
  await tab.selectOption('dialog select', 'spam');
  await tab.fill('dialog textarea', 'Selling fog');
  await tab.click('dialog .btn[type=submit]'); await wait(1500);
  assert.ok((await calls(tab)).includes('report:post:20000000-0000-4000-8000-0000000000e1:spam:Selling fog'), 'report sent');
  // follow from the creator page
  await tab.goto(base + 'creator.html?u=alice', { waitUntil: 'load' }); await wait(500);
  assert.strictEqual(await tab.locator('#hs-public-creator-actions .btn:text-is("Follow")').count(), 0, 'no Follow button on your own profile');
  await tab.goto(base + 'creator.html?u=bob', { waitUntil: 'load' }); await wait(500);
  assert.ok(/followers/.test(await tab.textContent('.hs-creator-stats')), 'public stats shown');
  await tab.click('#hs-public-creator-actions .btn:text-is("Follow")'); await wait(200);
  assert.ok((await calls(tab)).includes('follow'));
  assert.ok(/Following/.test(await tab.textContent('#hs-public-creator-actions')));
  // hostile creator page
  await tab.goto(base + 'creator.html?u=mallory', { waitUntil: 'load' }); await wait(500);
  assert.strictEqual(await tab.locator('.hs-public-profile img').count(), 0, 'javascript: avatar URL not used');
  // admin closed for members, and no admin calls succeed
  await tab.goto(base + 'admin.html', { waitUntil: 'load' }); await wait(400);
  assert.ok(/only for the Showduino founder/.test(await tab.textContent('#hs-admin-gate')));
  assert.ok(await tab.locator('#hs-admin').isHidden());
  const forced = await tab.evaluate(async () => { try { await window.HauntSyncCommunity.admin.stats(); return 'allowed'; } catch (e) { return e.message; } });
  assert.ok(/Only the Showduino owner/.test(forced), 'calling admin functions from the console is refused');
  assert.strictEqual(await xss(tab), 0); errors.push(...tab.errors); await context.close();
  console.log('PASS  member: posts, comments, replies, keyboard-accessible report dialog, follow; fake image refused; admin closed');

  // 5. Owner
  ({ context, tab } = await open(browser, 'owner', 'feed.html'));
  assert.strictEqual(await tab.locator('.hs-subnav-admin').count(), 1, 'admin link for the owner');
  await tab.goto(base + 'feed.html?post=20000000-0000-4000-8000-0000000000e1', { waitUntil: 'load' }); await wait(400);
  assert.ok(/Founder:/.test(await tab.textContent('#hs-post-detail')), 'owner quick actions on posts');
  await tab.goto(base + 'admin.html', { waitUntil: 'load' }); await wait(600);
  assert.ok(await tab.locator('#hs-admin').isVisible());
  assert.ok(/Open reports/.test(await tab.textContent('#hs-stats')));
  await tab.click('[data-section="reports"]'); await wait(400);
  assert.ok((await tab.textContent('#hs-report-list')).includes('Advert <img'), 'report details as text');
  assert.strictEqual(await tab.locator('#hs-report-list img').count(), 0);
  await tab.click('#hs-report-list .btn:text-is("Hide")'); await wait(400);
  const c = await calls(tab);
  assert.ok(c.includes('admin.moderate:post:hide') && c.includes('admin.resolve:actioned'), 'hide + resolve from the report');
  await tab.click('[data-section="members"]'); await wait(400);
  const ownerRow = await tab.evaluate(() => [...document.querySelectorAll('#hs-member-table tbody tr')].find((r) => r.textContent.includes('Owner (protected)'))?.textContent || '');
  assert.ok(ownerRow.includes('Showduino Founder'), 'owner row protected');
  assert.strictEqual(await tab.evaluate(() => [...document.querySelectorAll('#hs-member-table tbody tr')].find((r) => r.textContent.includes('Owner (protected)')).querySelectorAll('button').length), 0, 'no suspend buttons on the owner row');
  await tab.click('#hs-member-table tbody tr:has-text("Alice") .btn:text-is("Restrict")'); await wait(300);
  assert.ok((await calls(tab)).includes('admin.setMemberStatus:restricted'));
  await tab.click('[data-section="log"]'); await wait(300);
  assert.ok((await tab.textContent('#hs-log-table')).includes('owner assigned'));
  await tab.click('[data-section="categories"]'); await wait(300);
  await tab.fill('#hs-cat-slug', 'props'); await tab.fill('#hs-cat-name', 'Props');
  await tab.click('#hs-category-form button[type=submit]'); await wait(300);
  assert.ok((await calls(tab)).includes('admin.saveCategory:props'));
  assert.strictEqual(await xss(tab), 0); errors.push(...tab.errors); await context.close();
  console.log('PASS  owner: admin link, post quick actions, dashboard (stats, report → hide + resolve, members with protected owner row, restrict, audit log, categories)');

  // 6. Phone layout
  ({ context, tab } = await open(browser, 'member', 'feed.html', { width: 390, height: 844 }));
  const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `no horizontal scroll on a phone (${overflow}px)`);
  const tabH = await tab.evaluate(() => Math.min(...[...document.querySelectorAll('.hs-subnav a, .hs-tab')].map((a) => a.getBoundingClientRect().height)));
  assert.ok(tabH >= 44, `touch targets at least 44px (${tabH})`);
  await tab.goto(base + 'admin.html', { waitUntil: 'load' }); await wait(300);
  await tab.goto(base + 'guidelines.html', { waitUntil: 'load' }); await wait(300);
  assert.ok(/not certified life-safety equipment/.test(await tab.textContent('main')), 'guidelines carry the safety statement');
  errors.push(...tab.errors); await context.close();
  console.log('PASS  phone: no horizontal scroll, 44px touch targets; guidelines include the life-safety statement');

  assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log('PASS  no page errors');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL ', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=hauntsync-community-ui::${String(e.message).replace(/\r?\n/g, ' ').slice(0, 900)}`); server.close(); process.exit(1); });
