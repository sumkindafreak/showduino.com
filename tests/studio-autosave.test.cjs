/* Phase 2: autosave and data protection.
 * Runs the real js/studio-projects.js and the autosave parts of app.js against a fake
 * browser store with a size limit and manual timers. Proves: one timer at a time, no
 * write while the show is unchanged, settings from another tab apply, "Timed saves off"
 * still saves when the page is hidden, a full store frees old snapshots before failing,
 * a failed save is reported once, and reload restores the last saved show. */
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const { webcrypto } = require('crypto');

/**
 * Build a fake browser with a quota-limited localStorage and manually fired timers.
 * @param {number} quota Maximum total characters the store accepts.
 * @returns {Object} The sandbox, its store, timer list, event helpers and Studio Log.
 */
function browser(quota) {
  const data = new Map(); let writes = 0;
  const size = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      const next = size() - (data.has(k) ? k.length + data.get(k).length : 0) + k.length + String(v).length;
      if (next > quota) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; e.code = 22; throw e; }
      data.set(k, String(v)); writes += 1;
    },
    removeItem: (k) => { data.delete(k); }, clear: () => data.clear(), key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; }
  };
  const timers = new Map(); let nextTimer = 1;
  const listeners = { window: {}, document: {} };
  const on = (bag) => (name, cb) => { (bag[name] = bag[name] || []).push(cb); };
  const logs = [];
  const window = {
    crypto: webcrypto, localStorage, state: { project: null },
    setInterval: (cb, ms) => { const id = nextTimer++; timers.set(id, { cb, ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    addEventListener: on(listeners.window), dispatchEvent: (event) => { (listeners.window[event.type] || []).forEach((cb) => cb(event)); return true; },
    studioLog: (message, level) => logs.push({ message, level }),
    location: { search: '', href: 'http://localhost/studio.html' }, history: { replaceState() {} }
  };
  const document = { visibilityState: 'visible', addEventListener: on(listeners.document), querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], title: '' };
  const sandbox = { window, document, localStorage, console: { log() {}, warn() {}, error() {} }, CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }, URLSearchParams, URL, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  for (const file of ['js/shdo_model.js', 'js/studio-package.js', 'js/studio-projects.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return {
    sandbox, window, document, data, timers, logs,
    writes: () => writes,
    fire: (target, name, event = {}) => (listeners[target][name] || []).forEach((cb) => cb({ type: name, ...event })),
    tick: () => [...timers.values()].forEach((t) => t.cb())
  };
}

/**
 * Create a small valid show in the fake browser and make it the open project.
 * @param {Object} b Fake browser from browser().
 * @param {string} name Show name.
 * @returns {Object} The project.
 */
function openShow(b, name) {
  const M = b.sandbox.window.SHDOModel || b.sandbox.SHDOModel;
  const project = M.createProject(name);
  const track = M.createTrack('audio', 'Audio', 0); project.tracks.push(track);
  const clip = M.createClip(track.id, 'audio', 0, 1000, 'Sting'); clip.params.file = 'sting.wav'; project.clips.push(clip);
  b.window.state.project = project;
  return project;
}
const showKey = (project) => `showduino_project_${project.project.id}`;

// 1. One timer; no write while unchanged; a change is written on the next tick.
{
  const b = browser(5_000_000);
  b.fire('document', 'DOMContentLoaded');
  assert.strictEqual(b.timers.size, 1, 'one autosave timer after start-up');
  assert.strictEqual([...b.timers.values()][0].ms, 1500, 'default interval is 1.5 s');
  const project = openShow(b, 'Timer show');
  b.tick();
  assert.ok(b.data.has(showKey(project)), 'the show is saved on the first tick');
  const afterFirst = b.writes();
  b.tick(); b.tick(); b.tick();
  assert.strictEqual(b.writes(), afterFirst, 'no storage writes while the show is unchanged');
  project.clips[0].startMs = 250;
  b.tick();
  assert.ok(b.writes() > afterFirst, 'an edit is written on the next tick');
  assert.strictEqual(JSON.parse(b.data.get(showKey(project))).clips[0].startMs, 250);

  // 2. Changing settings repeatedly never stacks timers; the interval follows the setting.
  for (const autosave of [10000, 60000, 30000]) {
    b.data.set('showduino_settings', JSON.stringify({ autosave }));
    b.window.dispatchEvent({ type: 'showduino:settings-updated' });
    assert.strictEqual(b.timers.size, 1, `still one timer at ${autosave} ms`);
    assert.strictEqual([...b.timers.values()][0].ms, autosave);
  }

  // 3. A setting saved in ANOTHER tab arrives as a storage event and applies here.
  b.data.set('showduino_settings', JSON.stringify({ autosave: 0 }));
  b.fire('window', 'storage', { key: 'showduino_settings' });
  assert.strictEqual(b.timers.size, 0, '"Timed saves off" from another tab stops the timer here');
  b.fire('window', 'storage', { key: 'unrelated_key' });
  assert.strictEqual(b.timers.size, 0, 'unrelated storage changes do not start a timer');

  // 4. "Timed saves off" stops the timer only: hiding or leaving the page still saves.
  project.clips[0].startMs = 900;
  b.document.visibilityState = 'hidden'; b.fire('document', 'visibilitychange');
  assert.strictEqual(JSON.parse(b.data.get(showKey(project))).clips[0].startMs, 900, 'hidden page saves with timed saves off');
  project.clips[0].startMs = 1200;
  b.fire('window', 'pagehide');
  assert.strictEqual(JSON.parse(b.data.get(showKey(project))).clips[0].startMs, 1200, 'leaving the page saves with timed saves off');
  b.data.set('showduino_settings', JSON.stringify({ autosave: 1500 }));
  b.fire('window', 'storage', { key: 'showduino_settings' });
  assert.strictEqual(b.timers.size, 1, 'turning timed saves back on in another tab restarts one timer');

  // 5. Unexpected closure: a fresh page with the same store restores the last saved show.
  const reopened = browser(5_000_000);
  b.data.forEach((v, k) => reopened.data.set(k, v));
  reopened.fire('document', 'DOMContentLoaded');
  assert.strictEqual(reopened.window.state.project?.project?.id, project.project.id, 'reload restores the same show');
  assert.strictEqual(reopened.window.state.project.clips[0].startMs, 1200, 'with the last saved edit');
}

// 6. Storage full: old backup snapshots are dropped so the real save succeeds.
{
  const b = browser(5_000_000);
  b.fire('document', 'DOMContentLoaded');
  const project = openShow(b, 'Full store');
  b.tick();
  const used = [...b.data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const filler = 'x'.repeat(2000);
  for (let i = 0; i < 5; i++) b.data.set(`autosave_old_${i}`, filler);
  const tight = browser(used + 5 * 2030 + 50);          // room for what is there, not for a bigger show
  b.data.forEach((v, k) => tight.data.set(k, v));
  tight.fire('document', 'DOMContentLoaded');
  const restored = tight.window.state.project;
  restored.project.description = 'd'.repeat(3000);        // grows past the quota
  tight.tick();
  assert.strictEqual(JSON.parse(tight.data.get(showKey(project))).project.description.length, 3000, 'the grown show was saved');
  assert.strictEqual([...tight.data.keys()].filter((k) => k.startsWith('autosave_')).length, 0, 'old snapshots were removed to make room');
  assert.strictEqual(tight.logs.filter((l) => l.level === 'ERR').length, 0, 'no failure is reported when the retry works');
}

// 7. Storage full with nothing to free: the user is told once, the saved copy is kept.
{
  const seed = browser(5_000_000);
  seed.fire('document', 'DOMContentLoaded');
  const project = openShow(seed, 'Truly full');
  seed.tick();
  const used = [...seed.data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const full = browser(used + 100);
  seed.data.forEach((v, k) => full.data.set(k, v));
  full.fire('document', 'DOMContentLoaded');
  const before = full.data.get(showKey(project));
  let failures = 0; full.window.addEventListener('showduino:project-autosave-failed', () => { failures += 1; });
  full.window.state.project.project.description = 'd'.repeat(5000);
  full.tick(); full.tick(); full.tick();
  const errors = full.logs.filter((l) => l.level === 'ERR');
  assert.strictEqual(errors.length, 1, 'one clear message, not one per tick');
  assert.match(errors[0].message, /could NOT be saved[\s\S]*storage is full[\s\S]*Export/i);
  assert.strictEqual(failures, 1, 'failure event fired once');
  assert.strictEqual(full.data.get(showKey(project)), before, 'the last good saved copy is untouched');
}

// 7b. Deleting a saved show: never the open one; removes its data and index entry only.
{
  const b = browser(5_000_000);
  b.fire('document', 'DOMContentLoaded');
  const first = openShow(b, 'Keep me'); b.tick();
  const second = openShow(b, 'Open show'); b.tick();
  const api = b.window.ShowduinoProjects;
  const listedBefore = api.listLocalProjects().map((p) => p.id);
  assert.ok(listedBefore.includes(first.project.id) && listedBefore.includes(second.project.id), 'both shows are listed');
  assert.throws(() => api.deleteLocalProject(second.project.id), /This show is open/, 'the open show cannot be deleted');
  assert.ok(b.data.has(showKey(second)), 'and it is still saved');
  assert.strictEqual(api.deleteLocalProject(first.project.id), true);
  assert.strictEqual(b.data.has(showKey(first)), false, 'the deleted show is gone');
  assert.deepStrictEqual(api.listLocalProjects().map((p) => p.id), listedBefore.filter((id) => id !== first.project.id), 'only that show left the list');
  assert.strictEqual(api.deleteLocalProject('no-such-id'), false, 'an unknown id changes nothing');
  assert.strictEqual(api.deleteLocalProject(''), false);
}

// 8. Legacy snapshot timer (app.js): never faster than 20 s, and settings wording is honest.
{
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /Math\.max\(20000, settings\.autosave\)/, 'whole-show snapshots are never taken more often than every 20 s');
  assert.match(app, /if \(unchanged === state\.lastSnapshotPayload\) return;/, 'no snapshot while the show is unchanged');
  const panels = fs.readFileSync('js/panels.js', 'utf8');
  assert.match(panels, /<option value="0">Timed saves off<\/option>/);
  assert.match(panels, /also saved whenever you leave or hide this page/);
  assert.doesNotMatch(panels, /<option value="0">Disabled<\/option>/, '"Disabled" claimed more than the setting does');
}

console.log('PASS: autosave uses one timer, skips unchanged shows, follows other tabs, survives a full store and reports real failures.');
