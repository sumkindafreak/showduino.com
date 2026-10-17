/* W001: Studio's deploy pre-flight must match the firmware's browser upload policy
 * (new_showduino protocol/showduino_web_timeline_upload_policy.h): only PIXEL:* and
 * AUDIO:NODE:* cues inside SHOW:TL:BEGIN / SHOW:TL:C / SHOW:TL:END. Anything else must
 * be refused before the first command is sent. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { webcrypto } = require('crypto');

global.window = global;
global.crypto = webcrypto;
global.location = { protocol: 'http:', origin: 'http://192.168.4.1' };
global.document = {
  addEventListener() {}, querySelector() { return null; }, getElementById() { return null; },
  createElement() { return {}; }, body: { appendChild() {} }
};
global.alert = () => {};
global.fetch = async () => { throw new Error('network not used by this test'); };
global.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
const load = (path) => vm.runInThisContext(fs.readFileSync(path, 'utf8'), { filename: path });
load('js/shdo_model.js');
load('js/studio-package.js');
load('js/showduino-mosfet-authoring.js');
load('js/studio-deploy.js');

const allowed = ShowduinoDeploy.uploadEnvelopeAllowed;
assert.strictEqual(allowed('SHOW:TL:BEGIN'), true);
assert.strictEqual(allowed('SHOW:TL:END'), true);
assert.strictEqual(allowed('SHOW:TL:C:1000:PIXEL:SEGMENT:0:START'), true);
assert.strictEqual(allowed('SHOW:TL:C:1000:PIXEL:NODE:LED-01:SEGMENT:0:START'), true);
assert.strictEqual(allowed('SHOW:TL:C:0:AUDIO:NODE:PLAY:roar.wav'), true);
assert.strictEqual(allowed('SHOW:TL:C:0:AUDIO:NODE:PIXEL:SEGMENT:0:START'), true);
// Families the firmware refuses in a browser upload.
assert.strictEqual(allowed('SHOW:TL:C:0:ESTOP:NODE:PIXEL:SEGMENT:0:START'), false);
assert.strictEqual(allowed('SHOW:TL:C:0:MOSFET:NODE:MOS-01:OUT:1:ON'), false);
assert.strictEqual(allowed('SHOW:TL:C:0:EMERGENCY:CLEAR'), false);
assert.strictEqual(allowed('SHOW:TL:C:0:SHOW:START'), false);
assert.strictEqual(allowed('EMERGENCY:CLEAR'), false);
// Envelope shape, as in the firmware.
assert.strictEqual(allowed('SHOW:TL:C:4294967296:PIXEL:X'), false, 'time above uint32 refused');
assert.strictEqual(allowed('SHOW:TL:C::PIXEL:X'), false, 'missing time refused');
assert.strictEqual(allowed('SHOW:TL:C:1:PIXEL:' + 'x'.repeat(60)), false, 'payload above 63 chars refused');
assert.strictEqual(allowed('SHOW:TL:C:1:PIXEL:A\nEMERGENCY:CLEAR'), false, 'newline refused');

// A real compiled P4 pixel + Audio Node production passes the pre-flight.
const project = SHDOModel.createProject('Policy');
project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
const t1 = SHDOModel.createTrack('pixel', 'Pixels', 0);
const t2 = SHDOModel.createTrack('audio', 'Audio', 1);
const c1 = SHDOModel.createClip(t1.id, 'pixel', 1000, 2500, 'Flash');
c1.routing.nodeId = 'p4-local'; c1.params.startPixel = 0; c1.params.length = 10; c1.params.effect = 'LIGHTNING';
const c2 = SHDOModel.createClip(t2.id, 'audio', 2000, 3000, 'Roar');
c2.routing.nodeId = 'audio-1'; c2.params.file = 'monster_roar.wav'; c2.params.volume = 90;
project.tracks.push(t1, t2); project.clips.push(c1, c2);
const plan = ShowduinoDeploy.compileShdoForStage(ShowduinoPackage.toShdo(project));
assert.ok(plan.ok, plan.errors.join('; '));
assert.deepStrictEqual(ShowduinoDeploy.uploadPolicyErrors(plan), [], 'pixel + audio node upload is accepted');

// A plan containing refused families is stopped before anything is sent.
const mixed = { uploadCommands: ['SHOW:TL:BEGIN', 'SHOW:TL:C:0:PIXEL:SEGMENT:0:START',
  'SHOW:TL:C:0:MOSFET:NODE:MOS-01:OUT:1:ON', 'SHOW:TL:C:0:ESTOP:NODE:PIXEL:SEGMENT:0:START', 'SHOW:TL:END'] };
const errors = ShowduinoDeploy.uploadPolicyErrors(mixed);
assert.strictEqual(errors.length, 1);
assert.ok(/MOSFET:NODE/.test(errors[0]) && /ESTOP:NODE/.test(errors[0]) && /nothing was sent/.test(errors[0]));

console.log('Firmware upload policy pre-flight: PIXEL/AUDIO:NODE accepted; MOSFET, ESTOP pixel and control commands refused before upload.');
