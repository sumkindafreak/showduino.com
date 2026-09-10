/* global ShowduinoSupabase */
(function () {
  'use strict';

  const PROJECT_INDEX_KEY = 'showduino_local_projects';
  const PROJECT_DATA_PREFIX = 'showduino_project_';
  const ACTIVE_PROJECT_KEY = 'showduino_active_project_id';
  const AUTOSAVE_INTERVAL_MS = 1500;

  let currentUser = null;
  let pendingCloudOpenHandled = false;
  let lastAutosavePayload = '';
  let autosaveTimer = 0;

  function getState() { return window.state || null; }

  function cloudEnabled() {
    return Boolean(window.ShowduinoSupabase?.enabled());
  }

  function createProjectId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return '00000000-0000-4000-8000-000000000000';
  }

  function validatePackage(project) {
    if (!project || typeof project !== 'object') throw new Error('This is not a valid Showduino project file.');

    if (project.schema === window.ShowduinoPackage?.SCHEMA_NAME) {
      const result = window.ShowduinoPackage.validateShdo(project);
      if (!result.valid) throw new Error(result.errors[0] || 'Invalid SHDO v2 production.');
      return true;
    }

    if (!project.package) return true;
    const expectedFormat = window.ShowduinoPackage?.FORMAT_NAME || 'showduino-production';
    const supportedVersion = window.ShowduinoPackage?.FORMAT_VERSION || 1;
    if (project.package.format && project.package.format !== expectedFormat) throw new Error(`Unsupported project format: ${project.package.format}`);
    const version = Number(project.package.version || 1);
    if (!Number.isFinite(version) || version < 1) throw new Error('The .shdo file has an invalid format version.');
    if (version > supportedVersion) throw new Error(`This show was created by a newer Showduino Studio (file version ${version}).`);
    return true;
  }

  function normaliseProject(project) {
    validatePackage(project || {});
    const now = new Date().toISOString();
    let safeProject = project && typeof project === 'object' ? project : {};

    if (safeProject.schema === window.ShowduinoPackage?.SCHEMA_NAME && window.ShowduinoPackage?.fromShdo) {
      safeProject = window.ShowduinoPackage.fromShdo(safeProject);
    }

    const metadata = safeProject.project && typeof safeProject.project === 'object' ? safeProject.project : {};
    const normalised = {
      ...safeProject,
      project: {
        id: metadata.id || createProjectId(),
        name: metadata.name || 'Untitled Show',
        description: metadata.description || '',
        version: metadata.version || '2.0.0',
        createdAt: metadata.createdAt || now,
        updatedAt: metadata.updatedAt || now,
        bpm: Number(metadata.bpm) > 0 ? Number(metadata.bpm) : 120,
        duration: Number(metadata.duration) > 0 ? Math.round(Number(metadata.duration)) : 300000,
        ...metadata
      },
      devices: Array.isArray(safeProject.devices) ? safeProject.devices : [],
      scenes: Array.isArray(safeProject.scenes) ? safeProject.scenes : [],
      tracks: Array.isArray(safeProject.tracks) ? safeProject.tracks : [],
      clips: Array.isArray(safeProject.clips) ? safeProject.clips : [],
      markers: Array.isArray(safeProject.markers) ? safeProject.markers : [],
      globalSettings: safeProject.globalSettings && typeof safeProject.globalSettings === 'object' ? safeProject.globalSettings : {},
      assets: Array.isArray(safeProject.assets) ? safeProject.assets : [],
      metadata: safeProject.metadata && typeof safeProject.metadata === 'object' ? safeProject.metadata : {}
    };
    if (window.ShowduinoPackage) window.ShowduinoPackage.ensurePackageMetadata(normalised);
    else normalised.package = { format: 'showduino-production', version: 1 };
    return normalised;
  }

  function readProjectIndex() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('[Studio Projects] Invalid local project index', error);
      return [];
    }
  }

  function writeProjectIndex(index) {
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index));
  }

  function rememberActiveProject(project) {
    const id = String(project?.project?.id || '').trim();
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  }

  function updateProjectIndex(project) {
    const index = readProjectIndex().filter((item) => item.id !== project.project.id);
    index.unshift({
      id: project.project.id,
      name: project.project.name,
      updatedAt: project.project.updatedAt,
      createdAt: project.project.createdAt,
      storage: currentUser ? 'local+cloud' : 'local',
      packageVersion: project.package?.version || 1
    });
    writeProjectIndex(index.slice(0, 100));
  }

  function updateStudioTitle(project) {
    const title = document.querySelector('.show-name');
    if (title) title.textContent = project.project.name;
    document.title = `${project.project.name} | Showduino Studio`;
  }

  function notify(message, level) {
    if (typeof window.studioLog === 'function') window.studioLog(message, level || 'INFO');
    else console.log(`[Studio Projects] ${message}`);
  }

  function ensureProject() {
    const state = getState();
    if (!state) throw new Error('Studio is still starting.');
    state.project = normaliseProject(state.project);
    updateStudioTitle(state.project);
    return state.project;
  }

  function persistLocal(project, touchUpdatedAt = true) {
    if (!project?.project?.id) return null;
    if (touchUpdatedAt) project.project.updatedAt = new Date().toISOString();
    const payload = JSON.stringify(project);
    localStorage.setItem(`${PROJECT_DATA_PREFIX}${project.project.id}`, payload);
    rememberActiveProject(project);
    updateProjectIndex(project);
    lastAutosavePayload = payload;
    return project;
  }

  function autosaveCurrentProject(reason = 'timer') {
    const state = getState();
    const project = state?.project;
    if (!project?.project?.id) return false;

    try {
      const currentPayload = JSON.stringify(project);
      if (currentPayload === lastAutosavePayload) return false;
      persistLocal(project, true);
      updateStudioTitle(project);
      window.dispatchEvent(new CustomEvent('showduino:project-autosaved', {
        detail: { project, reason }
      }));
      return true;
    } catch (error) {
      console.warn('[Studio Projects] Autosave failed', error);
      return false;
    }
  }

  function restoreLastLocalProject() {
    const state = getState();
    if (!state) return null;

    const activeId = String(localStorage.getItem(ACTIVE_PROJECT_KEY) || '').trim();
    const candidates = [activeId, ...readProjectIndex().map((item) => String(item.id || '').trim())]
      .filter((id, index, all) => id && all.indexOf(id) === index);

    for (const projectId of candidates) {
      try {
        const raw = localStorage.getItem(`${PROJECT_DATA_PREFIX}${projectId}`);
        if (!raw) continue;
        const project = normaliseProject(JSON.parse(raw));
        state.project = project;
        rememberActiveProject(project);
        updateProjectIndex(project);
        updateStudioTitle(project);
        lastAutosavePayload = JSON.stringify(project);
        notify(`Resumed your last show: ${project.project.name}`, 'INFO');
        window.dispatchEvent(new CustomEvent('showduino:project-restored', { detail: { project } }));
        return project;
      } catch (error) {
        console.warn(`[Studio Projects] Could not resume ${projectId}`, error);
      }
    }

    return null;
  }

  async function saveCurrentProject(options) {
    const settings = { cloud: true, ...options };
    const project = ensureProject();
    persistLocal(project, true);
    updateStudioTitle(project);
    notify(`Saved on this device: ${project.project.name}`, 'INFO');

    let cloudSaved = false;
    if (settings.cloud && cloudEnabled() && currentUser) {
      await window.ShowduinoSupabase.saveProject(project);
      cloudSaved = true;
      updateProjectIndex(project);
      notify(`Saved to your Showduino cloud: ${project.project.name}`, 'NET');
    }

    window.dispatchEvent(new CustomEvent('showduino:project-saved', { detail: { project, cloud: cloudSaved } }));
    return project;
  }

  function loadLocalProject(projectId) {
    const state = getState();
    if (!state) throw new Error('Studio is still starting.');
    const raw = localStorage.getItem(`${PROJECT_DATA_PREFIX}${projectId}`);
    if (!raw) throw new Error('The local project could not be found.');
    const project = normaliseProject(JSON.parse(raw));
    state.project = project;
    rememberActiveProject(project);
    updateProjectIndex(project);
    updateStudioTitle(project);
    lastAutosavePayload = JSON.stringify(project);
    notify(`Loaded from this device: ${project.project.name}`, 'INFO');
    if (window.timelineEditor && typeof window.timelineEditor.init === 'function') window.timelineEditor.init();
    window.dispatchEvent(new CustomEvent('showduino:project-restored', { detail: { project } }));
    return project;
  }

  async function loadCloudProject(projectId) {
    if (!cloudEnabled() || !currentUser) throw new Error('Sign in before loading a cloud show.');
    const state = getState();
    const project = await window.ShowduinoSupabase.loadProject(projectId);
    if (!project) throw new Error('The cloud project could not be found.');
    state.project = normaliseProject(project);
    await saveCurrentProject({ cloud: false });
    notify(`Loaded from your Showduino cloud: ${state.project.project.name}`, 'NET');
    if (window.timelineEditor && typeof window.timelineEditor.init === 'function') window.timelineEditor.init();
    return state.project;
  }

  async function openRequestedCloudProject() {
    if (pendingCloudOpenHandled || !currentUser) return;
    const id = sessionStorage.getItem('showduino_open_cloud_project');
    if (!id) return;
    pendingCloudOpenHandled = true;
    sessionStorage.removeItem('showduino_open_cloud_project');
    try { await loadCloudProject(id); }
    catch (error) { notify(`Could not open cloud show: ${error.message}`, 'ERR'); }
  }

  function renameCurrentProject() {
    const project = ensureProject();
    const requestedName = window.prompt('Show name:', project.project.name);
    if (!requestedName || !requestedName.trim()) return;
    project.project.name = requestedName.trim().slice(0, 100);
    project.project.updatedAt = new Date().toISOString();
    updateStudioTitle(project);
    saveCurrentProject().catch((error) => notify(error.message, 'ERR'));
  }

  function exportCurrentProject() {
    const project = ensureProject();
    autosaveCurrentProject('export');
    const shdoDocument = window.ShowduinoPackage?.toShdo ? window.ShowduinoPackage.toShdo(project) : project;
    if (window.ShowduinoPackage?.validateShdo && shdoDocument.schema === window.ShowduinoPackage.SCHEMA_NAME) {
      const validation = window.ShowduinoPackage.validateShdo(shdoDocument);
      if (!validation.valid) throw new Error(validation.errors[0] || 'SHDO validation failed.');
    }

    const blob = new Blob([JSON.stringify(shdoDocument, null, 2)], { type: 'application/vnd.showduino.production+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.project.name.replace(/[^a-z0-9-_]+/gi, '_') || 'showduino-project'}.shdo`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notify(`Exported canonical SHDO v2 production: ${project.project.name}`, 'INFO');
    return shdoDocument;
  }

  function importProject(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Choose a .shdo or JSON project file.'));
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const state = getState();
          const parsed = JSON.parse(String(reader.result));
          validatePackage(parsed);
          const imported = window.ShowduinoPackage?.fromShdo ? window.ShowduinoPackage.fromShdo(parsed) : parsed;
          state.project = normaliseProject(imported);
          await saveCurrentProject();
          notify(`Imported Showduino production: ${state.project.project.name}`, 'INFO');
          resolve(state.project);
        } catch (error) {
          reject(new Error(`Project import failed: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error('The project file could not be read.'));
      reader.readAsText(file);
    });
  }

  function listLocalProjects() { return readProjectIndex(); }

  function initialiseAuth() {
    if (!cloudEnabled()) {
      currentUser = null;
      return;
    }
    window.ShowduinoSupabase.onAuthChanged(async (user) => {
      currentUser = user;
      window.dispatchEvent(new CustomEvent('showduino:auth-changed', { detail: { user } }));
      notify(user ? `Showduino account connected: ${user.email || 'signed in'}` : 'Using local project saving only', user ? 'NET' : 'INFO');
      if (user) await openRequestedCloudProject();
    });
  }

  function startAutosave() {
    if (autosaveTimer) window.clearInterval(autosaveTimer);
    autosaveTimer = window.setInterval(() => autosaveCurrentProject('timer'), AUTOSAVE_INTERVAL_MS);

    window.addEventListener('pagehide', () => autosaveCurrentProject('pagehide'));
    window.addEventListener('beforeunload', () => autosaveCurrentProject('beforeunload'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') autosaveCurrentProject('hidden');
    });
  }

  function initialise() {
    const saveButton = document.querySelector('.save-icon');
    if (saveButton) {
      saveButton.type = 'button';
      saveButton.title = 'Save this show';
      saveButton.setAttribute('aria-label', 'Save this show');
      saveButton.addEventListener('click', () => saveCurrentProject().catch((error) => notify(error.message, 'ERR')));
    }

    const name = document.querySelector('.show-name');
    if (name) {
      name.title = 'Click to rename this show';
      name.tabIndex = 0;
      name.addEventListener('click', renameCurrentProject);
      name.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') renameCurrentProject();
      });
    }

    // Restore synchronously before the phone builder's DOMContentLoaded handler
    // runs, so returning to Studio immediately shows the last working show.
    const restored = restoreLastLocalProject();
    if (!restored) {
      try {
        const project = ensureProject();
        persistLocal(project, false);
      } catch (error) {
        console.warn('[Studio Projects]', error);
      }
    }

    initialiseAuth();
    startAutosave();
  }

  window.ShowduinoProjects = Object.freeze({
    saveCurrentProject,
    autosaveCurrentProject,
    restoreLastLocalProject,
    loadLocalProject,
    loadCloudProject,
    exportCurrentProject,
    importProject,
    listLocalProjects,
    renameCurrentProject,
    normaliseProject,
    validatePackage,
    cloudEnabled,
    getCurrentUser: () => currentUser
  });

  document.addEventListener('DOMContentLoaded', initialise);
})();
