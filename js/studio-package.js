/* Showduino Studio — stable metadata for exported .shdo production files. */
(function () {
  'use strict';

  const FORMAT_NAME = 'showduino-production';
  const FORMAT_VERSION = 2;

  function ensurePackageMetadata(project) {
    if (!project || typeof project !== 'object') return project;

    project.package = {
      format: FORMAT_NAME,
      version: FORMAT_VERSION,
      architecture: 'director-comms-p4-nodes',
      runtimeAuthority: 'esp32-p4-show-engine',
      ...(project.package && typeof project.package === 'object' ? project.package : {})
    };

    project.package.format = FORMAT_NAME;
    project.package.version = FORMAT_VERSION;
    project.package.architecture = 'director-comms-p4-nodes';
    project.package.runtimeAuthority = 'esp32-p4-show-engine';
    return project;
  }

  function describe(project) {
    const safe = ensurePackageMetadata(project || {});
    return {
      format: safe.package.format,
      version: safe.package.version,
      architecture: safe.package.architecture,
      runtimeAuthority: safe.package.runtimeAuthority,
      name: safe.project?.name || 'Untitled Show',
      tracks: Array.isArray(safe.tracks) ? safe.tracks.length : 0,
      clips: Array.isArray(safe.clips) ? safe.clips.length : 0,
      pixelClips: Array.isArray(safe.clips) ? safe.clips.filter((clip) => clip.type === 'pixel').length : 0,
      routedClips: Array.isArray(safe.clips) ? safe.clips.filter((clip) => String(clip.routing?.nodeId || '').trim()).length : 0,
      scenes: Array.isArray(safe.scenes) ? safe.scenes.length : 0
    };
  }

  window.ShowduinoPackage = Object.freeze({
    FORMAT_NAME,
    FORMAT_VERSION,
    ensurePackageMetadata,
    describe
  });
})();
