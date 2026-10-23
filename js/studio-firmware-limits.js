/* W005 (W5-03, W5-09): the P4 Show Engine's SHDO limits, mirrored in Studio.
 *
 * The P4 compiles an exported .shdo with protocol/showduino_shdo.h and accepts it for
 * Persist to SD only within protocol/showduino_deploy.h (sumkindafreak/new_showduino,
 * checked against main 0f20522 + firmware PRs #35/#36). A show outside these limits is
 * refused by the P4, so Studio reports it before export instead of at the console.
 * Keep the numbers in step with those headers; tests/studio-firmware-limits.test.cjs
 * holds the cases that were compiled with the real firmware code.
 */
(function () {
  'use strict';

  const LIMITS = Object.freeze({
    fileBytes: 48 * 1024,      // SHOWDUINO_SHDO_MAX_BYTES
    clips: 512,                // SHOWDUINO_SHDO_MAX_CUES (clips parsed)
    cues: 512,                 // SHOWDUINO_SHDO_MAX_CUES (compiled timeline)
    devices: 32,               // SHOWDUINO_SHDO_MAX_DEVICES
    pixelClipsPerDevice: 16,   // SHOWDUINO_SHDO_PIXEL_SLOTS
    nesting: 10                // ShdoJson::skipValue depth
  });

  // Longest string (UTF-8 bytes, excluding the terminator) each parsed field accepts.
  const FIELD_BYTES = Object.freeze({
    'project.id': 47, 'project.name': 63, 'project.description': 127, 'project.author': 63, 'project.version': 23,
    'device.id': 47, 'device.type': 23, 'device.binding.route': 31, 'device.binding.nodeId': 15,
    'clip.id': 47, 'clip.name': 63, 'clip.type': 23, 'clip.targetDeviceId': 47, 'clip.command': 63,
    'action.type': 23, 'action.targetDeviceId': 47, 'action.value': 79,
    'params.file': 79, 'params.asset': 79, 'params.effect': 23, 'params.secondary': 15, 'params.color': 15,
    'params.out': 11, 'params.mode': 11
  });

  // Fields the firmware reads as unsigned 32-bit integers (ShdoJson::u32).
  const U32_PARAMS = new Set(['startPixel', 'length', 'count', 'r', 'g', 'b', 'brightness', 'speed', 'intensity',
    'randomness', 'volume', 'duty', 'pulseMs', 'fadeInMs', 'fadeOutMs']);
  // Fields the firmware reads as JSON true/false (ShdoJson::boolean).
  const BOOL_PARAMS = new Set(['reverse', 'loop', 'blackoutAtEnd', 'safeOff']);
  const U32_MAX = 4294967295;

  const NODE_ID_MAX = 12;
  const AUDIO_FILE_MAX = 63 - 'AUDIO:NODE:PLAY:'.length; // 47

  // Upper bound of compiled cues per clip, from the shdoCompile* functions.
  const CUES_PER_CLIP = Object.freeze({ pixel: 12, audio: 3, mosfet: 3, lamp: 2 });

  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  function utf8Bytes(text) {
    const value = String(text);
    if (encoder) return encoder.encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  // ShdoJson::string accepts only \" \\ \/ \n \r \t escapes. JSON.stringify writes other
  // control characters and lone surrogates as escapes the P4 cannot read.
  function unreadableText(text) {
    const value = String(text);
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code < 0x20 && code !== 0x0a && code !== 0x0d && code !== 0x09) return true;
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        i += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) return true;
    }
    return false;
  }

  function depth(value, level) {
    if (!value || typeof value !== 'object') return level;
    let max = level;
    const items = Array.isArray(value) ? value : Object.values(value);
    for (const item of items) max = Math.max(max, depth(item, level + 1));
    return max;
  }

  function isU32(value) {
    return Number.isInteger(value) && value >= 0 && value <= U32_MAX;
  }

  function label(clip, index) {
    const text = String(clip?.name || clip?.action?.label || '').trim();
    return text ? `"${text.length > 40 ? `${text.slice(0, 40)}…` : text}"` : `clip ${index + 1}`;
  }

  /* Returns { problems: [{field, item, detail}], fileBytes, prettyBytes, compact, estimatedCues,
   * pixelSlots: {deviceId: count} } for a canonical SHDO v2 document. */
  function inspect(doc) {
    const problems = [];
    const add = (field, item, detail) => problems.push({ field, item, detail });
    const text = (path, value, item) => {
      if (value === undefined || value === null) return;
      if (typeof value !== 'string') return;
      const max = FIELD_BYTES[path];
      const bytes = utf8Bytes(value);
      if (max !== undefined && bytes > max) add(path, item, `${path} is ${bytes} bytes; the P4 accepts up to ${max}.`);
      if (unreadableText(value)) add(path, item, `${path} contains a control character the P4 cannot read.`);
    };
    const params = (object, item) => {
      if (!object || typeof object !== 'object') return;
      for (const [key, value] of Object.entries(object)) {
        if (FIELD_BYTES[`params.${key}`] !== undefined) text(`params.${key}`, value, item);
        if (U32_PARAMS.has(key) && value !== undefined && value !== null && value !== '' && !isU32(value)) {
          add(`params.${key}`, item, `params.${key} must be a whole number from 0 to ${U32_MAX} (it is ${JSON.stringify(value)}).`);
        }
        if (BOOL_PARAMS.has(key) && value !== undefined && typeof value !== 'boolean') {
          add(`params.${key}`, item, `params.${key} must be true or false.`);
        }
      }
    };

    const project = doc?.project || {};
    text('project.id', project.id, 'show');
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(project.id || '').toLowerCase())) add('project.id', 'show', 'The show ID may contain only letters, digits, "-" and "_".');
    text('project.name', project.name, 'show');
    if (!String(project.name || '').trim()) add('project.name', 'show', 'The show needs a name.');
    text('project.description', project.description, 'show');
    text('project.author', project.author, 'show');
    if (typeof project.version === 'string') text('project.version', project.version, 'show');

    const devices = Array.isArray(doc?.devices) ? doc.devices : [];
    if (devices.length > LIMITS.devices) add('devices', 'show', `${devices.length} devices; the P4 accepts up to ${LIMITS.devices}.`);
    devices.forEach((device, i) => {
      const item = `device "${device?.id || i + 1}"`;
      text('device.id', device?.id, item);
      text('device.type', device?.type, item);
      text('device.binding.route', device?.binding?.route, item);
      text('device.binding.nodeId', device?.binding?.nodeId, item);
      // Pixel and MOSFET node IDs travel inside node commands (SHOWDUINO_PIXEL_ID_MAX,
      // SHOWDUINO_MOSFET_ID_MAX are 12).
      const route = String(device?.binding?.route || '');
      const nodeId = String(device?.binding?.nodeId || device?.id || '');
      if ((route === 'pixel-node' || route === 'mosfet-node') && utf8Bytes(nodeId) > NODE_ID_MAX) {
        add('device.binding.nodeId', item, `Node ID "${nodeId}" is longer than the ${NODE_ID_MAX} characters a ${route === 'pixel-node' ? 'Pixel' : 'MOSFET'} Node accepts.`);
      }
    });

    const clips = Array.isArray(doc?.clips) ? doc.clips : [];
    if (clips.length > LIMITS.clips) add('clips', 'show', `${clips.length} cues; the P4 accepts up to ${LIMITS.clips}.`);
    const pixelSlots = {};
    let estimatedCues = 0;
    clips.forEach((clip, i) => {
      const item = label(clip, i);
      text('clip.id', clip?.id, item);
      text('clip.name', clip?.name, item);
      text('clip.type', clip?.type, item);
      text('clip.targetDeviceId', clip?.targetDeviceId, item);
      text('clip.command', clip?.command, item);
      if (clip?.enabled !== undefined && typeof clip.enabled !== 'boolean') add('clip.enabled', item, 'enabled must be true or false.');
      for (const key of ['startMs', 'durationMs']) {
        if (clip?.[key] !== undefined && !isU32(clip[key])) add(`clip.${key}`, item, `${key} must be a whole number of milliseconds.`);
      }
      params(clip?.params, item);
      const action = clip?.action;
      if (action && typeof action === 'object') {
        text('action.type', action.type, item);
        text('action.targetDeviceId', action.targetDeviceId, item);
        text('action.value', action.value, item);
        params(action.params, item);
      }
      // "AUDIO:NODE:PLAY:" + file must fit the 63-character command (as js/studio-audio-check.js).
      const audioFile = String(action?.params?.file || clip?.params?.file || (String(clip?.type) === 'audio' ? action?.value || '' : ''));
      if (String(clip?.type || '').toLowerCase() === 'audio' && audioFile && utf8Bytes(audioFile) > AUDIO_FILE_MAX) {
        add('audio.file', item, `Audio file name is ${utf8Bytes(audioFile)} characters; with the play command it must be ${AUDIO_FILE_MAX} or fewer.`);
      }
      if (clip?.enabled === false) return;
      const type = String(clip?.type || '').toLowerCase();
      estimatedCues += clip?.command ? 1 : (CUES_PER_CLIP[type] || 1);
      if (type === 'pixel' && !clip?.command) {
        const device = String(clip?.targetDeviceId || action?.targetDeviceId || '(unbound)');
        pixelSlots[device] = (pixelSlots[device] || 0) + 1;
      }
    });
    Object.entries(pixelSlots).forEach(([device, count]) => {
      if (count > LIMITS.pixelClipsPerDevice) {
        add('pixelSlots', `pixel device "${device}"`, `${count} pixel cues target "${device}"; the P4 has ${LIMITS.pixelClipsPerDevice} segment slots per pixel device. Move some cues to another pixel device or combine effects.`);
      }
    });
    if (estimatedCues > LIMITS.cues) add('cues', 'show', `About ${estimatedCues} runtime cues; the P4 holds up to ${LIMITS.cues}.`);
    if (depth(doc, 0) > LIMITS.nesting + 1) add('nesting', 'show', `The file is nested more than ${LIMITS.nesting} levels deep.`);

    const prettyBytes = utf8Bytes(JSON.stringify(doc, null, 2));
    const compactBytes = utf8Bytes(JSON.stringify(doc));
    const compact = prettyBytes > LIMITS.fileBytes;
    const fileBytes = compact ? compactBytes : prettyBytes;
    if (fileBytes > LIMITS.fileBytes) {
      add('fileBytes', 'show', `The exported file is ${(fileBytes / 1024).toFixed(1)} KB; Persist to SD accepts up to ${LIMITS.fileBytes / 1024} KB. Split the show into shorter productions.`);
    }
    return { problems, fileBytes, prettyBytes, compactBytes, compact, estimatedCues, pixelSlots };
  }

  /* Readiness-panel checks in the Studio v4 format. */
  function checks(doc) {
    const result = inspect(doc);
    const out = [];
    const sizeProblem = result.problems.find((p) => p.field === 'fileBytes');
    out.push({
      level: sizeProblem ? 'error' : 'ok',
      title: 'P4 file size',
      detail: sizeProblem ? sizeProblem.detail
        : `${(result.fileBytes / 1024).toFixed(1)} KB of ${LIMITS.fileBytes / 1024} KB${result.compact ? ' (exported without spacing to fit)' : ''}.`,
      code: sizeProblem ? 'TOO LARGE' : `${Math.round((result.fileBytes / LIMITS.fileBytes) * 100)}%`
    });
    const slots = result.problems.filter((p) => p.field === 'pixelSlots');
    out.push({
      level: slots.length ? 'error' : 'ok',
      title: 'Pixel segment slots',
      detail: slots.length ? slots.map((p) => p.detail).join(' ') : `Each pixel device uses at most ${LIMITS.pixelClipsPerDevice} segment slots.`,
      code: slots.length ? `${slots.length} OVER` : 'OK'
    });
    const other = result.problems.filter((p) => p.field !== 'fileBytes' && p.field !== 'pixelSlots');
    out.push({
      level: other.length ? 'error' : 'ok',
      title: 'P4 compatibility',
      detail: other.length
        ? `${other.length} item${other.length === 1 ? '' : 's'} the P4 would refuse: ${other.slice(0, 3).map((p) => `${p.item}: ${p.detail}`).join(' ')}${other.length > 3 ? ` …and ${other.length - 3} more.` : ''}`
        : 'Names, labels, IDs and numbers fit the P4 Show Engine.',
      code: other.length ? `${other.length} ERR` : 'OK'
    });
    return out;
  }

  /* The text Studio writes for Export .shdo: spaced when it fits, compact when that is
   * what makes it fit the P4's deploy limit. */
  function serialise(doc) {
    const pretty = JSON.stringify(doc, null, 2);
    if (utf8Bytes(pretty) <= LIMITS.fileBytes) return { text: pretty, compact: false };
    return { text: JSON.stringify(doc), compact: true };
  }

  window.ShowduinoFirmwareLimits = Object.freeze({ LIMITS, FIELD_BYTES, inspect, checks, serialise, utf8Bytes });
})();
