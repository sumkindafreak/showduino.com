/* W005 (W5-06): Studio buttons run through js/studio-actions.js instead of inline
 * handlers, so the enforced Content-Security-Policy can block inline script.
 *
 * Checks:
 *  1. No served page or script contains an inline event-handler attribute
 *     (onclick="…", oninput="…", onerror="…" and so on) or a javascript: URL.
 *  2. Every data-sd-click / data-sd-change / data-sd-input name used in markup is a
 *     registered action, so no button is silently dead.
 *  3. The dispatcher runs only registered names, passes data-sd-arg values as plain
 *     strings, ignores disabled controls, survives a throwing action, and cannot be
 *     re-pointed by a later register() call or reach Object.prototype names. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const RETIRED = /^(HauntSyncForum_Configured|preview|docs|tests|supabase|functions|node_modules|\.github|tools)(\/|$)/;

function files(dir = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (RETIRED.test(rel) || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) out.push(...files(rel));
    else if (/\.(html|js)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// 1. No inline handlers or javascript: URLs anywhere the site serves.
const served = files();
const inline = [];
for (const file of served) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const code = file === 'js/studio-actions.js' ? text.replace(/\/\*[\s\S]*?\*\//g, '') : text;
  for (const m of code.matchAll(/\son[a-z]{3,}\s*=\s*(["'`\\]|\$\{)/gi)) inline.push(`${file}: ${code.slice(m.index, m.index + 40).trim()}`);
  for (const m of code.matchAll(/(href|src|action)\s*=\s*["'`]\s*javascript:/gi)) inline.push(`${file}: ${code.slice(m.index, m.index + 40).trim()}`);
}
assert.deepStrictEqual(inline, [], 'inline event handlers or javascript: URLs are blocked by the enforced CSP');

// Load the dispatcher with a minimal document.
const listeners = {};
const warnings = [];
const errors = [];
const sandbox = {
  console: { warn: (...a) => warnings.push(a.join(' ')), error: (...a) => errors.push(a.join(' ')), log() {} },
  document: { addEventListener: (type, fn) => { listeners[type] = fn; }, querySelectorAll: () => [] }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/studio-actions.js'), 'utf8'), sandbox, { filename: 'js/studio-actions.js' });
const actions = sandbox.ShowduinoActions;
assert.ok(actions && typeof actions.register === 'function', 'ShowduinoActions is exposed');
for (const type of ['click', 'change', 'input']) assert.strictEqual(typeof listeners[type], 'function', `listens for ${type}`);

// 2. Every name used in markup is registered (app.js adds its own via register()).
const registeredByApp = new Set();
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
for (const block of app.matchAll(/ShowduinoActions\?*\.register\(\{([\s\S]*?)\}\);/g)) {
  for (const m of block[1].matchAll(/'([a-z0-9-]+)'\s*:/g)) registeredByApp.add(m[1]);
}
const used = new Map();
for (const file of served) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const m of text.matchAll(/data-sd-(click|change|input)="([^"$]+)"/g)) {
    if (!used.has(m[2])) used.set(m[2], new Set());
    used.get(m[2]).add(file);
  }
}
assert.ok(used.size >= 50, `expected the Studio panels to use the dispatcher (found ${used.size} names)`);
const unknown = [...used].filter(([name]) => !actions.has(name) && !registeredByApp.has(name)).map(([n, f]) => `${n} (${[...f].join(', ')})`);
assert.deepStrictEqual(unknown, [], 'markup uses action names that nothing registers');

// 3. Dispatcher behaviour.
function element(attrs, extra = {}) {
  const dataset = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'data-sd-arg') dataset.sdArg = v;
    if (k === 'data-sd-arg2') dataset.sdArg2 = v;
  }
  const el = { disabled: false, value: '', dataset, getAttribute: (n) => (n in attrs ? attrs[n] : null), ...extra };
  el.closest = (selector) => {
    const name = /^\[(data-sd-[a-z]+)\]$/.exec(selector)?.[1];
    return name && name in attrs ? el : null;
  };
  return el;
}
const fire = (type, target) => listeners[type]({ type, target });

const calls = [];
actions.register({ 'test-record': (arg, arg2, el) => calls.push({ arg, arg2, value: el.value }) });
const hostile = `"><img src=x onerror=alert(1)>'); window.pwned = 1; //`;
fire('click', element({ 'data-sd-click': 'test-record', 'data-sd-arg': hostile, 'data-sd-arg2': 'true' }));
assert.deepStrictEqual(calls.at(-1), { arg: hostile, arg2: 'true', value: '' }, 'arguments arrive as plain strings');
assert.strictEqual(sandbox.pwned, undefined, 'nothing in an argument is evaluated');

fire('change', element({ 'data-sd-change': 'test-record', 'data-sd-arg': 'clip-1' }, { value: 'New label' }));
assert.deepStrictEqual(calls.at(-1), { arg: 'clip-1', arg2: '', value: 'New label' }, 'change actions receive the control');

const before = calls.length;
fire('click', element({ 'data-sd-click': 'test-record' }, { disabled: true }));
assert.strictEqual(calls.length, before, 'a disabled control does nothing');
fire('click', element({ 'data-sd-change': 'test-record' }));
assert.strictEqual(calls.length, before, 'a click does not run a change action');

for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'window.alert(1)']) {
  warnings.length = 0;
  assert.doesNotThrow(() => fire('click', element({ 'data-sd-click': name })));
  assert.ok(/Unknown action/.test(warnings.join()), `"${name}" is refused as unknown`);
}

actions.register({ 'test-record': () => calls.push('hijacked') });
fire('click', element({ 'data-sd-click': 'test-record', 'data-sd-arg': 'x' }));
assert.notStrictEqual(calls.at(-1), 'hijacked', 'register() cannot replace an existing action');
assert.ok(Object.isFrozen(actions), 'ShowduinoActions cannot be replaced or extended by page script');

actions.register({ 'test-throw': () => { throw new Error('boom'); } });
errors.length = 0;
assert.doesNotThrow(() => fire('click', element({ 'data-sd-click': 'test-throw' })));
assert.ok(errors.some((e) => /boom/.test(e)), 'a failing action is logged, not thrown into the page');

console.log(`Studio actions: ${served.length} served files have no inline handlers; ${used.size} action names in markup are all registered; dispatcher checks pass.`);
