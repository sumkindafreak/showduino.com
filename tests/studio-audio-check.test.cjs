/* W004: Studio's audio file-name rule must agree with the Audio Node firmware.
 *
 * EXPECTED below was produced by compiling new_showduino protocol/showduino_audio_node.h
 * (firmware main) with gcc and running showduino_audio_resolve_path() over each name:
 *   0 OK, 1 EMPTY, 2 TOO_LONG, 3 TRAVERSAL, 4 BAD_CHAR, 5 BAD_EXT, 6 OUTSIDE_ROOT
 * Studio may be stricter (CUE_TOO_LONG: fits the firmware but not the 63-character
 * AUDIO:NODE:PLAY timeline command), never looser. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
global.window = global;
global.document = { addEventListener() {}, getElementById() { return null; }, body: null };
const store = {};
global.localStorage = { getItem(k) { return k in store ? store[k] : null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } };
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
global.dispatchEvent = () => true;
vm.runInThisContext(fs.readFileSync('js/studio-audio-check.js', 'utf8'), { filename: 'js/studio-audio-check.js' });
const C = window.ShowduinoAudioCheck;

const CODES = { OK: 0, EMPTY: 1, TOO_LONG: 2, TRAVERSAL: 3, BAD_CHAR: 4, BAD_EXT: 5, OUTSIDE_ROOT: 6 };
const EXPECTED = [["scream.wav", 0], ["SCREAM.WAV", 0], ["effects/roar.wav", 0], ["ambience/rain_loop-01.wav", 0], ["/showduino/audio/scream.wav", 0], ["/showduino/audio/effects/roar.wav", 0], ["/showduino/audio", 1], ["/showduino/audio/", 1], ["/other/scream.wav", 6], ["/showduino/audiox/a.wav", 6], ["My Scream.wav", 4], ["scream (1).wav", 4], ["café.wav", 4], ["a:b.wav", 4], ["../secret.wav", 3], ["a/../b.wav", 3], ["dir\\a.wav", 3], ["a//b.wav", 3], ["scream.mp3", 5], ["scream.WAV", 0], ["scream.wav.txt", 5], [".wav", 0], ["x.wav", 0], ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav", 2], ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav", 2], ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav", 0], ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav", 0], ["deep/nested/folder/x.wav", 0], ["emergency.wav", 0], ["scream%20.wav", 4], ["tab\tname.wav", 4]];

let stricter = 0;
for (const [name, firmware] of EXPECTED) {
  const rule = C.fileRule(name);
  if (rule.code === 'CUE_TOO_LONG') {
    assert.strictEqual(firmware, 0, `${JSON.stringify(name)}: Studio stricter only where the firmware accepts`);
    stricter++;
    continue;
  }
  assert.strictEqual(CODES[rule.code], firmware, `${JSON.stringify(name)}: Studio ${rule.code}, firmware ${firmware}`);
  assert.strictEqual(rule.ok, firmware === 0, `${JSON.stringify(name)}: ok flag`);
}

// Inventory limits: names the node will play but cannot list are flagged.
assert.ok(C.fileRule('dialogue/' + 'a'.repeat(28) + '.wav').warnings.some((w) => /39 characters/.test(w)), 'long name warned');
assert.ok(C.fileRule('sfx/x.wav').warnings.some((w) => /only lists files/.test(w)), 'unlisted folder warned');
assert.deepStrictEqual(C.fileRule('effects/x.wav').warnings, []);

// Status: nothing is "on the Audio Node" without a real device listing.
assert.strictEqual(C.status('scream.wav').state, 'unconfirmed');
assert.strictEqual(C.status('My Scream.wav').state, 'invalid');
C.recordDeviceListing(['SCREAM.WAV', 'effects/roar.wav'], 'test');
assert.strictEqual(C.status('scream.wav').state, 'on-node', 'FAT card names compare case-insensitively');
assert.strictEqual(C.status('/showduino/audio/effects/roar.wav').state, 'on-node', 'absolute and relative forms match');
assert.strictEqual(C.status('thunder.wav').state, 'unconfirmed');
assert.ok(/did not include it/.test(C.status('thunder.wav').text));
C.clearDeviceListing();
assert.strictEqual(C.status('scream.wav').state, 'unconfirmed', 'forgetting the list removes the confirmation');

// Cue report reads both Studio clips and SHDO v2 actions.
const report = C.cueReport({ clips: [
  { id: 'a', type: 'audio', label: 'Scream', params: { file: 'scream.wav' } },
  { id: 'b', action: { type: 'audio', params: { file: 'Bad Name.wav' } }, name: 'Bad' },
  { id: 'c', type: 'pixel', params: {} }
] });
assert.deepStrictEqual(report.map((r) => [r.id, r.status.state]), [['a', 'unconfirmed'], ['b', 'invalid']]);

console.log(`Audio file names: ${EXPECTED.length} names agree with the compiled Audio Node firmware (${stricter} refused by Studio for the timeline command limit); listing-based confirmation enforced.`);
