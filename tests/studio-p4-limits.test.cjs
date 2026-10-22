// W005 (W5-09): Studio's copy of the P4 SHDO compiler limits, checked against genuine
// website Studio exports (tests/fixtures/shdo). The firmware-side behaviour of the same
// files is tested in new_showduino tools/production-tests/test_shdo.cpp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const window = {};
vm.runInNewContext(fs.readFileSync('js/studio-p4-limits.js', 'utf8'), { window, TextEncoder });
const P4 = window.ShowduinoP4Limits;
const load = (f) => JSON.parse(fs.readFileSync('tests/fixtures/shdo/' + f, 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

// Constants must match new_showduino protocol/showduino_shdo.h and showduino_deploy.h.
assert.deepEqual({ ...P4.LIMITS }, { maxBytes: 49152, pixelClipsPerDevice: 16, maxDevices: 32, maxClips: 512, maxCompiledCues: 512 });
assert.equal(P4.FIELD.clipName, 63); assert.equal(P4.FIELD.projectName, 63); assert.equal(P4.FIELD.nodeId, 15); assert.equal(P4.FIELD.value, 79);

const mixed = load('website-studio-export.shdo');
const ok = P4.check(mixed);
assert.equal(ok.ok, true, ok.errors.join('; '));
assert.ok(ok.stats.bytes < 6000, 'compact size of the 4-cue show');
assert.deepEqual({ ...ok.stats.pixelsPerDevice }, { 'p4-show-pixels': 1, 'LED-01': 1 });

const slots = P4.check(load('website-17-pixel-clips.shdo'));
assert.equal(slots.ok, false);
assert.match(slots.errors.join(' '), /17 pixel cues target "p4-show-pixels"; the P4 supports at most 16/);

const cases = [
  ['show name of 64 bytes', (d) => { d.project.name = 'N'.repeat(64); }, /Show name is 64 bytes/],
  ['multi-byte show name over 63 bytes', (d) => { d.project.name = 'é'.repeat(32); }, /Show name is 64 bytes/],
  ['cue name of 64 bytes', (d) => { d.clips[0].name = 'C'.repeat(64); }, /name is 64 bytes/],
  ['cue label of 80 bytes', (d) => { d.clips[0].action.value = 'V'.repeat(80); }, /label is 80 bytes/],
  ['node ID of 16 characters', (d) => { d.devices.find((x) => x.id === 'LED-01').binding.nodeId = 'N'.repeat(16); }, /node ID is 16 bytes/],
  ['file over 48 KB', (d) => { d.project.description = ''; d.metadata = { notes: 'x'.repeat(50000) }; }, /the P4 accepts at most 48 KB/],
  ['33 devices', (d) => { for (let i = 0; i < 32; i++) d.devices.push({ id: 'dev-' + i, type: 'pixel-node', binding: {} }); }, /devices; the P4 accepts at most 32/],
  ['32-character field name', (d) => { d.metadata = { ['k'.repeat(32)]: 1 }; }, /Field names too long/]
];
for (const [label, mutate, pattern] of cases) {
  const doc = clone(mixed); mutate(doc);
  const r = P4.check(doc);
  assert.equal(r.ok, false, label);
  assert.match(r.errors.join(' '), pattern, label);
}
// Exactly at the limits is accepted.
const edge = clone(mixed); edge.project.name = 'N'.repeat(63); edge.clips[0].name = 'C'.repeat(63); edge.clips[0].action.value = 'V'.repeat(79);
assert.equal(P4.check(edge).ok, true, 'values exactly at the firmware limits are accepted');
console.log(`PASS: P4 limits (48 KB, 16 pixel cues per device, 32 devices, field lengths) on genuine Studio exports; ${cases.length} refusals.`);
