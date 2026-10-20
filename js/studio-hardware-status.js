/* Hardware reachability is independent of account, internet and browser preview. */
(function () {
  'use strict';
  let checking = false;
  function render(connected, target) {
    const status = document.querySelector('.connection-status');
    if (status) {
      status.className = 'connection-status ' + (connected ? 'lan' : 'offline');
      status.textContent = connected ? 'S3 CONNECTED' : 'HARDWARE NOT VERIFIED';
      status.title = connected ? 'Showduino Communications S3 responded at ' + target
        : 'Save the Communications S3 address in Deploy or Settings. A saved address, internet access or cloud sign-in does not verify hardware. Browser restrictions can prevent verification; check the Local Console.';
    }
    // S3 reachability does not establish P4 runtime or safety state.
    const p4 = document.querySelector('.runtime-authority-chip');
    if (p4) {
      p4.textContent = 'P4 · NOT VERIFIED';
      p4.title = 'P4 runtime status is not verified here. Check the Showduino Local Console.';
    }
  }
  async function refresh() {
    if (checking) return;
    checking = true;
    render(false);
    let target = '';
    try {
      target = window.ShowduinoLanConnection?.getSavedTarget() ||
        window.ShowduinoLanConnection?.normaliseLocalTarget(window.location.origin) || '';
      if (!target) return;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch(target + '/api/studio-timeline', {
          signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' }
        });
        const payload = response.ok ? await response.json() : null;
        // Never accept an arbitrary successful page, mock API or cloud response.
        const connected = payload?.capability === 'studio-ram-timeline-upload' && payload?.state === 'ready';
        const current = window.ShowduinoLanConnection?.getSavedTarget() ||
          window.ShowduinoLanConnection?.normaliseLocalTarget(window.location.origin) || '';
        if (target === current) render(connected, target);
      } finally { window.clearTimeout(timer); }
    } catch (_) { render(false); }
    finally { checking = false; }
  }
  window.ShowduinoHardwareStatus = Object.freeze({ refresh });
  document.addEventListener('DOMContentLoaded', () => {
    render(false);
    refresh();
    window.setInterval(refresh, 10000);
  });
  window.addEventListener('offline', () => render(false));
  window.addEventListener('storage', () => { render(false); refresh(); });
})();
