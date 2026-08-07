/* Showduino Studio — creator bootstrap loaded after the existing application. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const project = window.state?.project;
    if (project && window.ShowduinoPackage) {
      window.ShowduinoPackage.ensurePackageMetadata(project);
    }
  });
})();
