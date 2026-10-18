/* Sounds panel: the WAV check must match the Audio Node firmware rule
 * (new_showduino protocol/showduino_audio_node.h showduino_audio_wav_pcm_ok)
 * and cue file names must fit the P4 timeline command limit. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
global.window = global;
global.document = { createElement() { return {}; }, addEventListener() {}, getElementById() { return null; }, body: null };
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
global.dispatchEvent = () => true;
vm.runInThisContext(fs.readFileSync('js/studio-audio-check.js', 'utf8'), { filename: 'js/studio-audio-check.js' });
vm.runInThisContext(fs.readFileSync('js/studio-sounds.js', 'utf8'), { filename: 'js/studio-sounds.js' });
const S = window.ShowduinoSounds;

function wav({ format = 1, channels = 2, rate = 44100, bits = 16, dataBytes = 44100 * 4, extraChunk = false } = {}) {
  const extra = extraChunk ? 12 : 0;
  const buf = Buffer.alloc(44 + extra);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + extra + dataBytes, 4); buf.write('WAVE', 8);
  let o = 12;
  if (extraChunk) { buf.write('LIST', o); buf.writeUInt32LE(4, o + 4); buf.write('INFO', o + 8); o += 12; }
  buf.write('fmt ', o); buf.writeUInt32LE(16, o + 4); buf.writeUInt16LE(format, o + 8); buf.writeUInt16LE(channels, o + 10);
  buf.writeUInt32LE(rate, o + 12); buf.writeUInt32LE(rate * channels * bits / 8, o + 16); buf.writeUInt16LE(channels * bits / 8, o + 20); buf.writeUInt16LE(bits, o + 22);
  buf.write('data', o + 24); buf.writeUInt32LE(dataBytes, o + 28);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}
const compat = (opts, name = 'a.wav') => S.audioNodeCompatibility(S.parseWavHeader(wav(opts)), name);

// Accepted exactly as the firmware accepts.
for (const rate of [8000, 16000, 22050, 32000, 44100, 48000]) {
  for (const channels of [1, 2]) assert.ok(compat({ rate, channels }).ok, `${rate} Hz ${channels} ch accepted`);
}
assert.ok(compat({ extraChunk: true }).ok, 'extra chunks before fmt are skipped');
// Refused exactly as the firmware refuses.
assert.ok(!compat({ format: 3 }).ok && /PCM/.test(compat({ format: 3 }).reason), 'float WAV refused');
assert.ok(!compat({ bits: 24 }).ok && /16-bit/.test(compat({ bits: 24 }).reason), '24-bit refused');
assert.ok(!compat({ bits: 8 }).ok, '8-bit refused');
assert.ok(!compat({ channels: 6 }).ok, '5.1 refused');
assert.ok(!compat({ rate: 96000 }).ok && /96000/.test(compat({ rate: 96000 }).reason), '96 kHz refused');
assert.ok(!compat({ rate: 11025 }).ok, '11.025 kHz refused');
const mp3 = S.audioNodeCompatibility(S.parseWavHeader(Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00').buffer), 'roar.mp3');
assert.ok(!mp3.ok && /MP3/.test(mp3.reason), 'MP3 identified and refused');
assert.ok(!S.audioNodeCompatibility(S.parseWavHeader(new ArrayBuffer(4)), 'x.wav').ok, 'truncated file refused');
// Duration maths used by the panel: 44100 Hz stereo 16-bit, 1 s of data.
const info = S.parseWavHeader(wav());
assert.strictEqual(Math.round(info.dataBytes / (info.rate * info.channels * info.bits / 8) * 1000), 1000);

// Cue names (W004): the Audio Node firmware rule (js/studio-audio-check.js) plus the
// AUDIO:NODE:PLAY:<file> 63-character timeline command limit.
assert.strictEqual(S.MAX_CUE_NAME, 63 - 'AUDIO:NODE:PLAY:'.length);
assert.ok(S.cueNameCheck('monster_roar.wav').ok);
assert.ok(S.cueNameCheck('effects/roar.wav').ok, 'sub-folder names allowed');
assert.ok(S.cueNameCheck('x'.repeat(S.MAX_CUE_NAME - 4) + '.wav').ok, 'longest name that fits the timeline command');
assert.ok(!S.cueNameCheck('x'.repeat(S.MAX_CUE_NAME - 3) + '.wav').ok, 'too long for the timeline command');
for (const bad of ['a:b.wav', '../secret.wav', 'a\nEMERGENCY:CLEAR', 'dir\\a.wav', '', 'My Scream.wav', 'roar.mp3']) assert.ok(!S.cueNameCheck(bad).ok, `refused: ${JSON.stringify(bad)}`);

console.log('Sounds: WAV rule matches the Audio Node firmware (12 accepted, 7 refused), cue-name limits enforced.');
