/* HauntSync public SHDO template model — pure transformations, no automatic deployment. */
(function () {
  'use strict';

  const MAX_INPUT_BYTES = 512 * 1024;
  const MAX_PUBLIC_BYTES = 256 * 1024;
  const SCHEMA = 'showduino-production-v2';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function text(value, max = 120) { return String(value == null ? '' : value).slice(0, max); }
  function safeValue(value, depth = 0) {
    if (depth > 8) return null;
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      if (/https?:\/\/|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(value)) return '';
      return text(value, 1000);
    }
    if (Array.isArray(value)) return value.slice(0, 2000).map((item) => safeValue(item, depth + 1));
    if (typeof value === 'object') {
      const clean = {};
      for (const [key, item] of Object.entries(value)) {
        if (/(?:secret|token|password|ssid|mac|serial|credential|host|ipaddress|deviceaddress|webhook|endpoint|url|path|file|api_key|apikey)/i.test(key)) continue;
        if (key.length > 80 || key === '__proto__' || key === 'constructor') continue;
        clean[key] = safeValue(item, depth + 1);
      }
      return clean;
    }
    return null;
  }

  function validate(document) {
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw Error('Choose a canonical SHDO v2 production.');
    if (document.schema !== SCHEMA || document.package?.format !== 'showduino-production' ||
        Number(document.package?.version) !== 2) throw Error('Only Studio-exported SHDO v2 productions can be shared.');
    if (document.architecture?.runtimeAuthority !== 'esp32-p4-show-engine' ||
        document.architecture?.nodeAddressing !== 'logical-device-id' ||
        document.safety?.runtimeAuthority !== 'esp32-p4-show-engine' ||
        document.safety?.policy !== 'firmware-authoritative') {
      throw Error('This production has an unsupported runtime or safety policy.');
    }
    const stop = document.safety?.emergency;
    if (stop?.stopTimeline !== true || stop?.pixelOverride !== 'all-white' ||
        stop?.requiresManualClear !== true || stop?.autoResume !== false ||
        stop?.productionCannotDisable !== true) throw Error('Emergency safety contract is invalid.');
    for (const field of ['devices','tracks','clips','markers','scenes','assets']) {
      if (!Array.isArray(document[field])) throw Error(field + ' must be an array.');
    }
    if (document.clips.length > 3000 || document.devices.length > 256) throw Error('The show is too large for community templates.');
    return true;
  }

  function randomUuid() {
    const value = globalThis.crypto?.randomUUID?.();
    if (!value || !UUID.test(value)) throw Error('Sharing requires a secure browser.');
    return value;
  }

  function makeTemplate(source, name, description) {
    validate(source);
    const nextId = randomUuid();
    const devices = source.devices.map((device, index) => ({
      id: 'shared-device-' + (index + 1),
      name: text(device?.type || 'Device', 44) + ' ' + (index + 1),
      type: text(device?.type || 'custom', 60),
      enabled: device?.enabled !== false,
      binding: { route: text(device?.binding?.route || 'unbound', 60) },
      capabilities: safeValue(device?.capabilities || {}),
      metadata: {}
    }));
    const deviceIds = new Map(source.devices.map((dev, index) => [String(dev?.id || ''), devices[index].id]));
    const mapDevice = (value) => deviceIds.get(String(value || '')) || '';
    const tracks = source.tracks.map((track, i) => ({
      id: text(track?.id || 'track-' + i, 80),
      name: text(track?.name || 'Track', 120),
      type: text(track?.type || 'mixed', 40),
      enabled: track?.enabled !== false,
      locked: track?.locked === true,
      order: Number.isFinite(track?.order) ? track.order : i,
      ...(mapDevice(track?.targetDeviceId) ? { targetDeviceId: mapDevice(track.targetDeviceId) } : {})
    }));
    const clips = source.clips.map((clip, i) => {
      const linked = mapDevice(clip?.targetDeviceId || clip?.action?.targetDeviceId);
      const action = clip?.action || {};
      return {
        id: text(clip?.id || 'clip-' + i, 80),
        trackId: text(clip?.trackId, 80),
        sceneId: text(clip?.sceneId, 80),
        cueId: text(clip?.cueId, 80),
        name: text(clip?.name || action.label || 'Clip', 140),
        type: text(clip?.type || action.type || 'custom', 60),
        startMs: Math.max(0, Number(clip?.startMs) || 0),
        durationMs: Math.max(0, Number(clip?.durationMs) || 0),
        enabled: clip?.enabled !== false,
        ...(linked ? { targetDeviceId: linked } : {}),
        action: {
          type: text(action.type || clip?.type || 'custom', 60),
          label: text(action.label || clip?.name || 'Clip', 140),
          ...(linked ? { targetDeviceId: linked } : {}),
          delayMs: 0,
          durationMs: Math.max(0, Number(action.durationMs ?? clip?.durationMs) || 0),
          value: '',
          notes: '',
          params: safeValue(action.params || {})
        }
      };
    });
    const scenes = source.scenes.map((scene, i) => ({
      id: text(scene?.id || 'scene-' + i, 80),
      name: text(scene?.name || 'Scene', 140),
      description: '',
      order: Number.isFinite(scene?.order) ? scene.order : i,
      cues: (Array.isArray(scene?.cues) ? scene.cues : []).map((cue, j) => ({
        id: text(cue?.id || 'cue-' + j, 80),
        name: text(cue?.name || 'Cue', 140),
        trigger: text(cue?.trigger || 'Timeline', 60),
        notes: '',
        clipIds: Array.isArray(cue?.clipIds) ? cue.clipIds.map(v => text(v, 80)) : []
      }))
    }));
    const packageMeta = {
      schema: SCHEMA,
      project: {
        id: nextId,
        name: text(name, 100),
        description: text(description, 500),
        version: '2.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bpm: Number(source.project?.bpm) > 0 ? Number(source.project.bpm) : 120,
        duration: Math.max(1, Number(source.project?.duration) || 300000)
      },
      architecture: { version: 1, creator: 'showduino-studio',
        runtimeAuthority: 'esp32-p4-show-engine', operator: 'esp32-s3-director',
        transport: 'esp32-s3-comms-controller', nodeAddressing: 'logical-device-id' },
      compatibility: { shdoMajor: 2, minimumStudioVersion: '2.0.0', minimumRuntimeProtocol: 1 },
      devices, tracks, clips,
      markers: source.markers.map((marker, i) => ({
        id: text(marker?.id || 'marker-' + i, 80),
        name: text(marker?.name || 'Marker', 140),
        timeMs: Math.max(0, Number(marker?.timeMs) || 0)
      })),
      scenes,
      assets: [], // Audio and other local assets are never bundled or exposed.
      safety: {
        runtimeAuthority: 'esp32-p4-show-engine', policy: 'firmware-authoritative',
        emergency: { stopTimeline: true, pixelOverride: 'all-white', requiresManualClear: true,
          autoResume: false, productionCannotDisable: true }
      },
      globalSettings: {},
      config: { snapEnabled: source.config?.snapEnabled !== false,
        snapMs: Math.max(1, Number(source.config?.snapMs) || 1000),
        gridEnabled: source.config?.gridEnabled !== false,
        zoom: Number(source.config?.zoom) > 0 ? Number(source.config.zoom) : 0.1 },
      package: { format: 'showduino-production', version: 2,
        architecture: 'director-comms-p4-nodes', runtimeAuthority: 'esp32-p4-show-engine' },
      metadata: { communityTemplate: true, requiresHardwareRebinding: true,
        requiresMediaRelinking: true, autoRun: false }
    };
    validate(packageMeta);
    if (new TextEncoder().encode(JSON.stringify(packageMeta)).length > MAX_PUBLIC_BYTES) {
      throw Error('The sanitised production exceeds the 256 KB community limit.');
    }
    return packageMeta;
  }

  function prepare(raw, name, description) {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_INPUT_BYTES) {
      throw Error('Choose a .shdo file no larger than 512 KB.');
    }
    if (String(name).trim().length < 3 || String(name).trim().length > 100) throw Error('Title must be 3–100 characters.');
    if (String(description).length > 500) throw Error('Description must be under 500 characters.');
    let source;
    try { source = JSON.parse(raw); } catch (_) { throw Error('The .shdo file is not valid JSON.'); }
    return makeTemplate(source, String(name).trim(), String(description).trim());
  }

  function cloneDownload(document) {
    validate(document);
    const copy = JSON.parse(JSON.stringify(document));
    copy.project.id = randomUuid(); // A community download cannot reuse the publisher's project ID.
    copy.project.createdAt = new Date().toISOString();
    copy.project.updatedAt = copy.project.createdAt;
    copy.metadata = { communityTemplate: true, requiresHardwareRebinding: true,
      requiresMediaRelinking: true, autoRun: false };
    return copy;
  }

  window.HauntSyncShare = Object.freeze({
    MAX_INPUT_BYTES, MAX_PUBLIC_BYTES, validate, prepare, cloneDownload
  });
})();
