const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { webcrypto } = require('crypto');

global.window = global;
global.crypto = webcrypto;
global.location = { protocol: 'http:', origin: 'http://192.168.4.1' };
global.document = {
  addEventListener() {},
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() { return {}; },
  body: { appendChild() {} }
};
global.alert = () => {};
global.fetch = async () => { throw new Error('network not used by compiler test'); };
global.CustomEvent = class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

function load(path) {
  vm.runInThisContext(fs.readFileSync(path, 'utf8'), { filename: path });
}

load('js/showduino-pixel-authoring.js');
load('js/shdo_model.js');
load('js/studio-package.js');
load('js/studio-deploy.js');

assert.strictEqual(ShowduinoPixelAuthoring.isAudioPixelId('audio-node'), true);
assert.strictEqual(ShowduinoPixelAuthoring.routeForNodeId('audio-node'), 'audio-node-pixels');
assert.strictEqual(ShowduinoPixelAuthoring.commandPrefix({
  binding: { route: 'audio-node-pixels', nodeId: 'audio-node' }
}), 'AUDIO:NODE:PIXEL:');

const outputs = ShowduinoPixelAuthoring.listPixelOutputs({
  live: {
    fetched: true,
    p4Online: true,
    lighting: { showPixelsReady: true, showPixelsConfiguredCount: 25, showPixelsMax: 1024 },
    audioNode: {
      online: true,
      pixelCapable: true,
      capabilities: 'WAV,PLAY,PIXEL',
      pixel: { pin: 22, configured: 10, ready: true, max: 512 }
    },
    nodes: [{ id: 'LED-01', name: 'Corridor', online: true, initialised: true, pixelCount: 60, maxPixels: 512 }]
  }
});
const ids = outputs.map((item) => item.logicalId);
assert.ok(ids.includes('p4'));
assert.ok(ids.includes('audio-node'));
assert.ok(ids.includes('LED-01'));
assert.ok(!ids.includes('LED-00'), 'must not invent a fake LED identity for Audio Node');

const audioOnly = ShowduinoPixelAuthoring.listPixelOutputs({
  live: {
    fetched: true,
    audioNode: { online: true, pixelCapable: false, capabilities: 'WAV,PLAY,LOOP', outputs: [{ id: 'audio', kind: 'audio' }] }
  }
});
assert.ok(!audioOnly.some((item) => item.logicalId === 'audio-node'),
  'audio-only node must not expose lighting output');

const project = SHDOModel.createProject('Haunted Chamber');
project.assets = {};
project.scenes = [];
project.globalSettings = {};
project.metadata = {};

const pixelTrack = SHDOModel.createTrack('pixel', 'Chamber Pixels', 0);
const audioTrack = SHDOModel.createTrack('audio', 'Chamber Audio', 1);

const audioClip = SHDOModel.createClip(audioTrack.id, 'audio', 0, 10000, 'Ambience');
audioClip.routing.nodeId = 'audio-node';
audioClip.params.file = 'chamber_ambience.wav';
audioClip.params.volume = 80;

const fireClip = SHDOModel.createClip(pixelTrack.id, 'pixel', 0, 5000, 'Fire');
fireClip.routing.nodeId = 'audio-node';
fireClip.routing.output = 'gpio22';
fireClip.params = ShowduinoPixelAuthoring.migratePixelParams({
  segment: 0, startPixel: 0, length: 10, effect: 'FIRE', brightness: 200, speed: 60
});

const p4Clip = SHDOModel.createClip(pixelTrack.id, 'pixel', 1000, 2000, 'P4 Lightning');
p4Clip.routing.nodeId = 'p4';
p4Clip.params = ShowduinoPixelAuthoring.migratePixelParams({
  segment: 1, startPixel: 0, length: 8, effect: 'LIGHTNING'
});

project.tracks.push(pixelTrack, audioTrack);
project.clips.push(audioClip, fireClip, p4Clip);

const shdo = ShowduinoPackage.toShdo(project);
assert.ok(ShowduinoPackage.validateShdo(shdo).valid);
const audioPixelDevice = shdo.devices.find((d) => d.binding?.route === 'audio-node-pixels');
const audioDevice = shdo.devices.find((d) => d.binding?.route === 'audio-node');
const p4Device = shdo.devices.find((d) => d.binding?.route === 'p4-show-pixels');
assert.ok(audioPixelDevice, 'audio pixel binding present');
assert.ok(audioDevice, 'audio playback binding present');
assert.ok(p4Device, 'p4 pixel binding preserved');
assert.strictEqual(audioPixelDevice.binding.nodeId, 'audio-node');
assert.strictEqual(audioPixelDevice.binding.outputLabel, 'gpio22');
assert.notStrictEqual(audioPixelDevice.id, audioDevice.id, 'audio and pixel outputs are distinct logical devices');

const plan = ShowduinoDeploy.compileShdoForStage(shdo);
assert.strictEqual(plan.ok, true, plan.errors.join('\n'));
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('AUDIO:NODE:PLAY:chamber_ambience.wav')));
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('AUDIO:NODE:PIXEL:SEGMENT:0:FX:FIRE')));
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('PIXEL:SEGMENT:1:FX:LIGHTNING')));
assert.ok(plan.uploadCommands.every((cmd) => !cmd.includes('PIXEL:NODE:LED')), 'must not route via fake LED-XX');
assert.ok(plan.uploadCommands.every((cmd) => cmd.length <= 100));

console.log(`Audio Node pixel integration passed: ${shdo.devices.length} devices, ${plan.commands.length} P4 commands.`);
