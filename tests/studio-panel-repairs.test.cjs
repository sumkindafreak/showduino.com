// WEB-022/023: Settings and Projects must work when their panels are loaded
// dynamically. These tests use the actual browser script with a small DOM fake.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const saved = new Map();
const handlers = {};
const styleValues = new Map();
const loaded = [];
const autosaveIntervals = [];
const nodes = {
  'settings-theme': { value: 'darker' },
  'settings-snap': { value: '500' },
  'settings-autosave': { value: '10000' },
  'settings-showduino-target': { value: 'showduino.local' },
  'settings-showduino-target-status': { textContent: '', style: {} },
  'settings-save-status': { textContent: '', style: {} },
  'studio-local-projects': makeNode(),
  'studio-cloud-projects': makeNode()
};
function makeNode() {
  return {
    children: [], style: {}, className: '', dataset: {}, isConnected: true,
    replaceChildren(...items) { this.children = [...items]; },
    appendChild(item) { this.children.push(item); },
    append(...items) { this.children.push(...items); },
    prepend(item) { this.children.unshift(item); },
    setAttribute() {}
  };
}
const fakeStorage = {
  getItem: (key) => saved.has(key) ? saved.get(key) : null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: (key) => saved.delete(key),
  clear: () => saved.clear()
};
const document = {
  documentElement: { style: {
    setProperty: (key, value) => styleValues.set(key, value),
    removeProperty: (key) => styleValues.delete(key)
  }},
  addEventListener(type, fn) { handlers[type] = fn; },
  getElementById(id) { return nodes[id] || null; },
  querySelector(selector) { return selector === '.terminal-output' ? nodes.terminal : null; },
  createElement() { return makeNode(); }
};
const sandbox = {
  console,
  document,
  localStorage: fakeStorage,
  sessionStorage: fakeStorage,
  confirm: () => false,
  prompt: () => '',
  state: { logs: [{ message: 'old' }], project: { project: {} } },
  timelineEditor: { _snapMs: 1000 },
  api: { setBaseURL: (url) => { sandbox.lastURL = url; } },
  addEventListener(type, fn) { handlers['window:' + type] = fn; },
  ShowduinoDeploy: {
    getConfiguredTarget: () => sandbox.lastURL || '',
    setConfiguredTarget(value) {
      if (value === 'invalid???') throw Error('Invalid address');
      return 'http://' + value;
    },
    findLocalShowduino: async () => null
  },
  ShowduinoProjects: {
    configureAutosave: (ms) => autosaveIntervals.push(ms),
    listLocalProjects: () => [],
    cloudEnabled: () => false,
    getCurrentUser: () => null,
    loadLocalProject: (id) => { loaded.push(id); }
  },
  loadPanel: async (panel) => loaded.push(panel),
  location: { reload: () => { throw Error('No real page reload'); } }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/studio-panel-repairs.js', 'utf8'), sandbox, { filename: 'js/studio-panel-repairs.js' });

assert.equal(typeof sandbox._saveSettings, 'function', 'Settings click handler defined in external script');
assert.equal(typeof sandbox._testShowduinoTarget, 'function');
assert.equal(typeof sandbox._clearLogs, 'function');
assert.equal(typeof sandbox._clearAutosave, 'function');
assert.equal(typeof sandbox._clearAllData, 'function');
assert.equal(typeof sandbox.ShowduinoStudioPanels.projectsMarkup, 'function');
assert.match(sandbox.ShowduinoStudioPanels.projectsMarkup(), /studio-local-projects/);
assert.match(sandbox.ShowduinoStudioPanels.projectsMarkup(), /studio-cloud-projects/);

sandbox._saveSettings();
const settings = JSON.parse(saved.get('showduino_settings'));
assert.equal(settings.theme, 'darker');
assert.equal(settings.snap, 500);
assert.equal(settings.autosaveMs, 10000);
assert.equal(styleValues.get('--dark-bg'), '#101416');
assert.equal(sandbox.timelineEditor._snapMs, 500);
assert.equal(sandbox.lastURL, 'http://showduino.local');
assert.deepEqual(autosaveIntervals, [10000]);
assert.match(nodes['settings-save-status'].textContent, /saved/i);

sandbox._clearLogs();
assert.equal(sandbox.state.logs.length, 0);
saved.set('showduino_current_project', 'legacy only');
saved.set('showduino_project_keep', 'saved');
sandbox._clearAutosave();
assert.equal(saved.has('showduino_current_project'), false);
assert.equal(saved.get('showduino_project_keep'), 'saved', 'Clear Autosave must not erase real local shows');

sandbox.ShowduinoStudioPanels.activate('hauntsync');
assert.match(nodes['studio-local-projects'].children[0].textContent, /No saved local shows/);
assert.match(nodes['studio-cloud-projects'].children[0].textContent, /unavailable/);

(async () => {
  const button = makeNode();
  button.dataset.projectAction = 'open-local';
  button.dataset.projectId = 'local-test';
  button.closest = () => button;
  await handlers.click({ target: button });
  assert.deepEqual(loaded, ['local-test', 'timeline-editor']);
  assert.equal(button.disabled, false);
  console.log('Repaired Studio panels: settings save, clear controls, offline projects and open-local passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
