/* W005 (W5-03, W5-09): Studio's P4 limit checker against verdicts from the real firmware.
 *
 * Every case below was exported with Studio's own packager and compiled on a host with
 * sumkindafreak/new_showduino protocol/showduino_shdo.h (firmware PRs #35 + #36, commit
 * e4df5e0) and the 48 KB Persist to SD limit in protocol/showduino_deploy.h. `firmware`
 * is the status shdoCompile() returned. The checker must refuse exactly what the P4
 * refuses and accept what it accepts. Re-run the cross-check when those headers change. */
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { webcrypto } = require('crypto');
global.window = global; global.crypto = webcrypto;
global.document = { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement() { return {}; }, body: { appendChild() {} } };
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
for (const f of ['js/shdo_model.js', 'js/studio-package.js', 'js/studio-firmware-limits.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });

function show(spec) {
  const p = SHDOModel.createProject(spec.name || 'Boundary show');
  p.assets = {}; p.scenes = []; p.globalSettings = {}; p.metadata = {};
  const px = SHDOModel.createTrack('pixel', 'P4 pixels', 0); const au = SHDOModel.createTrack('audio', 'Audio', 1); const pn = SHDOModel.createTrack('pixel', 'Node pixels', 2);
  p.tracks.push(px, au, pn);
  for (let i = 0; i < (spec.pixel ?? 1); i++) {
    const c = SHDOModel.createClip(px.id, 'pixel', i * 1000, 800, spec.label || `Flash ${i}`); c.routing.nodeId = 'p4-local';
    Object.assign(c.params, { startPixel: 0, length: 30, effect: 'LIGHTNING', r: 255, g: 255, b: 255 }, spec.pixelParams || {}); p.clips.push(c);
  }
  for (let i = 0; i < (spec.nodePixel ?? 0); i++) {
    const c = SHDOModel.createClip(pn.id, 'pixel', i * 1000, 800, `Node ${i}`); c.routing.nodeId = spec.nodeId || 'LED-01';
    Object.assign(c.params, { startPixel: 0, length: 10, effect: 'FIRE' }); p.clips.push(c);
  }
  for (let i = 0; i < (spec.audio ?? 1); i++) {
    const c = SHDOModel.createClip(au.id, 'audio', i * 1000 + 500, 900, spec.label || `Sting ${i}`); c.routing.nodeId = 'audio-node';
    Object.assign(c.params, { file: spec.file || `sting${i % 9}.wav`, volume: 80 }); p.clips.push(c);
  }
  return ShowduinoPackage.toShdo(p);
}

// [spec, firmware status, fits 48 KB as exported]
const CASES = {
  baseline: [{}, 'OK', true],
  'name-63': [{ name: 'N'.repeat(63) }, 'OK', true],
  'name-64': [{ name: 'N'.repeat(64) }, 'MISSING_FIELD', true],
  'name-euro-21': [{ name: '€'.repeat(21) }, 'OK', true],
  'name-euro-22': [{ name: '€'.repeat(22) }, 'MISSING_FIELD', true],
  'label-63': [{ label: 'L'.repeat(63) }, 'OK', true],
  'label-64': [{ label: 'L'.repeat(64) }, 'INVALID_JSON', true],
  'label-emoji': [{ label: '🎃 Jump scare «wow»' }, 'OK', true],
  'label-backspace': [{ label: 'bad\bname' }, 'INVALID_JSON', true],
  'label-lone-surrogate': [{ label: 'bad\ud800name' }, 'INVALID_JSON', true],
  'file-47': [{ file: 'a'.repeat(43) + '.wav', pixel: 0 }, 'OK', true],
  'file-48': [{ file: 'a'.repeat(44) + '.wav', pixel: 0 }, 'COMMAND_TOO_LONG', true],
  'pixel-16': [{ pixel: 16, audio: 0 }, 'OK', true],
  'pixel-17': [{ pixel: 17, audio: 0 }, 'TOO_MANY_CUES', true],
  'node-pixel-16-plus-p4-16': [{ pixel: 16, nodePixel: 16, audio: 0 }, 'OK', true],
  'node-id-12': [{ nodePixel: 1, nodeId: 'LED-12345678' }, 'OK', true],
  'node-id-13': [{ nodePixel: 1, nodeId: 'LED-123456789' }, 'UNSUPPORTED_DEVICE', true],
  'fractional-speed': [{ pixelParams: { speed: 50.5 } }, 'INVALID_JSON', true],
  'negative-brightness': [{ pixelParams: { brightness: -1 } }, 'INVALID_JSON', true],
  'string-reverse': [{ pixelParams: { reverse: 'yes' } }, 'INVALID_JSON', true],
  'audio-60': [{ pixel: 0, audio: 60 }, 'OK', true],          // 57 KB spaced, 38 KB compact
  'audio-100': [{ pixel: 0, audio: 100 }, 'OK', false],       // compiles, but 62 KB > 48 KB
  'mixed-40': [{ pixel: 14, audio: 26 }, 'OK', true],
  'many-pixel-devices': [{ pixel: 16, nodePixel: 16, audio: 40 }, 'OK', false]
};

const L = ShowduinoFirmwareLimits;
for (const [key, [spec, firmware, fits]] of Object.entries(CASES)) {
  const doc = show(spec);
  const r = L.inspect(doc);
  const compileProblems = r.problems.filter((p) => p.field !== 'fileBytes');
  assert.strictEqual(compileProblems.length === 0, firmware === 'OK', `${key}: checker ${compileProblems.length ? 'refuses' : 'accepts'} but the firmware returned ${firmware} (${compileProblems.map((p) => p.detail).join(' | ')})`);
  assert.strictEqual(!r.problems.some((p) => p.field === 'fileBytes'), fits, `${key}: size verdict`);
  const { text, compact } = L.serialise(doc);
  assert.strictEqual(Buffer.byteLength(text), r.fileBytes, `${key}: inspected size is the exported size`);
  assert.deepStrictEqual(JSON.parse(text), JSON.parse(JSON.stringify(doc)), `${key}: export text is the same document`);
  if (Buffer.byteLength(JSON.stringify(doc, null, 2)) <= L.LIMITS.fileBytes) assert.strictEqual(compact, false, `${key}: small shows keep spaced, readable export`);
  const checks = L.checks(doc);
  assert.strictEqual(checks.some((c) => c.level === 'error'), firmware !== 'OK' || !fits, `${key}: readiness errors match`);
}
// A 32-byte field name in a parsed object is refused; the same name in skipped metadata is not.
const longKeyDoc = show({}); longKeyDoc.clips[0].params = { ...(longKeyDoc.clips[0].params || {}), ['k'.repeat(32)]: 1 };
assert.ok(L.inspect(longKeyDoc).problems.some((p) => p.field === 'keys'), '32-byte key in clip params is refused');
const metaKeyDoc = show({}); metaKeyDoc.metadata = { ['k'.repeat(40)]: 1 };
assert.ok(!L.inspect(metaKeyDoc).problems.some((p) => p.field === 'keys'), 'long key in skipped metadata is accepted');
// The pixel slot message names the device and the 16-slot limit.
const slots = L.checks(show({ pixel: 17, audio: 0 })).find((c) => c.title === 'Pixel segment slots');
assert.match(slots.detail, /17 pixel cues target ".+"; the P4 has 16 segment slots/);
// Hostile text is only ever reported, never interpreted.
const hostile = L.checks(show({ label: '<img src=x onerror=alert(1)>'.repeat(4) }));
assert.ok(hostile.find((c) => c.title === 'P4 compatibility').detail.includes('<img src=x'), 'detail is plain text for the caller to escape');
console.log(`PASS: Studio P4 limit checker matches the firmware compiler on ${Object.keys(CASES).length} exported shows.`);
