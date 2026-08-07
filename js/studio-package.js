/* Showduino Studio — stable metadata for exported .shdo production files. */
(function () {
  'use strict';

  const FORMAT_NAME = 'showduino-production';
  const FORMAT_VERSION = 1;

  function ensurePackageMetadata(project) {
    if (!project || typeof project !== 'object') return project;

    project.package = {
      format: FORMAT_NAME,
      version: FORMAT_VERSION,
      ...(project.package && typeof project.package === 'object' ? project.package : {})
    };

    project.package.format = FORMAT_NAME;
    project.package.version = FORMAT_VERSION;
    return project;
  }

  function describe(project) {
    const safe = ensurePackageMetadata(project || {});
    return {
      format: safe.package.format,
      version: safe.package.version,
      name: safe.project?.name || 'Untitled Show',
      tracks: Array.isArray(safe.tracks) ? safe.tracks.length : 0,
      clips: Array.isArray(safe.clips) ? safe.clips.length : 0,
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
