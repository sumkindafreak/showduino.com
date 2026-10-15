/* HauntSync workspace — local-first projects and hardware; optional Supabase identity/cloud. */
(function () {
  'use strict';

  const PROJECT_INDEX_KEY = 'showduino_local_projects';
  const PROJECT_DATA_PREFIX = 'showduino_project_';
  const DEVICE_KEY = 'showduino_registered_devices';
  const elements = {};
  let currentUser = null;
  let cloudProjects = [];
  let cloudState = 'Local';
  let authSequence = 0;

  const byId = (id) => document.getElementById(id);
  const cloudConfigured = () => Boolean(window.ShowduinoSupabase?.enabled());

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function formatDate(value) {
    if (!value) return 'Not saved yet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
  }

  function initials(name) {
    return String(name || 'Creator').trim().split(/\s+/).filter(Boolean)
      .slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'HS';
  }

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = 'status-banner' + (type ? ' ' + type : '');
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
    elements.projectCount.textContent = String(getProjects().length + cloudProjects.length);
    elements.deviceCount.textContent = String(getDevices().length);
    elements.cloudCount.textContent = cloudState;
  }

  function renderProjects() {
    const local = getProjects();
    const cloud = cloudProjects;
    elements.projectList.replaceChildren();

    if (!local.length && !cloud.length) {
      const empty = document.createElement('div');
      empty.className = 'hs-workspace-empty';
      empty.innerHTML = '<h3>No projects yet</h3><p>Build a show in Studio, or sign in to access shows saved to your Showduino account.</p><a class="btn" href="studio.html">Create your first show</a>';
      elements.projectList.append(empty);
      return;
    }

    // Cloud entries remain distinct from local copies: never silently replace a saved local show.
    cloud.forEach((project) => {
      const item = document.createElement('article');
      item.className = 'dashboard-item';
      item.innerHTML = '<div><div class="dashboard-item-title">' + escapeHtml(project.name || 'Untitled Show') +
        '</div><div class="muted">Updated ' + escapeHtml(formatDate(project.updated_at)) +
        '</div><span class="hs-tag cloud">CLOUD SHOW</span></div>' +
        '<div class="button-row"><button type="button" class="btn secondary" data-open-cloud="' + escapeHtml(project.id) +
        '">Open in Studio</button></div>';
      elements.projectList.append(item);
    });

    local.forEach((project) => {
      const item = document.createElement('article');
      item.className = 'dashboard-item';
      item.innerHTML = '<div><div class="dashboard-item-title">' + escapeHtml(project.name || 'Untitled Show') +
        '</div><div class="muted">Updated ' + escapeHtml(formatDate(project.updatedAt)) +
        '</div><span class="hs-tag">THIS BROWSER</span></div>' +
        '<div class="button-row"><button type="button" class="btn secondary" data-open-local="' + escapeHtml(project.id) +
        '">Open in Studio</button><button type="button" class="btn secondary" data-export-project="' +
        escapeHtml(project.id) + '">Export .shdo</button><button type="button" class="btn secondary" data-delete-project="' +
        escapeHtml(project.id) + '">Delete local</button></div>';
      elements.projectList.append(item);
    });
  }

  function renderDevices() {
    const devices = getDevices();
    elements.deviceList.replaceChildren();
    if (!devices.length) {
      elements.deviceList.innerHTML = '<div class="hs-workspace-empty"><h3>No hardware registered yet</h3><p>Add your Director, Comms Controller, P4 Show Engine or specialist nodes to keep a private inventory in this browser.</p></div>';
      return;
    }
    devices.forEach((device) => {
      const item = document.createElement('article');
      item.className = 'dashboard-item';
      item.innerHTML = '<div><div class="dashboard-item-title">' + escapeHtml(device.name) +
        '</div><div class="muted">' + escapeHtml(device.type) + ' · ' + escapeHtml(device.identifier) +
        '</div><span class="hs-tag">LOCAL INVENTORY</span></div>' +
        '<button class="btn secondary" type="button" data-remove-device="' + escapeHtml(device.id) + '">Remove</button>';
      elements.deviceList.append(item);
    });
  }

  function exportProject(projectId) {
    const raw = localStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!raw) return setStatus('This browser no longer has that show file.', 'error');
    let project;
    try { project = JSON.parse(raw); } catch (_) { return setStatus('The saved show is not valid JSON.', 'error'); }
    const name = project?.project?.name || 'showduino-project';
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name.replace(/[^a-z0-9-_]+/gi, '_') + '.shdo';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus('Exported ' + name + '. Save this file somewhere safe.', 'success');
  }

  function deleteProject(projectId) {
    const projects = getProjects();
    const record = projects.find((item) => item.id === projectId);
    if (!record) return setStatus('Project not found.', 'error');
    if (!window.confirm('Permanently delete the LOCAL copy of "' + (record.name || 'Untitled Show') + '" from this browser? Cloud copies are not affected.')) return;
    localStorage.removeItem(PROJECT_DATA_PREFIX + projectId);
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(projects.filter((item) => item.id !== projectId)));
    renderProjects(); updateStats();
    setStatus('Local show deleted. A cloud copy, if any, was not changed.', 'success');
  }

  function addDevice(event) {
    event.preventDefault();
    const name = elements.deviceName.value.trim();
    const type = elements.deviceType.value;
    const identifier = elements.deviceIdentifier.value.trim();
    if (!name || !identifier) return;
    const devices = getDevices();
    devices.unshift({
      id: window.crypto?.randomUUID?.() || 'device_' + Date.now(),
      name, type, identifier, createdAt: new Date().toISOString()
    });
    localStorage.setItem(DEVICE_KEY, JSON.stringify(devices));
    elements.deviceForm.reset();
    renderDevices(); updateStats();
    setStatus('Saved "' + name + '" to this browser’s inventory. This does not pair or connect to the hardware.', 'success');
  }

  function removeDevice(deviceId) {
    const devices = getDevices();
    const item = devices.find((device) => device.id === deviceId);
    if (!item || !window.confirm('Remove ' + item.name + ' from this browser’s inventory?')) return;
    localStorage.setItem(DEVICE_KEY, JSON.stringify(devices.filter((device) => device.id !== deviceId)));
    renderDevices(); updateStats(); setStatus('Local hardware entry removed.', 'success');
  }

  function handleProjectActions(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.openCloud) {
      // Studio consumes this one-use ID and loads the authenticated cloud production.
      sessionStorage.setItem('showduino_open_cloud_project', button.dataset.openCloud);
      window.location.assign('studio.html');
    } else if (button.dataset.openLocal) {
      localStorage.setItem('showduino_active_project_id', button.dataset.openLocal);
      window.location.assign('studio.html');
    } else if (button.dataset.exportProject) exportProject(button.dataset.exportProject);
    else if (button.dataset.deleteProject) deleteProject(button.dataset.deleteProject);
  }

  function handleDeviceActions(event) {
    const button = event.target.closest('button[data-remove-device]');
    if (button) removeDevice(button.dataset.removeDevice);
  }

  async function updateAccount(user) {
    const seq = ++authSequence;
    currentUser = user;
    cloudProjects = [];
    cloudState = !cloudConfigured() ? 'Local only' : user ? 'Checking' : 'Sign in';
    const name = user?.user_metadata?.display_name || 'Showduino Creator';

    elements.accountName.textContent = user ? name : 'Your creative workspace';
    elements.accountEmail.textContent = user?.email || 'Projects and hardware stay in this browser unless you save shows to the cloud.';
    elements.accountLink.textContent = user ? 'Edit creator profile' : 'Create a Showduino ID';
    elements.accountLink.href = user ? 'profile.html' : 'account.html';
    elements.workspaceTitle.textContent = user ? 'Welcome back, ' + name : 'A workspace for every creator';
    elements.workspaceDescription.textContent = user
      ? 'Your browser projects are below. Checking your Showduino cloud library…'
      : 'Create shows in Studio now, or make a Showduino ID to use your cloud library and creator profile.';
    elements.workspaceAvatar.textContent = initials(name);
    renderProjects(); updateStats();

    if (!user || !cloudConfigured()) {
      setStatus(user ? 'Cloud integration is disabled. Your local shows remain available.' :
        'Local workspace ready. Sign in for a private creator profile and cloud shows.');
      return;
    }

    try {
      // The account page and Studio already use this same Supabase service.
      const [cloud, profile] = await Promise.all([
        window.ShowduinoSupabase.listProjects(),
        window.ShowduinoSupabase.getProfile().catch(() => null)
      ]);
      if (seq !== authSequence) return;
      cloudProjects = cloud;
      cloudState = 'Ready';
      const displayName = profile?.display_name || name;
      elements.accountName.textContent = displayName;
      elements.workspaceTitle.textContent = 'Welcome back, ' + displayName;
      elements.workspaceAvatar.textContent = initials(displayName);
      elements.workspaceDescription.textContent = 'Your productions and devices, together in one workspace.';
      renderProjects(); updateStats();
      setStatus('Workspace loaded. Cloud shows are available; hardware inventory remains local to this browser.', 'success');
    } catch (error) {
      if (seq !== authSequence) return;
      cloudState = 'Unavailable';
      renderProjects(); updateStats();
      setStatus('Cloud projects could not be loaded (' + (error?.message || 'service unavailable') +
        '). Your local shows and hardware inventory are still available.', 'error');
    }
  }

  function initialise() {
    const keys = ['status','projectList','deviceList','projectCount','deviceCount','cloudCount',
      'accountName','accountEmail','accountLink','deviceForm','deviceName','deviceType',
      'deviceIdentifier','workspaceTitle','workspaceDescription','workspaceAvatar'];
    const idMap = {
      status:'hauntsync-status', projectList:'project-list', deviceList:'device-list',
      projectCount:'project-count', deviceCount:'device-count', cloudCount:'cloud-count',
      accountName:'account-name', accountEmail:'account-email', accountLink:'account-link',
      deviceForm:'device-form', deviceName:'device-name', deviceType:'device-type',
      deviceIdentifier:'device-identifier', workspaceTitle:'hs-workspace-title',
      workspaceDescription:'hs-workspace-description', workspaceAvatar:'hs-workspace-avatar'
    };
    for (const key of keys) {
      elements[key] = byId(idMap[key]);
      if (!elements[key]) throw new Error('HauntSync missing element: ' + idMap[key]);
    }
    elements.projectList.addEventListener('click', handleProjectActions);
    elements.deviceList.addEventListener('click', handleDeviceActions);
    elements.deviceForm.addEventListener('submit', addDevice);
    renderProjects(); renderDevices(); updateStats();

    if (cloudConfigured()) window.ShowduinoSupabase.onAuthChanged(updateAccount);
    else updateAccount(null);

    window.addEventListener('storage', (event) => {
      if ([PROJECT_INDEX_KEY, DEVICE_KEY].includes(event.key)) {
        renderProjects(); renderDevices(); updateStats();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initialise);
})();
