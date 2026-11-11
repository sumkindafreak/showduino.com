/* Phase 3: two tabs of one browser must not silently overwrite or resurrect each other's shows.
 * Runs the real js/studio-projects.js twice against ONE shared fake localStorage, with a
 * separate sessionStorage, state and confirm() per "tab", and delivers storage events to
 * the other tab the way a browser does.
 *
 * This covers tabs of the same browser on the same device only. Two devices saving the
 * same cloud show are NOT covered by anything here. */
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const { webcrypto } = require('crypto');

/**
 * A shared browser store plus a factory for tabs that use it.
 * @param {number} [quota] Maximum total characters the store accepts.
 * @returns {{data: Map, openTab: Function}}
 */
function browser(quota = 5_000_000) {
  const data = new Map(); const tabs = [];
  const size = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  /**
   * Open a tab running the project manager.
   * @param {Object} [session] Existing sessionStorage contents (a reload keeps them).
   * @returns {Object} Tab handle.
   */
  function openTab(session = new Map()) {
    const tab = { logs: [], confirms: [], answers: [], events: [], listeners: { window: {}, document: {} }, session, timers: new Map() };
    const deliver = (key) => tabs.filter((t) => t !== tab && !t.closed).forEach((t) => (t.listeners.window.storage || []).forEach((cb) => cb({ type: 'storage', key })));
    const localStorage = {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem(k, v) {
        if (tab.failWrites) { const e = new Error('Write failed'); e.name = 'UnknownError'; throw e; }
        const next = size() - (data.has(k) ? k.length + data.get(k).length : 0) + k.length + String(v).length;
        if (next > quota) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; e.code = 22; throw e; }
        const changed = data.get(k) !== String(v); data.set(k, String(v)); if (changed) deliver(k);
      },
      removeItem: (k) => { if (data.delete(k)) deliver(k); }, clear: () => data.clear(), key: (i) => [...data.keys()][i] ?? null,
      get length() { return data.size; }
    };
    const sessionStorage = { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) };
    const on = (bag) => (name, cb) => { (bag[name] = bag[name] || []).push(cb); };
    let nextTimer = 1;
    const window = {
      crypto: webcrypto, localStorage, sessionStorage, state: { project: null },
      setInterval: (cb, ms) => { const id = nextTimer++; tab.timers.set(id, { cb, ms }); return id; }, clearInterval: (id) => tab.timers.delete(id),
      addEventListener: on(tab.listeners.window),
      dispatchEvent: (event) => { tab.events.push(event.type); (tab.listeners.window[event.type] || []).forEach((cb) => cb(event)); return true; },
      studioLog: (message, level) => tab.logs.push({ message, level }),
      confirm: (message) => { tab.confirms.push(message); assert.ok(tab.answers.length, 'unexpected confirm: ' + message); return tab.answers.shift(); },
      location: { search: '', href: 'http://localhost/studio.html' }, history: { replaceState() {} }
    };
    const document = { visibilityState: 'visible', addEventListener: on(tab.listeners.document), querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], title: '' };
    const sandbox = { window, document, localStorage, sessionStorage, console: { log() {}, warn() {}, error() {} }, CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }, URLSearchParams, URL, setTimeout, clearTimeout };
    vm.createContext(sandbox);
    for (const file of ['js/shdo_model.js', 'js/studio-package.js', 'js/studio-projects.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    Object.assign(tab, { window, document, api: null, M: sandbox.SHDOModel || window.SHDOModel });
    tabs.push(tab);
    (tab.listeners.document.DOMContentLoaded || []).forEach((cb) => cb({ type: 'DOMContentLoaded' }));
    tab.api = window.ShowduinoProjects;
    tab.tick = () => [...tab.timers.values()].forEach((t) => t.cb());
    tab.project = () => window.state.project;
    tab.warnings = () => tab.logs.filter((l) => l.level === 'WARN').map((l) => l.message);
    tab.close = () => { tab.closed = true; };
    return tab;
  }
  return { data, openTab };
}
const key = (id) => `showduino_project_${id}`;
const stored = (b, id) => JSON.parse(b.data.get(key(id)) || 'null');
/** Give the open show of a tab one audio cue so edits are easy to see. */
function addCue(tab, label) {
  const p = tab.project(); let track = p.tracks[0];
  if (!track) { track = tab.M.createTrack('audio', 'Audio', 0); p.tracks.push(track); }
  const clip = tab.M.createClip(track.id, 'audio', p.clips.length * 1000, 500, label); clip.params.file = 'a.wav'; p.clips.push(clip);
}
const labels = (project) => Array.from(project.clips, (c) => String(c.name || c.label));

