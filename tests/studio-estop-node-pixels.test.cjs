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

assert.strictEqual(ShowduinoPixelAuthoring.EFFECTS.length, 25, 'shared FX vocabulary remains 25');
['FIRE', 'FLICKER', 'CHASE', 'WARNING', 'RAINBOW', 'CUSTOM_SEQUENCE'].forEach((fx) => {
  assert.ok(ShowduinoPixelAuthoring.canonicalizeEffect(fx), `${fx} resolves`);
});

assert.strictEqual(ShowduinoPixelAuthoring.isEstopPixelId('ESTOP-01'), true);
assert.strictEqual(ShowduinoPixelAuthoring.isEstopPixelId('ESTOP-8'), true);
assert.strictEqual(ShowduinoPixelAuthoring.isEstopPixelId('estop-01-pixels'), true);
assert.strictEqual(ShowduinoPixelAuthoring.isEstopPixelId('not-an-estop'), false);
assert.strictEqual(ShowduinoPixelAuthoring.isEstopPixelId('LED-01'), false);
assert.strictEqual(ShowduinoPixelAuthoring.canonicalNodeId('ESTOP-01'), 'ESTOP-01');
assert.strictEqual(ShowduinoPixelAuthoring.canonicalNodeId('estop-02-pixels'), 'ESTOP-02');
assert.notStrictEqual(ShowduinoPixelAuthoring.canonicalNodeId('ESTOP-01'),
  ShowduinoPixelAuthoring.canonicalNodeId('ESTOP-02'));

assert.strictEqual(ShowduinoPixelAuthoring.routeForNodeId('ESTOP-01'), 'estop-node-pixels');
assert.strictEqual(ShowduinoPixelAuthoring.typeForNodeId('ESTOP-01'), 'estop-node-pixels');
assert.strictEqual(ShowduinoPixelAuthoring.packageDeviceId('ESTOP-01'), 'estop-01-pixels');
assert.strictEqual(ShowduinoPixelAuthoring.commandPrefix({
  binding: { route: 'estop-node-pixels', nodeId: 'ESTOP-01' }
}), 'ESTOP:NODE:PIXEL:');

/* Live capability gate */
ShowduinoPixelAuthoring.ingestLivePayloads([{
  devices: [
    {
      id: 'ESTOP-01',
      role: 'EMERGENCY',
      friendlyName: 'Entrance',
      online: true,
      pixelCapable: true,
      capabilities: ['EMERGENCY', 'PIXEL'],
      pixel: { pin: 2, configured: 30, ready: true, max: 512 }
    },
    {
      id: 'ESTOP-02',
      role: 'EMERGENCY',
      friendlyName: 'Maze Exit',
      online: true,
      pixelCapable: false,
      capabilities: ['EMERGENCY']
    },
    {
      id: 'LED-01',
      role: 'PIXEL',
      friendlyName: 'Corridor',
      online: true,
      initialised: true,
      pixelCount: 60,
      maxPixels: 512
    }
  ],
  lighting: { showPixelsReady: true, showPixelsConfiguredCount: 25, showPixelsMax: 1024 },
  p4Online: true,
  audioNode: {
    online: true,
    pixelCapable: true,
    capabilities: 'WAV,PLAY,PIXEL',
    pixel: { pin: 22, configured: 10, ready: true, max: 512 }
  }
}]);

const outputs = ShowduinoPixelAuthoring.listPixelOutputs({
  live: ShowduinoPixelAuthoring.getLiveSnapshot()
});
const byId = Object.fromEntries(outputs.map((item) => [item.logicalId, item]));
assert.ok(byId['ESTOP-01'], 'ESTOP-01 pixel-capable appears');
assert.strictEqual(byId['ESTOP-01'].route, 'estop-node-pixels');
assert.strictEqual(byId['ESTOP-01'].pin, 2);
assert.strictEqual(byId['ESTOP-01'].pixelCount, 30);
assert.strictEqual(byId['ESTOP-01'].maxPixels, 512);
assert.strictEqual(byId['ESTOP-01'].initialised, true);
assert.ok(!byId['ESTOP-02'], 'non-PIXEL ESTOP must not appear in live pixel selector');
assert.ok(byId['LED-01'], 'standalone Pixel Node preserved');
assert.ok(byId['audio-node'], 'audio pixel preserved');
assert.ok(byId.p4, 'P4 pixel preserved');
assert.ok(!outputs.some((item) => String(item.logicalId).startsWith('LED-') && item.parentRole === 'EMERGENCY'),
  'must not invent LED identity for ESTOP pixels');
assert.ok(!outputs.some((item) => /PIXEL-0/.test(item.logicalId)),
  'must not invent PIXEL-xx identity');

const label = ShowduinoPixelAuthoring.optionLabel(byId['ESTOP-01']);
assert.ok(label.includes('ESTOP-01'), 'label keeps ESTOP id');
assert.ok(label.includes('GPIO2') || label.includes('GPIO2'.toLowerCase()) || label.includes('GPIO'),
  'label mentions GPIO');
assert.ok(label.includes('Entrance'), 'label keeps friendly name');

