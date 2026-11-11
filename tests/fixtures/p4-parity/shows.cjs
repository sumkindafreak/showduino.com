/* Representative shows, built with Studio's own model and exported with Studio's own
 * packager. Shared by tests/studio-runtime-parity.test.cjs and tools/p4-parity/regenerate.cjs
 * so the firmware verdicts on file always describe exactly what the test compiles. */
const fs = require('fs'); const vm = require('vm'); const path = require('path'); const { webcrypto } = require('crypto');

/**
 * Load the Studio authoring, packaging and deploy scripts into this process.
 * @returns {void}
 */
function loadStudio() {
  if (global.ShowduinoDeploy) return;
  global.window = global; global.crypto = global.crypto || webcrypto;
  global.location = { protocol: 'http:', origin: 'http://192.168.4.1' };
  global.document = { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement() { return {}; }, body: { appendChild() {} } };
  global.alert = () => {}; global.fetch = async () => { throw new Error('network is not used'); };
  global.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  const root = path.join(__dirname, '..', '..', '..');
  for (const file of ['js/showduino-pixel-authoring.js', 'js/showduino-mosfet-authoring.js', 'js/shdo_model.js', 'js/studio-audio-check.js', 'js/studio-package.js', 'js/studio-firmware-limits.js', 'js/studio-deploy.js']) {
    vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
  }
}

/**
 * Add one cue to a project, creating its track on first use.
 * @param {Object} project Studio project.
 * @param {string} type Cue type (pixel, audio, mosfet, trigger, relay, dmx).
 * @param {string} node Routing node ID.
 * @param {number} startMs Start time.
 * @param {number} durationMs Length; 0 for a one-shot.
 * @param {string} label Cue name.
 * @param {Object} [params] Cue parameters.
 * @returns {Object} The new clip.
 */
function cue(project, type, node, startMs, durationMs, label, params) {
  const M = global.SHDOModel; const trackName = `${type} ${node}`;
  let track = project.tracks.find((t) => t.name === trackName);
  if (!track) { track = M.createTrack(type, trackName, project.tracks.length); project.tracks.push(track); }
  const clip = M.createClip(track.id, type, startMs, durationMs, label);
  clip.routing.nodeId = node; Object.assign(clip.params, params || {}); project.clips.push(clip);
  return clip;
}

