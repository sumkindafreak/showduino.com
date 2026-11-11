/* Studio panels backed by the current local-project and Supabase services.
 * These handlers live in a real script: scripts inserted via innerHTML never execute.
 * No hardware control is performed from this module.
 */
(function () {
  'use strict';

  const SETTINGS_KEY = 'showduino_settings';
  const AUTOSAVE_CHOICES = new Set([0, 1500, 10000, 30000, 60000]);
  const byId = (id) => document.getElementById(id);
  /**
   * Write a message to the Studio Log, or the console before the log exists.
   * @param {string} message Text to record.
   * @param {string} [level='INFO'] Studio Log level (INFO, WARN, ERR).
   * @returns {void}
   */
  const info = (message, level = 'INFO') => {
    if (typeof window.studioLog === 'function') window.studioLog(message, level);
    else console.log('[Studio Panels]', message);
  };

  /**
   * Read the Studio settings saved in this browser.
   * @returns {Object} The saved settings, or an empty object when nothing valid is stored.
   */
  function storedSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }

  /**
   * Show a status message in a panel element and copy it to the Studio Log.
   * @param {string} id Element id of the status line.
   * @param {string} message Text to show (set as text, never HTML).
   * @param {boolean} [error=false] True to style and log the message as a warning.
   * @returns {void}
   */
  function panelMessage(id, message, error = false) {
    const element = byId(id);
    if (element) {
      element.textContent = message;
      element.style.color = error ? '#ff7777' : '#00e3b3';
    }
    info(message, error ? 'WARN' : 'INFO');
  }

  /**
   * Apply the chosen Studio theme to the page body.
   * @param {string} value 'darker' for the darker theme; anything else keeps the default.
   * @returns {void}
   */
  function theme(value) {
    document.body.classList.toggle('theme-darker', value === 'darker');
  }

  /**
   * Fill the Settings panel controls from saved settings after the panel is inserted.
   * Unsupported saved values fall back to the defaults. Does nothing when the panel is absent.
   * @returns {void}
   */
  function initSettings() {
    if (!byId('settings-theme')) return;
    const saved = storedSettings();
    byId('settings-theme').value = saved.theme === 'darker' ? 'darker' : 'dark';
    const interval = Number(saved.autosave);
    byId('settings-autosave').value = AUTOSAVE_CHOICES.has(interval) ? String(interval) : '1500';
    const snap = Number(saved.snap);
    byId('settings-snap').value = [250, 500, 1000, 2000].includes(snap) ? String(snap) : '1000';
    const target = window.ShowduinoDeploy?.getConfiguredTarget?.() || '';
    byId('settings-showduino-target').value = target;
    const targetStatus = byId('settings-showduino-target-status');
    if (targetStatus) targetStatus.textContent = target ? 'Saved target: ' + target : 'Automatic discovery is enabled.';
    theme(byId('settings-theme').value);
  }

  /**
   * Validate the Settings panel and save it on this device.
   * Writes the settings and Showduino target to localStorage, applies theme and snap
   * immediately, and dispatches 'showduino:settings-updated' so autosave timers restart.
   * Nothing is saved if any value is unsupported; the reason is shown in the panel.
   * @returns {void}
   */
  function saveSettings() {
    try {
      const themeValue = byId('settings-theme')?.value;
      const autosave = Number(byId('settings-autosave')?.value);
      const snap = Number(byId('settings-snap')?.value);
      const rawTarget = byId('settings-showduino-target')?.value || '';
      if (!['dark', 'darker'].includes(themeValue)) throw new Error('Choose a supported theme.');
      if (!AUTOSAVE_CHOICES.has(autosave)) throw new Error('Choose a supported autosave interval.');
      if (![250, 500, 1000, 2000].includes(snap)) throw new Error('Choose a supported snap interval.');
      if (!window.ShowduinoDeploy) throw new Error('Connection settings are still loading.');
      const validTarget = window.ShowduinoDeploy.normaliseTarget(rawTarget);
      if (rawTarget.trim() && !validTarget) throw new Error('Enter a valid Communications S3 hostname or IP.');

      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: themeValue, autosave, snap }));
      window.ShowduinoDeploy.setConfiguredTarget(rawTarget);
      if (window.timelineEditor) window.timelineEditor._snapMs = snap;
      if (window.state?.project?.config) window.state.project.config.snapMs = snap;
      theme(themeValue);
      window.dispatchEvent(new CustomEvent('showduino:settings-updated', { detail: { autosave, snap, theme: themeValue } }));
      const targetStatus = byId('settings-showduino-target-status');
      if (targetStatus) targetStatus.textContent = validTarget ? 'Saved target: ' + validTarget : 'Automatic discovery is enabled.';
      panelMessage('settings-save-status', 'Settings saved on this device.');
    } catch (error) {
      panelMessage('settings-save-status', error.message, true);
    }
  }

  /**
   * Check whether a Showduino answers at the address typed in Settings.
   * The typed address is used only for this check; the saved target is restored afterwards.
   * No show or hardware command is sent.
   * @returns {Promise<void>}
   */
  async function testTarget() {
    const input = byId('settings-showduino-target');
    if (!input || !window.ShowduinoDeploy) return;
    const oldTarget = window.ShowduinoDeploy.getConfiguredTarget();
    const status = byId('settings-showduino-target-status');
    if (status) status.textContent = 'Checking the Showduino connection…';
    try {
      const target = window.ShowduinoDeploy.normaliseTarget(input.value);
      if (input.value.trim() && !target) throw new Error('Enter a valid Communications S3 hostname or IP.');
      // Temporarily use the typed address for discovery. Testing does not save it.
      window.ShowduinoDeploy.setConfiguredTarget(input.value);
      const found = await window.ShowduinoDeploy.findLocalShowduino();
      if (!found) throw new Error('No compatible Showduino answered. Check Wi-Fi and the address.');
      panelMessage('settings-showduino-target-status',
        'Found ' + found.baseUrl + (found.importCapable ? ' — P4 timeline ready' : ' — timeline upload unavailable'));
    } catch (error) {
      panelMessage('settings-showduino-target-status', error.message, true);
    } finally {
      window.ShowduinoDeploy.setConfiguredTarget(oldTarget);
    }
  }

  /**
   * Empty the Studio Log in memory and on screen.
   * @returns {void}
   */
  function clearLogs() {
    if (window.state) window.state.logs = [];
    document.querySelector('.terminal-output')?.replaceChildren();
    panelMessage('settings-save-status', 'Studio logs cleared.');
  }

  /**
   * Remove the old-format autosave record ('showduino_current_project').
   * Saved shows and their drafts are kept.
   * @returns {void}
   */
  function clearAutosave() {
    // The modern project manager intentionally saves drafts into the same local
    // records as saved shows. Never delete those records through "Clear Autosave".
    const exists = localStorage.getItem('showduino_current_project') !== null;
    localStorage.removeItem('showduino_current_project');
    panelMessage('settings-save-status', exists
      ? 'Old-format autosave removed. Current saved shows were preserved.'
      : 'No old-format autosave exists. Current saved shows were preserved.');
  }

  /**
   * After confirmation, delete everything this site stored in the browser
   * (local shows, settings and sign-in sessions) and reload Studio.
   * @returns {void}
   */
  function clearAllData() {
    if (!window.confirm('Delete ALL Showduino data saved by this browser, including local shows and sign-in sessions? Export every show you want to keep first. This cannot be undone.')) return;
    localStorage.clear();
    panelMessage('settings-save-status', 'Local data cleared. Reloading Studio.');
    window.location.reload();
  }

  /**
   * Format a stored timestamp for the Projects list.
   * @param {string} value ISO timestamp from a saved show.
   * @returns {string} "Last saved …" in the reader's locale, or '' when there is no valid date.
   */
  function readableDate(value) {
    const when = new Date(value || '');
    if (!value || Number.isNaN(when.getTime())) return '';
    return 'Last saved ' + when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  /**
   * Append a titled list of shows, each with an Open button, to the Projects panel.
   * Names and dates are written as text so stored values cannot inject markup.
   * @param {HTMLElement} root Container to append to.
   * @param {string} title Section heading.
   * @param {Array<Object>} records Show records; entries without an id are skipped.
   * @param {'local'|'cloud'} source Where the shows are stored; selects the open action.
   * @returns {void}
   */
  function addProjectSection(root, title, records, source) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    root.appendChild(heading);
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'v4-help';
      empty.textContent = source === 'cloud' ? 'No cloud shows yet.' : 'No shows saved on this device yet.';
      root.appendChild(empty);
      return;
    }
    records.forEach((project) => {
      if (!project?.id) return;
      const row = document.createElement('div');
      row.className = 'v4-card';
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:.4rem 0;';
      const description = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = String(project.name || 'Untitled Show');
      const date = document.createElement('p');
      date.className = 'v4-help';
      date.textContent = readableDate(project.updated_at || project.updatedAt);
      description.append(name, date);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'v4-btn';
      open.textContent = 'Open';
      open.dataset.sdClick = source === 'cloud' ? 'studio-project-open-cloud' : 'studio-project-open-local';
      open.dataset.sdArg = String(project.id);
      const buttons = document.createElement('div');
      buttons.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;';
      buttons.appendChild(open);
      // Only shows on this device that are not open can be deleted from here.
      if (source === 'local' && String(project.id) !== String(window.state?.project?.project?.id || '')) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'v4-btn';
        remove.textContent = 'Delete';
        remove.setAttribute('aria-label', 'Delete ' + String(project.name || 'Untitled Show') + ' from this device');
        remove.dataset.sdClick = 'studio-project-delete-local';
        remove.dataset.sdArg = String(project.id);
        buttons.appendChild(remove);
      }
      row.append(description, buttons);
      root.appendChild(row);
    });
  }

  /**
   * Rebuild the Projects panel: shows on this device, then private cloud shows
   * when cloud access is enabled and a user is signed in. A cloud failure is shown
   * in the panel and leaves the local list in place.
   * @returns {Promise<void>}
   */
  async function refreshProjects() {
    const root = byId('studio-project-list');
    if (!root) return;
    root.textContent = 'Loading projects…';
    const projects = window.ShowduinoProjects;
    if (!projects) { root.textContent = 'Projects are still starting. Try Refresh.'; return; }

    const local = projects.listLocalProjects();
    root.replaceChildren();
    addProjectSection(root, 'Saved on this device', local, 'local');

    if (!projects.cloudEnabled() || !projects.getCurrentUser()) {
      const notice = document.createElement('p');
      notice.className = 'v4-help';
      notice.textContent = 'Cloud projects: sign in from the Account page to see your private shows here. Local shows work without an account.';
      root.appendChild(notice);
      return;
    }
    const cloudStatus = document.createElement('p');
    cloudStatus.className = 'v4-help';
    cloudStatus.textContent = 'Loading private cloud shows…';
    root.appendChild(cloudStatus);
    try {
      const cloud = await window.ShowduinoSupabase.listProjects();
      if (!root.isConnected) return;
      cloudStatus.remove();
      addProjectSection(root, 'Your private cloud', Array.isArray(cloud) ? cloud : [], 'cloud');
    } catch (error) {
      cloudStatus.textContent = 'Could not load cloud shows: ' + error.message;
      info(cloudStatus.textContent, 'WARN');
    }
  }

  /**
   * Open a saved show and switch to the timeline editor.
   * @param {string} id Show id.
   * @param {'local'|'cloud'} source Where the show is stored.
   * @returns {Promise<void>} Failures are reported in the panel and log, not thrown.
   */
  async function openProject(id, source) {
    try {
      if (source === 'cloud') await window.ShowduinoProjects.loadCloudProject(id);
      else window.ShowduinoProjects.loadLocalProject(id);
      info('Opened ' + source + ' show.');
      window.ShowduinoStudioV4?.openPanel?.('timeline-editor');
    } catch (error) {
      info('Could not open show: ' + error.message, 'ERR');
      const status = byId('studio-project-status');
      if (status) status.textContent = error.message;
    }
  }

  /**
   * After confirmation, delete a show saved on this device and refresh the list.
   * @param {string} id Local show id.
   * @returns {Promise<void>}
   */
  async function deleteProject(id) {
    const projects = window.ShowduinoProjects;
    if (!projects?.deleteLocalProject) return;
    const entry = projects.listLocalProjects().find((item) => String(item.id) === String(id));
    const name = String(entry?.name || 'this show');
    if (!window.confirm('Delete "' + name + '" from this device? This cannot be undone. Export it first if you may want it again. Cloud copies are not deleted.')) return;
    try {
      projects.deleteLocalProject(id);
      info('Deleted "' + name + '" from this device.');
      await refreshProjects();
      const status = byId('studio-project-status');
      if (status) status.textContent = 'Deleted "' + name + '" from this device.';
    } catch (error) {
      info('Could not delete show: ' + error.message, 'WARN');
      const status = byId('studio-project-status');
      if (status) status.textContent = error.message;
    }
  }

  window._saveSettings = saveSettings;
  window._testShowduinoTarget = testTarget;
  window._clearLogs = clearLogs;
  window._clearAutosave = clearAutosave;
  window._clearAllData = clearAllData;

  // Action IDs are registered centrally in studio-actions.js, so the audit
  // can verify every control even before this module has initialised.
  window.ShowduinoPanelRuntime = Object.freeze({ initSettings, refreshProjects, openProject, deleteProject });
  theme(storedSettings().theme);
})();
