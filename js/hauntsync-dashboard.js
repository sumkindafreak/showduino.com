/* global SHOWDUINO_CONFIG, ShowduinoFirebase */
(function () {
  'use strict';

  const PROJECT_INDEX_KEY = 'showduino_local_projects';
  const PROJECT_DATA_PREFIX = 'showduino_project_';
  const DEVICE_KEY = 'showduino_registered_devices';
  const elements = {};
  let currentUser = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function getConfig() {
    return window.SHOWDUINO_CONFIG || { features: {} };
  }

  function cloudEnabled() {
    const features = getConfig().features || {};
    return Boolean(features.firebase && features.authentication && features.cloudSync && window.ShowduinoFirebase);
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return parsed;
    } catch (error) {
      console.warn(`[HauntSync] Could not read ${key}`, error);
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value) {
    if (!value) return 'Not saved yet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
  }

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status-banner${type ? ` ${type}` : ''}`;
  }

  function getProjects() {
    const projects = readJson(PROJECT_INDEX_KEY, []);
    return Array.isArray(projects) ? projects : [];
  }

  function getDevices() {
    const devices = readJson(DEVICE_KEY, []);
    return Array.isArray(devices) ? devices : [];
  }

  function updateStats() {
    const projects = getProjects();
    const devices = getDevices();
    elements.projectCount.textContent = String(projects.length);
    elements.deviceCount.textContent = String(devices.length);
    elements.cloudCount.textContent = currentUser && cloudEnabled() ? 'Ready' : 'Off';
  }

  function renderProjects() {
    const projects = getProjects();
    elements.projectList.innerHTML = '';

    if (!projects.length) {
      elements.projectList.innerHTML = `
        <div class="empty-state">
          <h3>No projects yet</h3>
          <p>Create or import a show in Studio and it will appear here automatically.</p>
          <a class="btn" href="studio.html">Open Studio</a>
        </div>
      `;
      return;
    }

    projects.forEach((project) => {
      const card = document.createElement('article');
      card.className = 'dashboard-item';
      card.innerHTML = `
        <div>
          <div class="dashboard-item-title">${escapeHtml(project.name || 'Untitled Show')}</div>
          <div class="muted">Updated ${escapeHtml(formatDate(project.updatedAt))}</div>
          <div class="button-row" style="margin-top: .8rem;">
            <span class="badge">LOCAL</span>
            ${currentUser && cloudEnabled() ? '<span class="badge">CLOUD READY</span>' : ''}
          </div>
        </div>
        <div class="button-row">
          <a class="btn secondary" href="studio.html">Open Studio</a>
          <button class="btn secondary" type="button" data-export-project="${escapeHtml(project.id)}">Export</button>
          <button class="btn secondary" type="button" data-delete-project="${escapeHtml(project.id)}">Delete</button>
        </div>
      `;
      elements.projectList.appendChild(card);
    });
  }

  function renderDevices() {
    const devices = getDevices();
    elements.deviceList.innerHTML = '';

    if (!devices.length) {
      elements.deviceList.innerHTML = '<p class="muted">No devices registered yet. Add a SUE, IAN, UI or prop controller to build your equipment inventory.</p>';
      return;
    }

    devices.forEach((device) => {
      const item = document.createElement('article');
      item.className = 'dashboard-item';
      item.innerHTML = `
        <div>
          <div class="dashboard-item-title">${escapeHtml(device.name)}</div>
          <div class="muted">${escapeHtml(device.type)} · ${escapeHtml(device.identifier)}</div>
        </div>
        <button class="btn secondary" type="button" data-remove-device="${escapeHtml(device.id)}">Remove</button>
      `;
      elements.deviceList.appendChild(item);
    });
  }

  function exportProject(projectId) {
    const raw = localStorage.getItem(`${PROJECT_DATA_PREFIX}${projectId}`);
    if (!raw) {
      setStatus('That project could not be found in local storage.', 'error');
      return;
    }

    const project = JSON.parse(raw);
    const name = project.project && project.project.name ? project.project.name : 'showduino-project';
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-z0-9-_]+/gi, '_')}.shdo`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${name}.`, 'success');
  }

  function deleteProject(projectId) {
    const projects = getProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!window.confirm(`Delete ${project ? project.name : 'this project'} from this browser?`)) return;

    localStorage.removeItem(`${PROJECT_DATA_PREFIX}${projectId}`);
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(projects.filter((item) => item.id !== projectId)));
    renderProjects();
    updateStats();
    setStatus('Local project deleted.', 'success');
  }

  function addDevice(event) {
    event.preventDefault();
    const name = elements.deviceName.value.trim();
    const type = elements.deviceType.value;
    const identifier = elements.deviceIdentifier.value.trim();
    if (!name || !identifier) return;

    const devices = getDevices();
    devices.unshift({
      id: window.crypto && crypto.randomUUID ? crypto.randomUUID() : `device_${Date.now()}`,
      name,
      type,
      identifier,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(DEVICE_KEY, JSON.stringify(devices));
    elements.deviceForm.reset();
    renderDevices();
    updateStats();
    setStatus(`Registered ${name}.`, 'success');
  }

  function removeDevice(deviceId) {
    const devices = getDevices().filter((device) => device.id !== deviceId);
    localStorage.setItem(DEVICE_KEY, JSON.stringify(devices));
    renderDevices();
    updateStats();
    setStatus('Device removed.', 'success');
  }

  function updateAccountUi(user) {
    currentUser = user;
    if (user) {
      elements.accountName.textContent = user.displayName || 'Showduino Creator';
      elements.accountEmail.textContent = user.email || 'Signed in';
      elements.accountLink.textContent = 'Manage account';
      setStatus('HauntSync account connected. Local projects are ready for cloud sync.', 'success');
    } else {
      elements.accountName.textContent = 'Local workspace';
      elements.accountEmail.textContent = 'Projects and devices are stored in this browser.';
      elements.accountLink.textContent = 'Open account';
      setStatus(cloudEnabled()
        ? 'Sign in to enable cloud project access.'
        : 'HauntSync is running locally. Cloud services remain disabled until launch.');
    }
    renderProjects();
    updateStats();
  }

  function handleProjectActions(event) {
    const exportButton = event.target.closest('[data-export-project]');
    if (exportButton) exportProject(exportButton.dataset.exportProject);

    const deleteButton = event.target.closest('[data-delete-project]');
    if (deleteButton) deleteProject(deleteButton.dataset.deleteProject);
  }

  function handleDeviceActions(event) {
    const removeButton = event.target.closest('[data-remove-device]');
    if (removeButton) removeDevice(removeButton.dataset.removeDevice);
  }

  function initialise() {
    elements.status = byId('hauntsync-status');
    elements.projectList = byId('project-list');
    elements.deviceList = byId('device-list');
    elements.projectCount = byId('project-count');
    elements.deviceCount = byId('device-count');
    elements.cloudCount = byId('cloud-count');
    elements.accountName = byId('account-name');
    elements.accountEmail = byId('account-email');
    elements.accountLink = byId('account-link');
    elements.deviceForm = byId('device-form');
    elements.deviceName = byId('device-name');
    elements.deviceType = byId('device-type');
    elements.deviceIdentifier = byId('device-identifier');

    elements.projectList.addEventListener('click', handleProjectActions);
    elements.deviceList.addEventListener('click', handleDeviceActions);
    elements.deviceForm.addEventListener('submit', addDevice);

    renderProjects();
    renderDevices();
    updateStats();

    if (cloudEnabled()) {
      window.ShowduinoFirebase.onAuthChanged(updateAccountUi);
    } else {
      updateAccountUi(null);
    }

    window.addEventListener('storage', () => {
      renderProjects();
      renderDevices();
      updateStats();
    });
  }

  document.addEventListener('DOMContentLoaded', initialise);
})();
