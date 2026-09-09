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

load('js/shdo_model.js');
load('js/studio-package.js');
load('js/studio-deploy.js');

const project = SHDOModel.createProject('Phone Test');
project.assets = {};
project.scenes = [];
project.globalSettings = {};
project.metadata = {};

const pixelTrack = SHDOModel.createTrack('pixel', 'Corridor Pixels', 0);
const audioTrack = SHDOModel.createTrack('audio', 'Scare Audio', 1);
const pixelClip = SHDOModel.createClip(pixelTrack.id, 'pixel', 1000, 2500, 'Lightning');
pixelClip.routing.nodeId = 'p4-local';
pixelClip.params.startPixel = 0;
pixelClip.params.length = 10;
pixelClip.params.effect = 'LIGHTNING';
pixelClip.params.speed = 82;

const audioClip = SHDOModel.createClip(audioTrack.id, 'audio', 2000, 3000, 'Roar');
audioClip.routing.nodeId = 'audio-1';
audioClip.params.file = 'monster_roar.wav';
audioClip.params.volume = 90;

project.tracks.push(pixelTrack, audioTrack);
project.clips.push(pixelClip, audioClip);

const shdo = ShowduinoPackage.toShdo(project);
assert.strictEqual(shdo.schema, 'showduino-production-v2');
assert.strictEqual(shdo.package.version, 2);
assert.strictEqual(shdo.architecture.runtimeAuthority, 'esp32-p4-show-engine');
assert.strictEqual(shdo.architecture.nodeAddressing, 'logical-device-id');
assert.ok(Array.isArray(shdo.devices));
assert.ok(Array.isArray(shdo.assets));
assert.strictEqual(shdo.assets.length, 0);
assert.strictEqual(shdo.safety.emergency.pixelOverride, 'all-white');
assert.strictEqual(shdo.safety.emergency.autoResume, false);
assert.strictEqual(shdo.safety.emergency.productionCannotDisable, true);
assert.strictEqual(shdo.scenes.length, 1);
assert.strictEqual(shdo.scenes[0].cues[0].clipIds.length, 2);
assert.strictEqual(shdo.clips.length, 2);
assert.ok(shdo.clips.every((clip) => clip.action && clip.sceneId && clip.cueId));
assert.ok(shdo.clips.every((clip) => clip.targetDeviceId));
assert.ok(ShowduinoPackage.validateShdo(shdo).valid);

const restored = ShowduinoPackage.fromShdo(shdo);
assert.strictEqual(restored.project.name, 'Phone Test');
assert.strictEqual(restored.tracks.length, 2);
assert.strictEqual(restored.clips.length, 2);
assert.strictEqual(restored.clips.find((clip) => clip.type === 'audio').params.file, 'monster_roar.wav');
assert.strictEqual(restored.clips.find((clip) => clip.type === 'pixel').params.effect, 'LIGHTNING');
assert.strictEqual(restored.clips.find((clip) => clip.type === 'pixel').routing.nodeId, 'p4-local');

const plan = ShowduinoDeploy.compileShdoForStage(shdo);
assert.strictEqual(plan.ok, true, plan.errors.join('\n'));
assert.ok(plan.uploadCommands[0] === 'SHOW:TL:BEGIN');
assert.ok(plan.uploadCommands.at(-1) === 'SHOW:TL:END');
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('PIXEL:SEGMENT:0:FX:LIGHTNING')));
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('AUDIO:NODE:PLAY:monster_roar.wav')));
assert.ok(plan.uploadCommands.every((cmd) => cmd.length <= 100));

const blocked = JSON.parse(JSON.stringify(shdo));
blocked.clips.push({
  id: 'mosfet-test',
  trackId: pixelTrack.id,
  sceneId: blocked.scenes[0].id,
  cueId: blocked.scenes[0].cues[0].id,
  name: 'Unsupported MOSFET',
  type: 'mosfet',
  startMs: 5000,
  durationMs: 100,
  enabled: true,
  action: { type: 'mosfet', label: 'Unsupported MOSFET', delayMs: 0, durationMs: 100, value: '', notes: '', params: {} }
});
const blockedPlan = ShowduinoDeploy.compileShdoForStage(blocked);
assert.strictEqual(blockedPlan.ok, false);
assert.ok(blockedPlan.errors.some((error) => error.includes('MOSFET Node runtime is not implemented')));

const tampered = JSON.parse(JSON.stringify(shdo));
tampered.safety.emergency.autoResume = true;
assert.strictEqual(ShowduinoPackage.validateShdo(tampered).valid, false);

console.log(`SHDO v2 round trip passed: ${shdo.devices.length} devices, ${shdo.clips.length} clips, ${plan.commands.length} P4 commands.`);
