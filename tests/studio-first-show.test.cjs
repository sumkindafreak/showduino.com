// First Show must create canonical SHDO v2, preserve safety, and remain offline.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
global.window = global;
global.crypto = webcrypto;
global.location = { protocol:'https:', origin:'https://show-duino.com' };
global.document = { addEventListener() {} };
global.alert = () => {};
global.fetch = async () => { throw Error('Wizard must not use network for creation'); };
global.CustomEvent = class CustomEvent {};
function load(path) { vm.runInThisContext(fs.readFileSync(path,'utf8'), { filename:path }); }
load('js/showduino-pixel-authoring.js');
load('js/showduino-mosfet-authoring.js');
load('js/shdo_model.js');
load('js/studio-package.js');
load('js/studio-first-show.js');

const wizard = ShowduinoFirstShow;
const base = wizard.initial();
base.p4 = true;
const starter = wizard.createProject(base);
assert.equal(starter.project.name, 'My Halloween Show');
assert.equal(starter.tracks.length, 1);
assert.equal(starter.clips.length, 1);
assert.equal(starter.clips[0].type, 'pixel');
assert.equal(starter.clips[0].routing.nodeId, 'p4');
assert.equal(starter.devices[0].metadata.hardwareVerified, false);
assert.equal(starter.scenes[0].cues[0].clipIds.length, 1);
assert.equal(starter.project.duration, 15000);

const shdo = ShowduinoPackage.toShdo(starter);
assert.equal(shdo.schema, 'showduino-production-v2');
assert.equal(ShowduinoPackage.validateShdo(shdo).valid, true);
assert.equal(shdo.safety.emergency.pixelOverride, 'all-white');
assert.equal(shdo.safety.emergency.autoResume, false);
assert.equal(shdo.architecture.runtimeAuthority, 'esp32-p4-show-engine');
assert.equal(shdo.clips[0].targetDeviceId, 'p4-show-pixels');

const restored = ShowduinoPackage.fromShdo(shdo);
assert.equal(restored.clips.length, 1);
assert.equal(restored.clips[0].routing.nodeId, 'p4');

const all = wizard.initial();
Object.assign(all, {p4:true, audio:true, audioNode:'audio-1', audioFile:'scare.wav',
  pixel:true, pixelNode:'PIXEL-01', mosfet:true, mosfetNode:'MOSFET-01', pulseMs:400});
const project = wizard.createProject(all);
assert.equal(project.tracks.length, 4);
assert.equal(project.clips.length, 4);
assert.equal(project.devices.length, 4);
assert.deepEqual(project.clips.map(x=>x.type).sort(), ['audio','mosfet','pixel','pixel']);
assert.equal(project.clips.find(x=>x.type==='mosfet').params.safeOff,true);
assert.equal(project.clips.find(x=>x.type==='audio').params.file,'scare.wav');
const multiShdo = ShowduinoPackage.toShdo(project);
assert.equal(ShowduinoPackage.validateShdo(multiShdo).valid,true);
assert.equal(multiShdo.clips.length,4);
assert.ok(multiShdo.clips.every(x=>x.targetDeviceId), 'All first-show outputs must have SHDO routing');

const invalidAudio={...wizard.initial(),audio:true,audioFile:''};
assert.ok(wizard.validate(invalidAudio).length);
assert.throws(()=>wizard.createProject(invalidAudio),/WAV filename/);
for (const alias of ['p4','p4-local','audio-1','audio-node','ESTOP-001','p4-show-pixels','gpio23']) {
  const d={...wizard.initial(),pixel:true,pixelNode:alias};
  assert.ok(wizard.validate(d).length, 'Reserved ID accepted: '+alias);
  assert.throws(()=>wizard.createProject(d),/Pixel Node/);
}
const invalidProp={...wizard.initial(),mosfet:true,mosfetNode:'fake'};
assert.throws(()=>wizard.createProject(invalidProp),/MOSFET/);
const none={...wizard.initial(),p4:false};
assert.throws(()=>wizard.createProject(none),/at least one/);
console.log('First Show wizard: validated starter, four outputs, safety and SHDO v2 round trip.');