const FIXTURES = {
  'pixel-p4-local': (p) => cue(p, 'pixel', 'p4-local', 1000, 2500, 'Lightning', { startPixel: 0, length: 30, effect: 'LIGHTNING', r: 255, g: 255, b: 255, speed: 82 }),
  'pixel-p4-blackout-at-end': (p) => cue(p, 'pixel', 'p4-local', 0, 1500, 'Flash', { startPixel: 5, length: 10, effect: 'FIRE', blackoutAtEnd: true }),
  'pixel-p4-secondary-reverse': (p) => cue(p, 'pixel', 'p4-local', 250, 4000, 'Chase', { startPixel: 0, length: 20, effect: 'CHASE', r: 10, g: 20, b: 30, secondary: '#ff8000', brightness: 128, intensity: 60, randomness: 25, reverse: true }),
  'pixel-node': (p) => cue(p, 'pixel', 'LED-01', 500, 2000, 'Node fire', { startPixel: 0, length: 10, effect: 'FIRE' }),
  'pixel-audio-node': (p) => cue(p, 'pixel', 'audio-node-pixels', 0, 2000, 'Audio ring', { startPixel: 0, length: 8, effect: 'RAINBOW' }),
  'pixel-estop-node': (p) => cue(p, 'pixel', 'ESTOP-01', 0, 2000, 'Estop ring', { startPixel: 0, length: 8, effect: 'WARNING' }),
  'pixel-sequential-same-output': (p) => { cue(p, 'pixel', 'p4-local', 0, 1000, 'A', { startPixel: 0, length: 10, effect: 'FIRE' }); cue(p, 'pixel', 'p4-local', 2000, 1000, 'B', { startPixel: 10, length: 10, effect: 'FLICKER' }); },
  'pixel-overlapping-same-output': (p) => { cue(p, 'pixel', 'p4-local', 0, 10000, 'Green', { startPixel: 0, length: 4, effect: 'SOLID', r: 0, g: 255, b: 0 }); cue(p, 'pixel', 'p4-local', 3000, 7000, 'Blue', { startPixel: 4, length: 3, effect: 'SOLID', r: 0, g: 0, b: 255 }); },
  'audio-play': (p) => cue(p, 'audio', 'audio-node', 2000, 3000, 'Roar', { file: 'monster_roar.wav', volume: 90 }),
  'audio-loop': (p) => cue(p, 'audio', 'audio-node', 0, 10000, 'Bed', { file: 'bed.wav', volume: 40, loop: true }),
  'audio-one-shot': (p) => cue(p, 'audio', 'audio-node', 100, 0, 'One shot', { file: 'hit.wav', volume: 100 }),
  'mosfet-hold': (p) => cue(p, 'mosfet', 'MOSFET-01', 1000, 2000, 'Hold', { out: 'out1', mode: 'hold', duty: 100 }),
  'mosfet-level-50': (p) => cue(p, 'mosfet', 'MOSFET-01', 0, 1500, 'Half', { out: 'out2', mode: 'hold', duty: 50 }),
  'mosfet-pulse': (p) => cue(p, 'mosfet', 'MOSFET-01', 0, 3000, 'Pulse', { out: 'out3', mode: 'pulse', pulseMs: 500 }),
  'mosfet-fade': (p) => cue(p, 'mosfet', 'MOSFET-01', 0, 4000, 'Fade', { out: 'out4', mode: 'fade', fadeInMs: 1000, fadeOutMs: 1000, duty: 80 }),
  'ordering-same-time-and-unsorted': (p) => { cue(p, 'audio', 'audio-node', 5000, 1000, 'Late', { file: 'late.wav', volume: 80 }); cue(p, 'pixel', 'p4-local', 0, 1000, 'Early', { startPixel: 0, length: 10, effect: 'FIRE' }); cue(p, 'audio', 'audio-node', 0, 1000, 'Same time', { file: 'same.wav', volume: 80 }); },
  'disabled-cue-skipped': (p) => { cue(p, 'audio', 'audio-node', 0, 1000, 'On', { file: 'on.wav', volume: 80 }); cue(p, 'audio', 'audio-node', 3000, 1000, 'Off', { file: 'off.wav', volume: 80 }).enabled = false; },
  'mixed-show': (p) => { cue(p, 'pixel', 'p4-local', 0, 800, 'Flash', { startPixel: 0, length: 30, effect: 'LIGHTNING' }); cue(p, 'audio', 'audio-node', 1000, 4000, 'Thunder', { file: 'thunder.wav', volume: 80 }); cue(p, 'mosfet', 'MOSFET-01', 1500, 500, 'Fogger', { out: 'out1', mode: 'hold', duty: 100 }); cue(p, 'pixel', 'LED-01', 2000, 3000, 'Lantern', { startPixel: 0, length: 12, effect: 'FLICKER' }); },
  'trigger-refused': (p) => cue(p, 'trigger', '', 0, 100, 'Sensor', {}),
  'relay-refused': (p) => cue(p, 'relay', 'relay-1', 0, 100, 'Relay', {}),
  'dmx-refused': (p) => cue(p, 'dmx', '', 0, 100, 'DMX', {})
};

/* Phase 3: pixel segment policy. These only have verdicts from a firmware build that
 * carries the shared allocation rule (firmware-verdicts-unified.json). */
