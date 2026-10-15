const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Load the real base manager and v4 registrations in Studio script order.
const context = vm.createContext({
  console,
  document: { addEventListener() {}, querySelector() { return null; } },
  localStorage: { getItem() { return null; } },
  setTimeout() {},
});
context.window = context;
context.addEventListener = () => {};
for (const path of ['js/panels.js', 'js/studio-v4.js']) {
  vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
}
const state = { user: { subscription: 'free' }, logs: [], devices: [] };
context.state = state;
context.panelManager = new context.PanelManager({}, state, () => {});
const messages = [];
context.log = (message, level) => messages.push({ message, level });
context.workspace = {
  innerHTML: '',
  replaceChildren() { this.innerHTML = ''; },
  append() { throw Error(messages.at(-1).message); },
};
context.document.createElement = () => ({ setAttribute() {}, addEventListener() {} });

// Exercise the production loader, including its sync/async dispatch and error path.
const app = fs.readFileSync('app.js', 'utf8');
const start = app.indexOf('  async function loadPanel(panelName) {');
const end = app.indexOf('\n  let timelineEditor = null;', start);
assert.ok(start >= 0 && end > start);
vm.runInContext(app.slice(start, end), context, { filename: 'app.js:loadPanel' });

(async () => {
  const studio = fs.readFileSync('studio.html', 'utf8');
  const panels = [...new Set([...studio.matchAll(/<li\b[^>]*data-panel="([^"]+)"/g)].map(m => m[1]))];
  assert.ok(panels.includes('help'));
  for (const panel of panels) {
    await context.loadPanel(panel);
    assert.match(context.workspace.innerHTML, /<div\b/, `${panel} should render HTML`);
    assert.equal(messages.at(-1).message, `Loaded panel: ${panel}`);
  }
  // Repeat after switching away: registration must stay callable.
  await context.loadPanel('help');
  assert.match(context.workspace.innerHTML, /STUDIO QUICK GUIDE/);
  assert.match(context.workspace.innerHTML, /<code>\.shdo<\/code>/);
  assert.match(context.workspace.innerHTML, /Emergency/);
  assert.ok(!messages.some(entry => entry.level === 'ERR'));
  console.log(`Studio panels: Help and all ${panels.length} sidebar render paths passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

