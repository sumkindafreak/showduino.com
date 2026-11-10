/* Showduino Studio — functioning Settings and Projects panels (WEB-022/023).
 * No hardware commands are sent from this module. Local projects remain local
 * unless a signed-in user explicitly asks to save to their cloud account.
 */
(function () {
  'use strict';

  const SETTINGS_KEY = 'showduino_settings';
  const SNAP_VALUES = [250, 500, 1000, 2000];
  const AUTOSAVE_VALUES = [0, 1500, 10000, 30000, 60000];
  let cloudRequest = 0;

  function readSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
    catch (error) { console.warn('[Studio Settings] Invalid saved settings', error); }
    const snap = Number(saved.snap);
    const autosaveMs = Number(saved.autosaveMs);
    return {
      theme: saved.theme === 'darker' ? 'darker' : 'dark',
      snap: SNAP_VALUES.includes(snap) ? snap : 1000,
      autosaveMs: AUTOSAVE_VALUES.includes(autosaveMs) ? autosaveMs : 1500
    };
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const darker = theme === 'darker';
    const colours = {
      '--dark-bg': darker ? '#101416' : '',
      '--panel-bg': darker ? '#172025' : '',
      '--border-color': darker ? '#324047' : ''
    };
    Object.keys(colours).forEach((key) => {
      if (darker) root.style.setProperty(key, colours[key]);
      else root.style.removeProperty(key);
    });
  }

  function applySnap(snap) {
    if (window.timelineEditor) window.timelineEditor._snapMs = snap;
    if (window.state?.project) {
      window.state.project.config = window.state.project.config || {};
      window.state.project.config.snapMs = snap;
    }
  }

  function status(id, message, error) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message;
    node.style.color = error ? '#ff8080' : '#7fe8c8';
  }

  function hydrateSettings() {
    const saved = readSettings();
    const theme = document.getElementById('settings-theme');
    const snap = document.getElementById('settings-snap');
    const autosave = document.getElementById('settings-autosave');
    const target = document.getElementById('settings-showduino-target');
    if (theme) theme.value = saved.theme;
    if (snap) snap.value = String(saved.snap);
    if (autosave) autosave.value = String(saved.autosaveMs);
    if (target) target.value = window.ShowduinoDeploy?.getConfiguredTarget?.() || '';
    if (target?.value) status('settings-showduino-target-status', 'Saved address: ' + target.value, false);
  }

  function saveSettings() {
    try {
      const theme = document.getElementById('settings-theme')?.value === 'darker' ? 'darker' : 'dark';
      const snap = Number(document.getElementById('settings-snap')?.value);
      const autosaveMs = Number(document.getElementById('settings-autosave')?.value);
      if (!SNAP_VALUES.includes(snap) || !AUTOSAVE_VALUES.includes(autosaveMs)) {
        throw new Error('Choose a supported snap and autosave interval.');
      }
      const targetInput = document.getElementById('settings-showduino-target');
      if (!window.ShowduinoDeploy?.setConfiguredTarget) throw new Error('Connection settings are still loading.');
      const target = window.ShowduinoDeploy.setConfiguredTarget(targetInput?.value || '');
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme, snap, autosaveMs }));
      applyTheme(theme);
      applySnap(snap);
      window.ShowduinoProjects?.configureAutosave?.(autosaveMs);
      if (target && window.api?.setBaseURL) window.api.setBaseURL(target);
      status('settings-save-status', 'Settings saved on this device.', false);
    } catch (error) {
      status('settings-save-status', error.message, true);
      console.error('[Studio Settings] Save failed', error);
    }
  }

  async function testTarget() {
    const input = document.getElementById('settings-showduino-target');
    if (!input) return;
    try {
      if (!window.ShowduinoDeploy?.setConfiguredTarget) throw new Error('Connection tools are not loaded.');
      window.ShowduinoDeploy.setConfiguredTarget(input.value);
      status('settings-showduino-target-status', 'Checking the Showduino address...', false);
      const found = await window.ShowduinoDeploy.findLocalShowduino();
      if (!found) throw new Error('No Showduino replied. Check the address and network; the public HTTPS Studio may be unable to contact local HTTP devices.');
      if (window.api?.setBaseURL) window.api.setBaseURL(found.baseUrl);
      status('settings-showduino-target-status',
        'Detected: ' + found.baseUrl + (found.importCapable ? ' (P4 timeline import available)' : ' (timeline import not verified)'), false);
    } catch (error) {
      status('settings-showduino-target-status', error.message, true);
    }
  }

  function clearLogs() {
    if (window.state) window.state.logs = [];
    const output = document.querySelector('.terminal-output');
    if (output) output.replaceChildren();
    status('settings-save-status', 'Studio log cleared.', false);
  }

  function clearLegacyAutosave() {
    try {
      localStorage.removeItem('showduino_current_project');
      status('settings-save-status', 'Temporary legacy autosave cleared. Your saved projects were kept.', false);
    } catch (error) {
      status('settings-save-status', error.message, true);
    }
  }

  function clearAllLocalData() {
    if (!window.confirm('This will delete ALL Showduino Studio local shows, settings and saved sign-in sessions in this browser. Cloud shows will remain. Continue?')) return;
    if (window.prompt('Type DELETE to confirm permanent removal:', '') !== 'DELETE') return;
    try {
      localStorage.clear();
      sessionStorage.removeItem('showduino_open_cloud_project');
      window.location.reload();
    } catch (error) {
      status('settings-save-status', error.message, true);
    }
  }

  function projectsMarkup() {
    return '<section class="panel-hauntsync" aria-label="Showduino Projects">' +
      '<div class="control-section"><h2>Projects saved on this device</h2>' +
      '<p class="muted">These shows work offline and are not uploaded without your permission.</p>' +
      '<div id="studio-local-projects" role="region" aria-live="polite">Loading local shows...</div></div>' +
      '<div class="control-section"><h2>Showduino cloud projects</h2>' +
      '<p class="muted">Sign in with Showduino ID to open or sync your cloud shows.</p>' +
      '<div id="studio-cloud-projects" role="region" aria-live="polite">Checking account...</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button type="button" class="btn-secondary" data-project-action="refresh-cloud">Refresh cloud</button>' +
      '<button type="button" class="btn-primary" data-project-action="save-cloud">Save current show to cloud</button>' +
      '<a href="account.html" class="btn-secondary">Account / sign in</a></div></div></section>';
  }

  function message(container, text) {
    container.replaceChildren();
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = text;
    container.appendChild(note);
  }

  function listRows(container, projects, source) {
    container.replaceChildren();
    if (!projects.length) { message(container, source === 'local' ? 'No saved local shows yet.' : 'No cloud shows yet.'); return; }
    projects.forEach((project) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid #344;padding:10px 0';
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:180px';
      const title = document.createElement('strong');
      title.textContent = String(project.name || 'Untitled Show');
      info.appendChild(title);
      const dateValue = project.updatedAt || project.updated_at;
      if (dateValue && !Number.isNaN(new Date(dateValue).getTime())) {
        const small = document.createElement('div');
        small.className = 'muted';
        small.textContent = 'Updated ' + new Date(dateValue).toLocaleString();
        info.appendChild(small);
      }
      const button = document.createElement('button');
      button.className = 'btn-secondary';
      button.type = 'button';
      button.textContent = 'Open';
      button.dataset.projectAction = source === 'local' ? 'open-local' : 'open-cloud';
      button.dataset.projectId = String(project.id || '');
      button.disabled = !project.id;
      row.append(info, button);
      container.appendChild(row);
    });
  }

  function renderLocalProjects() {
    const root = document.getElementById('studio-local-projects');
    if (!root) return;
    try {
      const projects = window.ShowduinoProjects?.listLocalProjects?.() || [];
      listRows(root, projects, 'local');
    } catch (error) { message(root, 'Could not read local shows: ' + error.message); }
  }

  async function renderCloudProjects() {
    const root = document.getElementById('studio-cloud-projects');
    if (!root) return;
    const request = ++cloudRequest;
    const projects = window.ShowduinoProjects;
    if (!projects?.cloudEnabled?.()) { message(root, 'Cloud service unavailable. Local projects are still available.'); return; }
    if (!projects.getCurrentUser?.()) { message(root, 'Not signed in. Use the Account page, then return here.'); return; }
    message(root, 'Loading cloud shows...');
    try {
      const items = await window.ShowduinoSupabase.listProjects();
      if (request === cloudRequest && root.isConnected && projects.getCurrentUser?.()) listRows(root, items, 'cloud');
    } catch (error) {
      if (request === cloudRequest && root.isConnected) message(root, 'Could not load cloud shows: ' + error.message);
    }
  }

  async function projectAction(event) {
    const button = event.target.closest?.('[data-project-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.projectAction;
    const projectId = button.dataset.projectId;
    if (!document.getElementById('studio-local-projects')) return;
    button.disabled = true;
    try {
      if (action === 'open-local') {
        window.ShowduinoProjects.loadLocalProject(projectId);
        await window.loadPanel('timeline-editor');
      } else if (action === 'open-cloud') {
        await window.ShowduinoProjects.loadCloudProject(projectId);
        await window.loadPanel('timeline-editor');
      } else if (action === 'refresh-cloud') {
        await renderCloudProjects();
      } else if (action === 'save-cloud') {
        if (!window.ShowduinoProjects.getCurrentUser?.()) throw new Error('Sign in to save to the cloud.');
        await window.ShowduinoProjects.saveCurrentProject({ cloud: true });
        renderLocalProjects();
        await renderCloudProjects();
      }
    } catch (error) {
      const root = document.getElementById('studio-cloud-projects') || document.getElementById('studio-local-projects');
      if (root) {
        const note = document.createElement('p');
        note.setAttribute('role', 'alert');
        note.textContent = error.message;
        root.prepend(note);
      }
      console.error('[Studio Projects]', error);
    } finally { if (button.isConnected) button.disabled = false; }
  }

  window._saveSettings = saveSettings;
  window._testShowduinoTarget = testTarget;
  window._clearLogs = clearLogs;
  window._clearAutosave = clearLegacyAutosave;
  window._clearAllData = clearAllLocalData;

  window.ShowduinoStudioPanels = Object.freeze({
    projectsMarkup,
    activate: (name) => {
      if (name === 'settings') hydrateSettings();
      if (name === 'hauntsync') { renderLocalProjects(); renderCloudProjects(); }
    }
  });

  document.addEventListener('click', projectAction);
  window.addEventListener('showduino:auth-changed', () => { if (document.getElementById('studio-cloud-projects')) renderCloudProjects(); });
  window.addEventListener('showduino:project-saved', () => { if (document.getElementById('studio-local-projects')) renderLocalProjects(); });
  window.addEventListener('showduino:project-restored', () => { if (document.getElementById('studio-local-projects')) renderLocalProjects(); });
  document.addEventListener('DOMContentLoaded', () => {
    const settings = readSettings();
    applyTheme(settings.theme);
    applySnap(settings.snap);
  });
})();