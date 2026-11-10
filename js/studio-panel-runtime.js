/* Studio panels backed by the current local-project and Supabase services.
 * These handlers live in a real script: scripts inserted via innerHTML never execute.
 * No hardware control is performed from this module.
 */
(function () {
  'use strict';

  const SETTINGS_KEY = 'showduino_settings';
  const AUTOSAVE_CHOICES = new Set([0, 1500, 10000, 30000, 60000]);
  const byId = (id) => document.getElementById(id);
  const info = (message, level = 'INFO') => {
    if (typeof window.studioLog === 'function') window.studioLog(message, level);
    else console.log('[Studio Panels]', message);
  };

  function storedSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }

  function panelMessage(id, message, error = false) {
    const element = byId(id);
    if (element) {
      element.textContent = message;
      element.style.color = error ? '#ff7777' : '#00e3b3';
    }
    info(message, error ? 'WARN' : 'INFO');
  }

  function theme(value) {
    document.body.classList.toggle('theme-darker', value === 'darker');
  }

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

  function clearLogs() {
    if (window.state) window.state.logs = [];
    document.querySelector('.terminal-output')?.replaceChildren();
    panelMessage('settings-save-status', 'Studio logs cleared.');
  }

  function clearAutosave() {
    // The modern project manager intentionally saves drafts into the same local
    // records as saved shows. Never delete those records through "Clear Autosave".
    const exists = localStorage.getItem('showduino_current_project') !== null;
    localStorage.removeItem('showduino_current_project');
    panelMessage('settings-save-status', exists
      ? 'Old-format autosave removed. Current saved shows were preserved.'
      : 'No old-format autosave exists. Current saved shows were preserved.');
  }

  function clearAllData() {
    if (!window.confirm('Delete ALL Showduino data saved by this browser, including local shows and sign-in sessions? Export every show you want to keep first. This cannot be undone.')) return;
    localStorage.clear();
    panelMessage('settings-save-status', 'Local data cleared. Reloading Studio.');
    window.location.reload();
  }

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
      date.textContent = String(project.updated_at || project.updatedAt || '');
      description.append(name, date);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'v4-btn';
      open.textContent = 'Open';
      open.dataset.sdClick = source === 'cloud' ? 'studio-project-open-cloud' : 'studio-project-open-local';
      open.dataset.sdArg = String(project.id);
      row.append(description, open);
      root.appendChild(row);
    });
  }

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

  window._saveSettings = saveSettings;
  window._testShowduinoTarget = testTarget;
  window._clearLogs = clearLogs;
  window._clearAutosave = clearAutosave;
  window._clearAllData = clearAllData;

  // Action IDs are registered centrally in studio-actions.js, so the audit
  // can verify every control even before this module has initialised.
  window.ShowduinoPanelRuntime = Object.freeze({ initSettings, refreshProjects, openProject });
  theme(storedSettings().theme);
})();
