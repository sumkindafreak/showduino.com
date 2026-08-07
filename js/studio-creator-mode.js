/* Showduino Studio — public creator mode safety and terminology. */
(function () {
  'use strict';

  function stopPreview() {
    // Stop the public Studio preview only. This must never send live hardware commands.
    if (window.timelineEditor) {
      if (typeof window.timelineEditor.stop === 'function') {
        window.timelineEditor.stop();
      } else if (typeof window.timelineEditor.pause === 'function') {
        window.timelineEditor.pause();
      }
    }

    if (window.state) {
      window.state.transport = 'stopped';
      window.state.playhead = 0;
    }

    const playhead = document.querySelector('.playhead');
    if (playhead) playhead.style.left = '0px';

    if (typeof window.studioLog === 'function') {
      window.studioLog('Preview reset. No hardware command was sent.', 'INFO');
    }
  }

  function prepareCreatorNavigation() {
    // The public website is for building shows. Hardware engineering pages stay on the local Showduino Studio.
    ['live-control', 'devices', 'diagnostics'].forEach((panelName) => {
      const item = document.querySelector(`.sidebar-nav li[data-panel="${panelName}"]`);
      if (item) item.hidden = true;
    });

    const connect = document.querySelector('.sidebar-nav li[data-panel="connect"]');
    if (connect) {
      connect.textContent = 'Send to Showduino';
      // Deployment/export is part of the creator workflow, not a paid live-control feature.
      connect.classList.remove('locked');
      connect.title = 'Prepare or send this show to your Showduino';
    }

    const playback = document.querySelector('.sidebar-nav li[data-panel="playback"]');
    if (playback) playback.textContent = 'Preview Show';

    const cloud = document.querySelector('.sidebar-nav li[data-panel="hauntsync"]');
    if (cloud) cloud.textContent = 'My Shows / Cloud';
  }

  function prepareResetButton() {
    const resetButton = document.querySelector('.transport-controls .panic');
    if (!resetButton) return;

    resetButton.textContent = 'RESET';
    resetButton.title = 'Reset the browser preview only';
    resetButton.setAttribute('aria-label', 'Reset browser preview');

    // app.js contains an older hardware PANIC listener. Capture the click first and stop it here.
    resetButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopPreview();
    }, true);
  }

  function initialise() {
    document.documentElement.dataset.studioMode = 'creator';
    prepareCreatorNavigation();
    prepareResetButton();
  }

  window.ShowduinoCreatorMode = Object.freeze({
    stopPreview,
    isCreatorMode: () => true
  });

  document.addEventListener('DOMContentLoaded', initialise);
})();