const px = (p, node, start, dur, label, segment, extra) => {
  const c = cue(p, 'pixel', node, start, dur, label, Object.assign({ startPixel: 0, length: 4, effect: 'SOLID' }, extra || {}));
  if (segment === undefined) delete c.params.segment; else c.params.segment = segment;
  return c;
};
const SEGMENT_FIXTURES = {
  'segments-explicit-distinct': (p) => { px(p, 'p4-local', 0, 5000, 'Two', 2); px(p, 'p4-local', 1000, 5000, 'Five', 5, { startPixel: 4 }); },
  'segments-explicit-conflict': (p) => { px(p, 'p4-local', 0, 5000, 'First on three', 3); px(p, 'p4-local', 1000, 5000, 'Second on three', 3, { startPixel: 4 }); },
  'segments-explicit-reuse-after-end': (p) => { px(p, 'p4-local', 0, 1000, 'Early', 4); px(p, 'p4-local', 1000, 1000, 'Back to back', 4); px(p, 'p4-local', 5000, 1000, 'Later', 4); },
  'segments-hold-then-timed': (p) => { px(p, 'p4-local', 0, 0, 'Held wash', 0); px(p, 'p4-local', 1000, 500, 'Accent', 0, { startPixel: 4 }); px(p, 'p4-local', 3000, 500, 'Accent again', 0, { startPixel: 4 }); },
  'segments-timed-then-hold': (p) => { px(p, 'p4-local', 0, 1000, 'Timed', 0); px(p, 'p4-local', 2000, 0, 'Held after', 0); },
  'segments-above-range': (p) => { px(p, 'p4-local', 0, 1000, 'Ninety-nine', 99); },
  'segments-no-param-sequential': (p) => { px(p, 'p4-local', 0, 1000, 'A', undefined); px(p, 'p4-local', 2000, 1000, 'B', undefined); px(p, 'p4-local', 4000, 1000, 'C', undefined); },
  'segments-no-param-overlapping': (p) => { px(p, 'p4-local', 0, 5000, 'A', undefined); px(p, 'p4-local', 1000, 5000, 'B', undefined, { startPixel: 4 }); },
  'segments-independent-outputs': (p) => { px(p, 'p4-local', 0, 5000, 'Line', 0); px(p, 'LED-01', 0, 5000, 'Node', 0); px(p, 'audio-node-pixels', 0, 5000, 'Audio ring', 0); px(p, 'ESTOP-01', 0, 5000, 'Estop ring', 0); },
  'segments-seventeen-sequential': (p) => { for (let i = 0; i < 17; i++) px(p, 'p4-local', i * 1000, 800, `Step ${i}`, 0); },
  'segments-sixteen-simultaneous': (p) => { for (let i = 0; i < 16; i++) px(p, 'p4-local', i * 10, 60000, `Layer ${i}`, 0, { startPixel: i, length: 1 }); },
  'segments-seventeen-simultaneous-refused': (p) => { for (let i = 0; i < 17; i++) px(p, 'p4-local', i * 10, 60000, `Layer ${i}`, 0, { startPixel: i, length: 1 }); }
};

/**
 * Build one fixture and export it as a canonical SHDO v2 document.
 * @param {string} name Key of FIXTURES.
 * @returns {Object} SHDO v2 document, as Studio's Export writes it.
 */
function exportShow(name) {
  loadStudio();
  const project = global.SHDOModel.createProject(name);
  project.id = `parity-${name}`.slice(0, 47);
  project.assets = {}; project.scenes = []; project.globalSettings = {}; project.metadata = {};
  (FIXTURES[name] || SEGMENT_FIXTURES[name])(project);
  const shdo = global.ShowduinoPackage.toShdo(project);
  // Studio always writes a segment. Files from before that (and hand-written ones) have
  // none, so the "no-param" shows drop it after export to stand in for those files.
  if (name.startsWith('segments-no-param')) shdo.clips.forEach((c) => { delete c.action.params.segment; if (c.params) delete c.params.segment; });
  return shdo;
}

module.exports = { FIXTURES, SEGMENT_FIXTURES, exportShow, loadStudio };
