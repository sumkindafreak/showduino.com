/* Showduino Studio — creator-mode safety and terminology. */
(function () {
  'use strict';

  function stopPreview() {
    // Reset the browser preview only. This must never send live hardware commands.
    if (window.timelineEditor) {
      if (typeof window.timelineEditor.stop === 'function') window.timelineEditor.stop();
      else if (typeof window.timelineEditor.pause === 'function') window.timelineEditor.pause();
    }

    if (window.state) {
      window.state.transport = 'stopped';
      window.state.playhead = 0;
    }

    const playhead = document.querySelector('.playhead');
    if (playhead) playhead.style.left = '0px';

    if (typeof window.studioLog === 'function') window.studioLog('Preview reset. No hardware command was sent.', 'INFO');
    else console.info('[Showduino Studio] Preview reset. No hardware command was sent.');
  }

  async function sendCurrentShow() {
    if (!window.ShowduinoDeploy?.deployCurrentProject) throw new Error('Showduino deployment tools are still starting.');
    return window.ShowduinoDeploy.deployCurrentProject();
  }

  function prepareLegacyCreatorNavigation() {
    // Studio v4 owns its own complete Dashboard/Timeline/Pixel/Audio/Projects/
    // Deploy/Nodes/Diagnostics navigation. Do not rewrite it here.
    if (document.body.classList.contains('studio-v4')) return;

    // Legacy public creator shell behaviour retained for any older page that may
    // still load this file.
    ['live-control', 'devices', 'diagnostics'].forEach((panelName) => {
      const item = document.querySelector(`.sidebar-nav li[data-panel="${panelName}"]`);
      if (item) item.hidden = true;
    });

    const connect = document.querySelector('.sidebar-nav li[data-panel="connect"]');
    if (connect) {
      connect.textContent = 'Send to Showduino';
      connect.classList.remove('locked');
      connect.title = 'Prepare or send this show to your Showduino';
      connect.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try { await sendCurrentShow(); }
        catch (error) { window.alert(`Could not prepare this show for Showduino.\n\n${error.message}`); }
      }, true);
    }

    const playback = document.querySelector('.sidebar-nav li[data-panel="playback"]');
    if (playback) playback.textContent = 'Preview Show';

    const cloud = document.querySelector('.sidebar-nav li[data-panel="hauntsync"]');
    if (cloud) cloud.textContent = 'My Shows / Cloud';
  }

  function prepareResetButton() {
    const resetButton = document.querySelector('.transport-controls .panic');
    if (resetButton) {
      if (!document.body.classList.contains('studio-v4')) resetButton.textContent = 'RESET';
      resetButton.title = 'Reset the browser preview only';
      resetButton.setAttribute('aria-label', 'Reset browser preview');

      // app.js still contains an older hardware PANIC listener. Capture first so
      // the public creator can never accidentally send that legacy command path.
      resetButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopPreview();
      }, true);
    }

    // Retain protection for any legacy preview button rendered inside panels.
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('button');
      if (!button) return;
      const inlineAction = button.getAttribute('onclick') || '';
      const label = (button.textContent || '').toUpperCase();
      if (inlineAction.includes('appStop') && label.includes('PANIC')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopPreview();
      }
    }, true);
  }

  function initialise() {
    document.documentElement.dataset.studioMode = 'creator';
    prepareLegacyCreatorNavigation();
    prepareResetButton();
  }

  window.ShowduinoCreatorMode = Object.freeze({
    stopPreview,
    sendCurrentShow,
    isCreatorMode: () => true
  });

  document.addEventListener('DOMContentLoaded', initialise);
})();
