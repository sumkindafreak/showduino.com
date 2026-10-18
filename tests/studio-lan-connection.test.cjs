const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const stored = new Map();
const opened = [];
const values = {
  'studio-lan-address': { value: '192.168.1.50' },
  'studio-lan-status': { textContent: '', dataset: {} }
};
const handlers = {};
const ctx = {
  URL,
  console,
  window: {
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key)
    },
    open: (url, target) => { opened.push({ url, target }); return {}; }
  },
  document: {
    readyState: 'complete',
    getElementById: (id) => values[id] || null,
    querySelectorAll: () => [],
    addEventListener: (name, cb) => { handlers[name] = cb; }
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/studio-lan-connection.js', 'utf8'), ctx);
const lan = ctx.window.ShowduinoLanConnection;
assert.equal(lan.normaliseLocalTarget('192.168.1.50'), 'http://192.168.1.50');
assert.equal(lan.normaliseLocalTarget('showduino.local'), 'http://showduino.local');
assert.equal(lan.normaliseLocalTarget('10.0.0.7'), 'http://10.0.0.7');
assert.equal(lan.normaliseLocalTarget('172.31.10.2'), 'http://172.31.10.2');
for (const input of [
  'http://example.com', 'http://8.8.8.8', 'http://172.32.0.1',
  'http://192.168.1.50/unsafe/path', 'http://192.168.1.50/?x=1',
  'http://user:password@192.168.1.50', 'javascript:alert(1)',
  'http://192.168.1.50@evil.com', 'http://999.168.1.50'
]) assert.equal(lan.normaliseLocalTarget(input), '', 'Unsafe network target accepted: '+input);

const target = lan.saveTarget('192.168.1.50');
assert.equal(target, 'http://192.168.1.50');
assert.equal(lan.getSavedTarget(), target);
lan.openConsole(target);
assert.equal(opened[0].url, 'http://192.168.1.50/#/productions');

const show = { schema: 'showduino-production-v2', project: { name: 'The Chamber' } };
let exportCount = 0;
ctx.window.state = { project: show };
ctx.window.ShowduinoPackage = {
  toShdo: (project) => project,
  validateShdo: () => ({ valid: true })
};
ctx.window.ShowduinoProjects = { exportCurrentProject: () => { exportCount++; return show; } };
const handoff = lan.exportAndOpen();
assert.equal(handoff.exported, true);
assert.equal(handoff.consoleOpened, true);
assert.equal(exportCount, 1);
assert.equal(opened.length, 2);
assert.match(values['studio-lan-status'].textContent, /Persist SHDO v2/);

// The website only initiates a user-visible download/navigation; never an
// unconfirmed API POST or unsafe attempt to start a production.
assert.ok(!fs.readFileSync('js/studio-lan-connection.js', 'utf8').includes("fetch("));
assert.ok(!fs.readFileSync('js/studio-lan-connection.js', 'utf8').includes("SHOW:START"));
console.log('LAN setup and safe SHDO local-console handoff passed.');
