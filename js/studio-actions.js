/* Showduino Studio: CSP-safe actions for generated markup (W005, W5-06).
 *
 * Studio panels used inline handlers such as onclick="window.playAudio()". A
 * Content-Security-Policy that blocks inline script (script-src without 'unsafe-inline')
 * also blocks every one of those, so they are replaced by data attributes:
 *
 *   <button data-sd-click="preview-play">            click
 *   <input  data-sd-change="clip-label" data-sd-arg="<clip id>">   change
 *   <input  data-sd-input="audio-volume">            input
 *
 * Only the names in the table below can run, with the element's data-sd-arg / data-sd-arg2
 * as plain strings. Nothing from the page is ever evaluated as code. Modules that keep
 * private functions (app.js) add their own entries with ShowduinoActions.register().
 */
(function () {
  'use strict';

  const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
  const editor = () => window.timelineEditor;
  const v4 = () => window.ShowduinoStudioV4 || {};
  const int = (value) => parseInt(value, 10);

  const ACTIONS = new Map(Object.entries({
    // Navigation
    'open-panel': (arg) => {
      const target = [...document.querySelectorAll('[data-panel]')].find((el) => el.dataset.panel === arg);
      target?.click();
    },
    'v4-open-panel': (arg) => call(v4().openPanel, arg),
    'reload': () => window.location.reload(),
    'toggle-terminal': () => call(window.toggleTerminal),

    // Transport (browser preview only)
    'preview-play': () => call(editor()?.play?.bind(editor())) || call(window.appPlay),
    'preview-pause': () => call(editor()?.pause?.bind(editor())) || call(window.appPause),
    'preview-stop': () => call(editor()?.stop?.bind(editor())) || call(window.appStop),
    'preview-panic': () => { call(editor()?.stop?.bind(editor())); call(window.appStop); },
    'preview-rewind': () => call(editor()?.rewind?.bind(editor())),
    'preview-loop': () => call(editor()?._toggleLoop?.bind(editor())),
    'seek-to': () => call(window._seekTo),
    'update-bpm': () => call(window._updateBPM),

    // Hardware panels (explicit operator actions)
    'detect-mode': () => window.connectionDetector?.detectMode().then((mode) => window.alert(`Mode: ${mode}`)),
    'scan-wifi': () => call(window._scanWifi),
    'connect-wifi': () => call(window._connectWifi),
    'set-led-line': (arg) => call(window._setLEDLine, int(arg)),
    'clear-led-line': (arg) => call(window._clearLEDLine, int(arg)),
    'set-relay': (arg, arg2) => call(window._setRelay, arg, arg2 === 'true'),
    'set-status-led': () => call(window.setStatusLED),
    'blink-status-led': () => call(window.blinkStatusLED),
    'status-led-off': () => call(window.statusLEDOff),
    'play-audio': () => call(window.playAudio),
    'pause-audio': () => call(window.pauseAudio),
    'stop-audio': () => call(window.stopAudio),
    'audio-volume': (arg, arg2, el) => call(window.api?.setAudioVolume?.bind(window.api), int(el.value)),
    'refresh-devices': () => call(window._refreshDevices),
    'export-diagnostics': () => call(window.exportDiagnostics),
    'test-target': () => call(window._testShowduinoTarget),

    // Projects, settings, legacy account panel
    'export-shdo': () => window.ShowduinoProjects?.exportCurrentProject(),
    'save-project': () => call(window.saveProject),
    'load-cloud-projects': () => call(window._loadCloudProjects),
    'load-project-cloud': (arg) => call(window.loadProject, arg, 'cloud'),
    'save-settings': () => call(window._saveSettings),
    'clear-logs': () => call(window._clearLogs),
    'clear-autosave': () => call(window._clearAutosave),
    'clear-all-data': () => call(window._clearAllData),
    'hs-sign-in': () => call(window._hsSignIn),
    'hs-sign-up': () => call(window._hsSignUp),
    'firebase-sign-out': () => call(window.firebaseAuth?.signOut?.bind(window.firebaseAuth)),
    'firebase-google': () => call(window.firebaseAuth?.signInWithGoogle?.bind(window.firebaseAuth)),

    // Studio v4 panels
    'v4-select-pixel-effect': (arg) => call(v4().selectPixelEffect, arg),
    'v4-exit-sign-template': () => call(v4().applyExitSignTemplate),
    'v4-insert-pixel-clip': () => call(v4().insertPixelLabClip),
    'v4-filter-effects': (arg, arg2, el) => call(v4().filterPixelEffects, el.value),
    'v4-pixel-lab-input': () => call(v4().onPixelLabInput),
    'v4-prepare-deploy': () => call(v4().prepareDeploy),
    'v4-refresh-node-map': () => call(v4().refreshNodeMap),
    'v4-refresh-diagnostics': () => call(v4().refreshDiagnostics),

    // Legacy clip inspector (app.js)
    'clip-label': (arg, arg2, el) => call(window.updateClipLabel, arg, el.value),
    'clip-start': (arg, arg2, el) => call(window.updateClipStart, arg, int(el.value)),
    'clip-duration': (arg, arg2, el) => call(window.updateClipDuration, arg, int(el.value)),
    'restore-autosave': (arg) => call(window.restoreAutosave, arg),
    'load-cloud-project': (arg) => call(window.loadCloudProject, arg)
  }));

  function run(kind, event) {
    const attr = `data-sd-${kind}`;
    const el = event.target?.closest?.(`[${attr}]`);
    if (!el || el.disabled) return;
    const action = ACTIONS.get(el.getAttribute(attr));
    if (!action) {
      console.warn(`[Studio actions] Unknown action "${el.getAttribute(attr)}"`);
      return;
    }
    try {
      const result = action(el.dataset.sdArg ?? '', el.dataset.sdArg2 ?? '', el, event);
      if (result && typeof result.catch === 'function') result.catch((error) => console.error('[Studio actions]', error));
    } catch (error) {
      console.error('[Studio actions]', error);
    }
  }

  document.addEventListener('click', (event) => run('click', event));
  document.addEventListener('change', (event) => run('change', event));
  document.addEventListener('input', (event) => run('input', event));

  function register(entries) {
    Object.entries(entries || {}).forEach(([name, fn]) => {
      if (typeof fn === 'function' && !ACTIONS.has(name)) ACTIONS.set(name, fn);
    });
  }

  window.ShowduinoActions = Object.freeze({ register, has: (name) => ACTIONS.has(name), names: () => [...ACTIONS.keys()] });
})();