(async () => {
  // 1. Two tabs, same show: the stale tab does not overwrite, is told once, and can keep both.
  {
    const b = browser(); const one = b.openTab(); const id = one.project().project.id;
    one.project().project.name = 'Shared show'; addCue(one, 'From tab one'); one.tick();
    const two = b.openTab();
    assert.strictEqual(two.project().project.id, id, 'the second tab opens the same show');
    addCue(one, 'Tab one again'); one.tick();
    assert.deepStrictEqual(labels(stored(b, id)), ['From tab one', 'Tab one again']);
    assert.strictEqual(two.warnings().filter((w) => /changed in another tab/.test(w)).length, 1, 'the other tab is told as soon as the save lands');
    assert.strictEqual(JSON.stringify(two.api.getSaveConflict()), JSON.stringify({ type: 'changed', id }));

    addCue(two, 'From tab two'); two.tick(); two.tick();
    two.document.visibilityState = 'hidden'; (two.listeners.document.visibilitychange || []).forEach((cb) => cb({})); (two.listeners.window.pagehide || []).forEach((cb) => cb({}));
    assert.deepStrictEqual(labels(stored(b, id)), ['From tab one', 'Tab one again'], 'neither the timer nor leaving the page overwrites the newer version');
    assert.strictEqual(two.warnings().filter((w) => /changed in another tab/.test(w)).length, 1, 'the warning is not repeated on every tick');
    assert.ok(two.events.includes('showduino:project-save-conflict'));
    assert.deepStrictEqual(labels(two.project()), ['From tab one', 'From tab two'], 'the stale tab keeps its unsaved work in memory');

    // Declining both questions saves nothing and loses nothing.
    two.answers = [false, false];
    await assert.rejects(two.api.saveCurrentProject(), /Not saved\. Your changes are still open/);
    assert.strictEqual(two.confirms.length, 2);
    assert.match(two.confirms[0], /changed in another tab[\s\S]*keep both/i);
    assert.match(two.confirms[1], /Replace the newer version[\s\S]*will be lost/i);
    assert.deepStrictEqual(labels(stored(b, id)), ['From tab one', 'Tab one again']);

    // Keep both: this tab's version becomes a new show; the other is untouched.
    two.answers = [true];
    await two.api.saveCurrentProject();
    const copyId = two.project().project.id;
    assert.notStrictEqual(copyId, id);
    assert.match(two.project().project.name, /Shared show/);
    assert.notStrictEqual(two.project().project.name, 'Shared show');
    assert.deepStrictEqual(labels(stored(b, copyId)), ['From tab one', 'From tab two']);
    assert.deepStrictEqual(labels(stored(b, id)), ['From tab one', 'Tab one again'], 'the original is unchanged');
    assert.strictEqual(two.api.getSaveConflict(), null);
    addCue(two, 'More in the copy'); two.tick();
    assert.strictEqual(stored(b, copyId).clips.length, 3, 'the copy autosaves normally afterwards');
    assert.strictEqual(one.warnings().filter((w) => /another tab/.test(w)).length, 0, 'the first tab never saw a conflict');
    addCue(one, 'Tab one continues'); one.tick();
    assert.strictEqual(stored(b, id).clips.length, 3, 'and keeps saving its own show');
  }

  // 2. Explicit overwrite needs the second, plainly worded confirmation.
  {
    const b = browser(); const one = b.openTab(); const id = one.project().project.id; addCue(one, 'A'); one.tick();
    const two = b.openTab(); addCue(one, 'B'); one.tick(); addCue(two, 'Mine');
    two.answers = [false, true];
    await two.api.saveCurrentProject();
    assert.deepStrictEqual(labels(stored(b, id)), ['A', 'Mine'], 'the user chose to replace');
    assert.strictEqual(two.project().project.id, id);
    // Now tab one is the stale one and is protected in turn.
    addCue(one, 'C'); one.tick();
    assert.deepStrictEqual(labels(stored(b, id)), ['A', 'Mine']);
    assert.strictEqual(one.warnings().filter((w) => /changed in another tab/.test(w)).length, 1);
  }

  // 3. Two tabs, different shows: no conflict, and each tab reopens its own show on reload.
  {
    const b = browser(); const one = b.openTab(); const idOne = one.project().project.id; addCue(one, 'One'); one.tick();
    const two = b.openTab(); const fresh = two.M.createProject('Second show'); two.window.state.project = fresh; addCue(two, 'Two'); two.tick();
    const idTwo = fresh.project.id;
    addCue(one, 'One more'); one.tick(); addCue(two, 'Two more'); two.tick();
    assert.strictEqual(stored(b, idOne).clips.length, 2); assert.strictEqual(stored(b, idTwo).clips.length, 2);
    assert.strictEqual(one.warnings().length + two.warnings().length, 0, 'no warnings when the tabs edit different shows');
    one.close(); const reloadedOne = b.openTab(one.session);
    assert.strictEqual(reloadedOne.project().project.id, idOne, 'a reloaded tab reopens its own show, not the other tab\'s');
    const brandNew = b.openTab();
    assert.strictEqual(brandNew.project().project.id, idOne, 'a new tab opens the show most recently opened in any tab');
  }

  // 4. A show deleted in another tab is not brought back by autosave.
  {
    const b = browser(); const one = b.openTab(); const id = one.project().project.id; one.project().project.name = 'Doomed'; addCue(one, 'A'); one.tick();
    const two = b.openTab(); const other = two.M.createProject('Other'); two.window.state.project = other; two.tick();
    assert.strictEqual(two.api.deleteLocalProject(id), true);
    assert.strictEqual(b.data.has(key(id)), false);
    assert.strictEqual(one.warnings().filter((w) => /deleted in another tab/.test(w)).length, 1, 'the tab that has it open is told');
    addCue(one, 'B'); one.tick(); (one.listeners.window.pagehide || []).forEach((cb) => cb({}));
    assert.strictEqual(b.data.has(key(id)), false, 'autosave and page-leave do not resurrect it');
    assert.strictEqual(two.api.listLocalProjects().some((p) => p.id === id), false);
    assert.strictEqual(one.project().clips.length, 2, 'the open copy and its unsaved work are still in the tab');
    one.answers = [false];
    await assert.rejects(one.api.saveCurrentProject(), /Not saved/);
    assert.strictEqual(b.data.has(key(id)), false);
    one.answers = [true];
    await one.api.saveCurrentProject();
    assert.strictEqual(stored(b, id).clips.length, 2, 'the user chose to keep it');
    assert.match(one.confirms[0], /"Doomed" was deleted in another tab/);
    addCue(one, 'C'); one.tick();
    assert.strictEqual(stored(b, id).clips.length, 3, 'normal saving resumes');
    assert.throws(() => one.api.deleteLocalProject(id), /This show is open/, 'the open show cannot be deleted from its own tab');
  }

  // 5. Deleting a show nobody has open, then importing or recreating it, is not blocked.
  {
    const b = browser(); const one = b.openTab(); const first = one.project(); addCue(one, 'A'); one.tick();
    const second = one.M.createProject('Second'); one.window.state.project = second; one.tick();
    one.api.deleteLocalProject(first.project.id);
    one.api.loadLocalProject(second.project.id); addCue(one, 'B'); one.tick();
    assert.strictEqual(stored(b, second.project.id).clips.length, 1);
    assert.strictEqual(one.warnings().length, 0, 'single-tab use shows no conflict messages');
  }

  // 6. Shows saved before revisions existed open and save without any prompt.
  {
    const b = browser(); const seed = b.openTab(); const legacy = seed.M.createProject('Old show'); const id = legacy.project.id;
    b.data.clear();
    b.data.set(key(id), JSON.stringify(legacy));
    b.data.set('showduino_local_projects', JSON.stringify([{ id, name: 'Old show', updatedAt: legacy.project.updatedAt }]));
    b.data.set('showduino_active_project_id', id);
    const tab = b.openTab();
    assert.strictEqual(tab.project().project.id, id, 'an old show with no revision record opens');
    addCue(tab, 'New cue'); tab.tick();
    assert.strictEqual(stored(b, id).clips.length, 1);
    await tab.api.saveCurrentProject({ cloud: false });
    assert.strictEqual(tab.confirms.length, 0); assert.strictEqual(tab.warnings().length, 0);
    assert.ok(!('revision' in stored(b, id).project) && !('rev' in stored(b, id)), 'nothing is added to the stored show itself');
    const exported = tab.window.ShowduinoPackage.toShdo(tab.project());
    assert.ok(!JSON.stringify(exported).includes('showduino_rev_'), 'nothing is added to exported files');
  }

  // 7. A failed or interrupted write is reported, keeps the last good copy, and recovers.
  {
    const b = browser(); const tab = b.openTab(); const id = tab.project().project.id; addCue(tab, 'A'); tab.tick();
    const good = b.data.get(key(id));
    tab.failWrites = true; addCue(tab, 'B'); tab.tick(); tab.tick();
    assert.strictEqual(b.data.get(key(id)), good, 'the last good copy is untouched');
    assert.strictEqual(tab.logs.filter((l) => l.level === 'ERR').length, 1, 'the failure is shown once');
    await assert.rejects(tab.api.saveCurrentProject({ cloud: false }), /Write failed/, 'a manual save reports the failure to its caller');
    tab.failWrites = false; tab.tick();
    assert.strictEqual(stored(b, id).clips.length, 2, 'the next tick saves once writing works again');
    assert.strictEqual(tab.api.getSaveConflict(), null, 'a failed write is not mistaken for a conflict');
    const reloaded = b.openTab(tab.session);
    assert.strictEqual(reloaded.project().clips.length, 2, 'a reload restores the last saved edit');
  }

  // 8. Timed saves off: the conflict protection still applies to leaving the page and manual save.
  {
    const b = browser(); b.data.set('showduino_settings', JSON.stringify({ autosave: 0 }));
    const one = b.openTab(); const id = one.project().project.id; assert.strictEqual(one.timers.size, 0);
    addCue(one, 'A'); await one.api.saveCurrentProject({ cloud: false });
    const two = b.openTab(); addCue(one, 'B'); await one.api.saveCurrentProject({ cloud: false });
    addCue(two, 'Mine'); (two.listeners.window.pagehide || []).forEach((cb) => cb({}));
    assert.deepStrictEqual(labels(stored(b, id)), ['A', 'B'], 'page-leave does not overwrite with timed saves off');
  }

  // 9. The editor's own Save button goes through the manager, and its start-up no longer
  //    swaps the open show for the shared backup copy or re-binds keys and timers.
  {
    const timeline = fs.readFileSync('js/timeline.js', 'utf8');
    const save = /_saveToLocalStorage\(\) \{[\s\S]*?\n  \}/.exec(timeline)[0];
    assert.match(save, /manager\.saveCurrentProject\(\{ cloud: false \}\)/);
    assert.ok(save.indexOf('manager.saveCurrentProject') < save.indexOf('localStorage.setItem'), 'the direct write is only the fallback');
    const start = /_startAutosave\(\) \{[\s\S]*?\n  \}/.exec(timeline)[0];
    assert.match(start, /if \(!window\.ShowduinoProjects\) \{[\s\S]*showduino_current_project/, 'the backup copy is restored only without the project manager');
    assert.match(start, /if \(this\._autosaveTimer\) return;/);
    assert.match(timeline, /if \(this\._globalKeysBound\) return;/);
  }

  console.log('PASS: same-browser tabs cannot silently overwrite or resurrect each other\'s shows; failures are reported; old shows are unaffected.');
})().catch((error) => { console.error(error); process.exit(1); });
