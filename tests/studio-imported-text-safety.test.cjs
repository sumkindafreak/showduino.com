/* W001: text that comes from imported .shdo files or community templates (clip
 * labels, track and device names, node IDs, file names) must never be written into
 * the page as HTML. Static guard for the confirmed sink fixed in W001
 * (js/timeline-fx-daw.js clip title). The browser test in tests/browser/ exercises
 * every Studio panel with a hostile file. */
const fs = require('fs');
const assert = require('assert');
const files = ['js/timeline-fx-daw.js', 'js/timeline.js', 'js/timeline-professional-inspector.js',
  'js/studio-inspector-drawer.js', 'js/timeline-mixer.js', 'js/studio-mobile.js', 'js/studio-v4.js'];
const risky = /(innerHTML|insertAdjacentHTML)[^;]*\$\{\s*(clip|track|device)\.(label|name|routing|params)/;
const offenders = [];
for (const file of files) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (risky.test(line)) offenders.push(`${file}:${i + 1}`);
  });
}
assert.deepStrictEqual(offenders, [], 'imported text interpolated into HTML: ' + offenders.join(', '));
const daw = fs.readFileSync('js/timeline-fx-daw.js', 'utf8');
assert.ok(daw.includes("title.textContent = String(clip.label || clip.type || '')"), 'clip title rendered as text');
console.log('Imported-text safety guard passed: no clip/track/device text interpolated into innerHTML in ' + files.length + ' Studio files.');
