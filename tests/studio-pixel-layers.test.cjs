const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { webcrypto } = require('crypto');

global.window = global;
global.crypto = webcrypto;
global.location = { href: 'http://192.168.4.1/studio/', hostname: '192.168.4.1' };
global.document = {
  addEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return null; }
};

global.MutationObserver = class MutationObserver {
  constructor() {}
  observe() {}
};

global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.setInterval = setInterval;
global.clearInterval = clearInterval;

function load(path) {
  vm.runInThisContext(fs.readFileSync(path, 'utf8'), { filename: path });
}

load('js/shdo_model.js');
load('js/studio-creator-bootstrap.js');

const production = SHDOModel.createProject('Layered Pixels');
const originalTrack = SHDOModel.createTrack('pixel', 'Pixel FX', 0);
production.tracks.push(originalTrack);

function pixelClip(startMs, durationMs, startPixel, length, colour) {
  const clip = SHDOModel.createClip(originalTrack.id, 'pixel', startMs, durationMs, `PX ${startPixel}`);
  clip.routing.nodeId = 'p4-local';
  clip.routing.output = 'LINE1';
  clip.params.line = 1;
  clip.params.segmentMode = 'range';
  clip.params.startPixel = startPixel;
  clip.params.length = length;
  clip.params.effect = 'solid';
  clip.params.r = colour[0];
  clip.params.g = colour[1];
  clip.params.b = colour[2];
  return clip;
}

const green = pixelClip(0, 10000, 0, 4, [0, 255, 0]);
const blue = pixelClip(3000, 7000, 4, 3, [0, 0, 255]);
const greenAgain = pixelClip(12000, 2000, 0, 4, [0, 255, 0]);
production.clips.push(green, blue, greenAgain);
global.state = { project: production };

const changed = ShowduinoPixelLayers.normalisePixelTracks();
assert.strictEqual(changed, true);

const pixelTracks = production.tracks.filter((track) => track.type === 'pixel');
assert.strictEqual(pixelTracks.length, 2, 'two physical ranges should become two pixel lanes');
assert.notStrictEqual(green.trackId, blue.trackId, 'overlapping different ranges must use different lanes');
assert.strictEqual(green.trackId, greenAgain.trackId, 'later cue for the same range should reuse its lane');

const greenTrack = pixelTracks.find((track) => track.id === green.trackId);
const blueTrack = pixelTracks.find((track) => track.id === blue.trackId);
assert.strictEqual(greenTrack.name, 'PX L1 · 0–3');
assert.strictEqual(blueTrack.name, 'PX L1 · 4–6');
assert.strictEqual(ShowduinoPixelLayers.pixelSegmentKey(green), ShowduinoPixelLayers.pixelSegmentKey(greenAgain));
assert.notStrictEqual(ShowduinoPixelLayers.pixelSegmentKey(green), ShowduinoPixelLayers.pixelSegmentKey(blue));

const changedAgain = ShowduinoPixelLayers.normalisePixelTracks();
assert.strictEqual(changedAgain, false, 'normalisation should be stable on the second pass');

console.log('Layered pixel lane test passed: PX 0–3 and PX 4–6 coexist on independent tracks.');
