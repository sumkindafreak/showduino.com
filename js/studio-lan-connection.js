/* Showduino Studio — safe LAN handoff to the user's Communications S3.
 * Public HTTPS Studio cannot silently POST to a local cleartext controller.
 * This module ONLY opens the local console and exports a validated .shdo.
 * The operator explicitly imports/persists it on the P4 from local console.
 * No automatic show start, emergency clear, or hardware command is sent here.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'showduino_target_url';
  const VIEW_PATH = '/#/productions';

  function normaliseLocalTarget(raw) {
    const input = String(raw || '').trim();
    if (!input) return '';
    if (/[\s\\]/.test(input)) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) return '';
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : 'http://' + input);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      const localName = /^(?:[a-z0-9-]+\.)+(?:local|home\.arpa)$/.test(host);
      const nums = host.split('.');
      const ipv4 = nums.length === 4 && nums.every((x) =>
        /^\d{1,3}$/.test(x) && Number(x) <= 255
      );
      const privateIp = ipv4 && (
        Number(nums[0]) === 10 ||
        (Number(nums[0]) === 172 && Number(nums[1]) >= 16 && Number(nums[1]) <= 31) ||
        (Number(nums[0]) === 192 && Number(nums[1]) === 168) ||
        (Number(nums[0]) === 169 && Number(nums[1]) === 254)
      );
      if (!localName && !privateIp) return '';
      // Current S3 console runs on port 80; HTTPS only works with a real local TLS proxy.
      if (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) return '';
      return url.origin;
    } catch (_) { return ''; }
  }

  function getSavedTarget() {
    try { return normaliseLocalTarget(window.localStorage?.getItem(STORAGE_KEY)); }
    catch (_) { return ''; }
  }

  function announce(message, error = false) {
    ['studio-lan-status', 'hauntsync-lan-status'].forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.textContent = message;
      element.dataset.state = error ? 'error' : 'ready';
    });
  }

  function syncFields() {
    const target = getSavedTarget();
    ['studio-lan-address', 'hauntsync-lan-address'].forEach((id) => {
      const input = document.getElementById(id);
      if (input && input !== document.activeElement) input.value = target || '';
    });
    document.querySelectorAll('[data-lan-console-link]').forEach((anchor) => {
      anchor.href = target ? target + VIEW_PATH : '#';
      anchor.setAttribute('aria-disabled', target ? 'false' : 'true');
    });
  }

  function saveTarget(raw) {
    const target = normaliseLocalTarget(raw);
    if (!target) throw new Error('Enter the local IP of your Communications S3, e.g. 192.168.1.50, or showduino.local.');
    // This saves an address, NOT an assertion of network connection.
    window.localStorage?.setItem(STORAGE_KEY, target);
    syncFields();
    announce('Saved ' + target + ' · Not yet verified. Open the console to check its live status.');
    return target;
  }

  function saveFromPage() {
    const input = document.getElementById('studio-lan-address') ||
      document.getElementById('hauntsync-lan-address');
    return saveTarget(input?.value || getSavedTarget());
  }

  function openConsole(target) {
    const base = target || getSavedTarget();
    if (!base) throw new Error('Save the local Communications S3 address first.');
    const url = base + VIEW_PATH;
    const opened = window.open(url, '_blank');
    if (!opened) {
      announce('Your browser blocked a new tab. Use the Open Local Console link instead.', true);
      return false;
    }
    return true;
  }

  function exportAndOpen() {
    // Compile and validate BEFORE navigating to the local device. No local
    // firmware API is called by the public HTTPS browser.
    if (!window.ShowduinoProjects?.exportCurrentProject) {
      throw new Error('Studio is still loading. Try again when your project appears.');
    }
    const base = saveFromPage();
    const project = window.ShowduinoProjects?.ensureProject?.() || window.state?.project;
    if (project && window.ShowduinoPackage?.toShdo && window.ShowduinoPackage?.validateShdo) {
      const check = window.ShowduinoPackage.validateShdo(window.ShowduinoPackage.toShdo(project));
      if (!check.valid) throw new Error(check.errors?.[0] || 'SHDO validation failed.');
    }
    // Open during the user click: waiting for async tasks causes popup blockers.
    const opened = openConsole(base);
    window.ShowduinoProjects.exportCurrentProject();
    announce(opened
      ? 'Downloaded .shdo. In the Local Console, open Productions → Persist SHDO v2, choose the downloaded file, then confirm Persist to SD. The P4 will NOT start automatically.'
      : 'Downloaded .shdo. Open the local console manually, then choose the file under Productions → Persist SHDO v2.');
    return { exported: true, consoleOpened: opened };
  }

  function onAction(event) {
    const control = event.target.closest?.('[data-lan-action]');
    if (!control) return;
    const action = control.dataset.lanAction;
    if (!['save', 'open', 'export-open'].includes(action)) return;
    event.preventDefault();
    try {
      if (action === 'save') saveFromPage();
      if (action === 'open') openConsole(saveFromPage());
      if (action === 'export-open') exportAndOpen();
    } catch (error) {
      announce(error.message, true);
    }
  }

  window.ShowduinoLanConnection = Object.freeze({
    normaliseLocalTarget, getSavedTarget, saveTarget, saveFromPage,
    exportAndOpen, openConsole, syncFields
  });
  document.addEventListener('click', onAction);
  document.addEventListener('submit', (event) => {
    if (event.target.id !== 'hauntsync-lan-form') return;
    event.preventDefault();
    try { saveFromPage(); } catch (error) { announce(error.message, true); }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncFields, { once: true });
  } else syncFields();
})();