/* Multiple ESTOP pixel nodes */
ShowduinoPixelAuthoring.ingestLivePayloads([{
  emergencyNodes: [
    {
      id: 'ESTOP-01', name: 'Entrance', online: true, pixelCapable: true,
      pixel: { pin: 2, configured: 30, ready: true, max: 512 }
    },
    {
      id: 'ESTOP-02', name: 'Maze Exit', online: true, pixelCapable: true,
      pixel: { pin: 2, configured: 80, ready: true, max: 512 }
    }
  ]
}]);
const multi = ShowduinoPixelAuthoring.listPixelOutputs({
  live: ShowduinoPixelAuthoring.getLiveSnapshot()
});
assert.ok(multi.some((item) => item.logicalId === 'ESTOP-01'));
assert.ok(multi.some((item) => item.logicalId === 'ESTOP-02'));
assert.notStrictEqual(
  multi.find((item) => item.logicalId === 'ESTOP-01').deviceId,
  multi.find((item) => item.logicalId === 'ESTOP-02').deviceId
);

/* Offline project placeholder */
const offlineOutputs = ShowduinoPixelAuthoring.listPixelOutputs({
  live: { fetched: true, emergencyNodes: [], nodes: [] },
  project: {
    devices: [{
      id: 'estop-01-pixels',
      type: 'estop-node-pixels',
      binding: { route: 'estop-node-pixels', nodeId: 'ESTOP-01', outputLabel: 'gpio2', parentNodeId: 'ESTOP-01' }
    }],
    clips: []
  }
});
const missing = offlineOutputs.find((item) => item.logicalId === 'ESTOP-01');
assert.ok(missing, 'saved ESTOP pixel target survives offline');
assert.strictEqual(missing.route, 'estop-node-pixels');
assert.strictEqual(missing.missing, true);
assert.ok(ShowduinoPixelAuthoring.statusText(missing).toLowerCase().includes('missing') ||
  ShowduinoPixelAuthoring.statusText(missing).toLowerCase().includes('offline'));

/* SHDO package + deploy */
const project = SHDOModel.createProject('Estop Pixel Chamber');
project.assets = {};
project.scenes = [];
project.globalSettings = {};
project.metadata = {};

const pixelTrack = SHDOModel.createTrack('pixel', 'Estop Pixels', 0);
const fireClip = SHDOModel.createClip(pixelTrack.id, 'pixel', 0, 5000, 'Fire');
fireClip.routing.nodeId = 'ESTOP-01';
fireClip.routing.output = 'gpio2';
fireClip.params = ShowduinoPixelAuthoring.migratePixelParams({
  segment: 0, startPixel: 0, length: 30, effect: 'FIRE', brightness: 200, speed: 60
});

const ledClip = SHDOModel.createClip(pixelTrack.id, 'pixel', 1000, 2000, 'LED Flicker');
ledClip.routing.nodeId = 'LED-01';
ledClip.params = ShowduinoPixelAuthoring.migratePixelParams({
  segment: 0, startPixel: 0, length: 8, effect: 'FLICKER'
});

const p4Clip = SHDOModel.createClip(pixelTrack.id, 'pixel', 2000, 2000, 'P4 Rainbow');
p4Clip.routing.nodeId = 'p4';
p4Clip.params = ShowduinoPixelAuthoring.migratePixelParams({
  segment: 1, startPixel: 0, length: 8, effect: 'RAINBOW'
});

project.tracks.push(pixelTrack);
project.clips.push(fireClip, ledClip, p4Clip);

const shdo = ShowduinoPackage.toShdo(project);
assert.ok(ShowduinoPackage.validateShdo(shdo).valid);
const estopDevice = shdo.devices.find((d) => d.binding?.route === 'estop-node-pixels');
assert.ok(estopDevice, 'estop-node-pixels binding present');
assert.strictEqual(estopDevice.type, 'estop-node-pixels');
assert.strictEqual(estopDevice.binding.nodeId, 'ESTOP-01');
assert.strictEqual(estopDevice.binding.outputLabel, 'gpio2');
assert.strictEqual(estopDevice.binding.parentNodeId, 'ESTOP-01');
assert.ok(!String(estopDevice.binding.nodeId).startsWith('LED'), 'binding keeps ESTOP identity');

const plan = ShowduinoDeploy.compileShdoForStage(shdo);
assert.strictEqual(plan.ok, true, plan.errors.join('\n'));
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('ESTOP:NODE:PIXEL:SEGMENT:0:FX:FIRE')));
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('PIXEL:NODE:LED-01:')));
assert.ok(plan.uploadCommands.some((cmd) => cmd.includes('PIXEL:SEGMENT:1:FX:RAINBOW')));
assert.ok(plan.uploadCommands.every((cmd) => {
  if (cmd.includes('ESTOP:NODE:PIXEL:')) return !cmd.includes('PIXEL:NODE:LED');
  return true;
}), 'ESTOP pixel commands must not use fake LED route');
assert.ok(plan.uploadCommands.every((cmd) => {
  const body = cmd.replace(/^SHOW:TL:C:\d+:/, '');
  return body.length <= 63 || cmd.startsWith('SHOW:TL:BEGIN') || cmd.startsWith('SHOW:TL:END');
}), 'commands remain within P4 timeline length');

/* Round-trip identity */
const collected = ShowduinoPixelAuthoring.listPixelOutputs({ project: shdo, live: { fetched: true } });
assert.ok(collected.some((item) => item.logicalId === 'ESTOP-01' && item.route === 'estop-node-pixels'));

console.log(`Emergency Node pixel integration passed: ${shdo.devices.length} devices, ${plan.commands.length} P4 commands.`);
