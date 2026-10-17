/* W001: text that comes from imported .shdo files or community templates (clip
 * labels, track and device names, node IDs, file names) must never be written into
 * the page as HTML. Static guard for the confirmed sink fixed in W001
 * (js/timeline-fx-daw.js clip title). The browser test in tests/browser/ exercises
 * every Studio panel with a hostile file. */
const fs = require('fs');
const assert = require('assert');
const files = ['js/timeline-fx-daw.js', 'js/timeline.js', 'js/timeline-professional-inspector.js',
  'js/studio-inspector-drawer.js', 'js/timeline-mixer.js', 'js/studio-mobile.js', 'js/studio-v4.js',
  'js/audio_browser.js', 'js/current-system-ui.js', 'js/panels.js', 'app.js'];
// Raw project, clip, track or device text interpolated into an HTML string.
const risky = /(innerHTML|insertAdjacentHTML).*(\$\{\s*|'\s*\+\s*)(p\.project|project|clip|clipData|track|device)\.(label|name|id|routing|params)\b/;
// Inline handlers built from IDs (W002): an ID must never be pasted into JavaScript source.
const inlineHandlerFromId = /on(click|change)="[^"]*\$\{\s*clipId\s*\}/;
const offenders = [];
for (const file of files) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (risky.test(line) || inlineHandlerFromId.test(line)) offenders.push(`${file}:${i + 1}`);
  });
}
assert.deepStrictEqual(offenders, [], 'imported text interpolated into HTML: ' + offenders.join(', '));
const daw = fs.readFileSync('js/timeline-fx-daw.js', 'utf8');
assert.ok(daw.includes("title.textContent = String(clip.label || clip.type || '')"), 'clip title rendered as text');
const timeline = fs.readFileSync('js/timeline.js', 'utf8');
assert.ok(timeline.includes("nameEl.textContent = String(p.project.name || 'Untitled Show')"), 'project browser renders names as text');
const projects = fs.readFileSync('js/studio-projects.js', 'utf8');
assert.ok(projects.includes('assertSafeIdentifiers(parsed'), 'import refuses unsafe identifiers');
console.log('Imported-text safety guard passed: no project/clip/track/device text interpolated into HTML and no ID-built inline handlers in ' + files.length + ' Studio files.');
