/* Showduino Studio: limits of the P4 Show Engine's SHDO compiler (W005, W5-09).
 *
 * Mirrors new_showduino protocol/showduino_shdo.h and protocol/showduino_deploy.h, so Studio
 * can say before export which productions the P4 will refuse. Keep these numbers in step
 * with the firmware; tests/studio-p4-limits.test.cjs checks them against genuine exports.
 *
 *   SHOWDUINO_SHDO_MAX_BYTES     48 KiB   (whole .shdo file accepted by Productions → deploy)
 *   SHOWDUINO_SHDO_PIXEL_SLOTS   16       (pixel clips per pixel device)
 *   SHOWDUINO_SHDO_MAX_DEVICES   32
 *   SHOWDUINO_SHDO_MAX_CUES      512      (clips, and compiled runtime cues)
 *   String buffers (UTF-8 bytes, including the terminating NUL): ID 48, NAME 64, TEXT 128,
 *   AUTHOR 64, params.file 80, effect 24, device type 24, route 32, nodeId 16, JSON keys 32. */
(function () {
  'use strict';

  const LIMITS = Object.freeze({
    maxBytes: 48 * 1024,
    pixelClipsPerDevice: 16,
    maxDevices: 32,
    maxClips: 512,
    maxCompiledCues: 512
  });
  // Maximum UTF-8 bytes the firmware can store for each field (buffer size minus NUL).
  const FIELD = Object.freeze({
    projectId: 47, projectName: 63, projectDescription: 127, projectAuthor: 63,
    clipId: 47, clipName: 63, clipType: 23, targetDeviceId: 47, value: 79, file: 79, effect: 23, secondary: 15,
    deviceId: 47, deviceType: 23, route: 31, nodeId: 15, key: 31
  });

  const utf8 = (value) => new TextEncoder().encode(String(value ?? '')).length;
  const compactJson = (doc) => JSON.stringify(doc);

  function check(doc) {
    const errors = [];
    const warnings = [];
    if (!doc || typeof doc !== 'object') return { ok: false, errors: ['No production to check.'], warnings, stats: {} };

    const tooLong = (label, value, max) => {
      if (value === undefined || value === null || value === '') return;
      const n = utf8(value);
      if (n > max) errors.push(`${label} is ${n} bytes; the P4 accepts at most ${max}. Shorten it.`);
    };

    const bytes = utf8(compactJson(doc));
    if (bytes > LIMITS.maxBytes) {
      errors.push(`The production is ${(bytes / 1024).toFixed(1)} KB; the P4 accepts at most ${LIMITS.maxBytes / 1024} KB. Split it into smaller productions.`);
    }

    const project = doc.project || {};
    tooLong('Show ID', project.id, FIELD.projectId);
    tooLong('Show name', project.name, FIELD.projectName);
    tooLong('Show description', project.description, FIELD.projectDescription);
    tooLong('Show author', typeof project.author === 'string' ? project.author : project.author?.name, FIELD.projectAuthor);

    const devices = Array.isArray(doc.devices) ? doc.devices : [];
    if (devices.length > LIMITS.maxDevices) errors.push(`${devices.length} devices; the P4 accepts at most ${LIMITS.maxDevices}.`);
    devices.forEach((device) => {
      const name = `Device "${String(device.name || device.id || '?').slice(0, 40)}"`;
      tooLong(`${name} ID`, device.id, FIELD.deviceId);
      tooLong(`${name} type`, device.type, FIELD.deviceType);
      tooLong(`${name} route`, device.binding?.route, FIELD.route);
      tooLong(`${name} node ID`, device.binding?.nodeId, FIELD.nodeId);
    });

    const clips = (Array.isArray(doc.clips) ? doc.clips : []).filter((clip) => clip && clip.enabled !== false);
    if ((doc.clips || []).length > LIMITS.maxClips) errors.push(`${doc.clips.length} clips; the P4 accepts at most ${LIMITS.maxClips}.`);

    const pixelsPerDevice = Object.create(null);
    clips.forEach((clip) => {
      const action = clip.action || {};
      const name = `Cue "${String(clip.name || action.label || clip.id || '?').slice(0, 40)}"`;
      tooLong(`${name} ID`, clip.id, FIELD.clipId);
      tooLong(`${name} name`, clip.name, FIELD.clipName);
      tooLong(`${name} type`, clip.type, FIELD.clipType);
      tooLong(`${name} target device`, action.targetDeviceId || clip.targetDeviceId, FIELD.targetDeviceId);
      tooLong(`${name} label`, typeof action.value === 'string' ? action.value : '', FIELD.value);
      const params = Object.assign({}, clip.params || {}, action.params || {});
      tooLong(`${name} sound file name`, params.file, FIELD.file);
      tooLong(`${name} effect`, params.effect, FIELD.effect);
      tooLong(`${name} second colour`, params.secondary, FIELD.secondary);
      const type = String(action.type || clip.type || '').toLowerCase();
      if (type === 'pixel') {
        const device = String(action.targetDeviceId || clip.targetDeviceId || '(unrouted)');
        pixelsPerDevice[device] = (pixelsPerDevice[device] || 0) + 1;
      }
    });
    Object.entries(pixelsPerDevice).forEach(([device, count]) => {
      if (count > LIMITS.pixelClipsPerDevice) {
        errors.push(`${count} pixel cues target "${device}"; the P4 supports at most ${LIMITS.pixelClipsPerDevice} per pixel device. Combine cues or split the show.`);
      }
    });

    // JSON keys longer than the firmware's key buffer make the whole file unreadable.
    const longKeys = new Set();
    (function walk(value, depth) {
      if (depth > 40 || !value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach((item) => walk(item, depth + 1)); return; }
      Object.keys(value).forEach((key) => { if (utf8(key) > FIELD.key) longKeys.add(key); walk(value[key], depth + 1); });
    })(doc, 0);
    if (longKeys.size) errors.push(`Field names too long for the P4: ${Array.from(longKeys).slice(0, 3).join(', ')}.`);

    // Compiled runtime cues: Studio's own compiler gives a close estimate of the P4's.
    let compiledCues = null;
    try {
      const plan = window.ShowduinoDeploy?.compileShdoForStage?.(doc);
      if (plan && Array.isArray(plan.commands)) compiledCues = plan.commands.length;
    } catch (_) { /* estimate unavailable */ }
    if (compiledCues !== null && compiledCues > LIMITS.maxCompiledCues) {
      warnings.push(`About ${compiledCues} runtime cues; the P4 holds at most ${LIMITS.maxCompiledCues}. It may refuse this production.`);
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      stats: { bytes, maxBytes: LIMITS.maxBytes, pixelsPerDevice, devices: devices.length, clips: clips.length, compiledCues }
    };
  }

  window.ShowduinoP4Limits = Object.freeze({ LIMITS, FIELD, check, compactJson });
})();
