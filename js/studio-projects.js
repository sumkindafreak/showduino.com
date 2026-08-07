/* global SHOWDUINO_CONFIG, ShowduinoFirebase */
(function () {
  'use strict';

  const PROJECT_INDEX_KEY = 'showduino_local_projects';
  const PROJECT_DATA_PREFIX = 'showduino_project_';
  let currentUser = null;

  function getState() {
    return window.state || null;
  }

  function getConfig() {
    return window.SHOWDUINO_CONFIG || { features: {} };
  }

  function cloudEnabled() {
    const config = getConfig();
    return Boolean(
      config.features.firebase &&
      config.features.authentication &&
      config.features.cloudSync &&
      window.ShowduinoFirebase
    );
  }

  function createProjectId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `show_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function validatePackage(project) {
    if (!project || typeof project !== 'object') {
      throw new Error('This is not a valid Showduino project file.');
    }

    // Older .shdo files did not have package metadata. They remain supported and are upgraded on load.
    if (!project.package) return true;

    const expectedFormat = window.ShowduinoPackage?.FORMAT_NAME || 'showduino-production';
    const supportedVersion = window.ShowduinoPackage?.FORMAT_VERSION || 1;

    if (project.package.format && project.package.format !== expectedFormat) {
      throw new Error(`Unsupported project format: ${project.package.format}`);
    }

    const version = Number(project.package.version || 1);
    if (!Number.isFinite(version) || version < 1) {
      throw new Error('The .shdo file has an invalid format version.');
    }
    if (version > supportedVersion) {
      throw new Error(`This show was created by a newer Showduino Studio (file version ${version}).`);
    }

    return true;
  }

  function normaliseProject(project) {
    validatePackage(project || {});

    const now = new Date().toISOString();
    const safeProject = project && typeof project === 'object' ? project : {};
    const metadata = safeProject.project && typeof safeProject.project === 'object'
      ? safeProject.project
      : {};

    const normalised = {
      ...safeProject,
      project: {
        id: metadata.id || createProjectId(),
        name: metadata.name || 'Untitled Show',
        version: metadata.version || '1.0.0',
        createdAt: metadata.createdAt || now,
        updatedAt: now,
        ...metadata
      },
      scenes: Array.isArray(safeProject.scenes) ? safeProject.scenes : [],
      tracks: Array.isArray(safeProject.tracks) ? safeProject.tracks : [],
      clips: Array.isArray(safeProject.clips) ? safeProject.clips : [],
      globalSettings: safeProject.globalSettings || {},
      assets: safeProject.assets || {},
      metadata: safeProject.metadata || {}
    };

    if (window.ShowduinoPackage) {
      window.ShowduinoPackage.ensurePackageMetadata(normalised);
    } else {
      normalised.package = { format: 'showduino-production', version: 1 };
    }

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

  function updateProjectIndex(project) {
    const index = readProjectIndex().filter((item) => item.id !== project.project.id);
    index.unshift({
      id: project.project.id,
      name: project.project.name,
      updatedAt: project.project.updatedAt,
      createdAt: project.project.createdAt,
      storage: 'local',
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
    if (typeof window.studioLog === 'function') {
      window.studioLog(message, level || 'INFO');
    } else {
      console.log(`[Studio Projects] ${message}`);
    }
  }

  function ensureProject() {
    const state = getState();
    if (!state) throw new Error('Studio is still starting.');
    state.project = normaliseProject(state.project);
    updateStudioTitle(state.project);
    return state.project;
  }

  async function saveCurrentProject(options) {
    const settings = { cloud: true, ...options };
    const project = ensureProject();
    project.project.updatedAt = new Date().toISOString();

    localStorage.setItem(`${PROJECT_DATA_PREFIX}${project.project.id}`, JSON.stringify(project));
    updateProjectIndex(project);
    updateStudioTitle(project);
    notify(`Saved locally: ${project.project.name}`, 'INFO');

    if (settings.cloud && cloudEnabled() && currentUser) {
      await window.ShowduinoFirebase.saveProject(project);
      notify(`Synced to HauntSync: ${project.project.name}`, 'NET');
    }

    window.dispatchEvent(new CustomEvent('showduino:project-saved', {
      detail: { project, cloud: Boolean(settings.cloud && cloudEnabled() && currentUser) }
    }));
    return project;
  }

  function loadLocalProject(projectId) {
    const state = getState();
    if (!state) throw new Error('Studio is still starting.');
    const raw = localStorage.getItem(`${PROJECT_DATA_PREFIX}${projectId}`);
    if (!raw) throw new Error('The local project could not be found.');

    const project = normaliseProject(JSON.parse(raw));
    state.project = project;
    updateProjectIndex(project);
    updateStudioTitle(project);
    notify(`Loaded local project: ${project.project.name}`, 'INFO');

    if (window.timelineEditor && typeof window.timelineEditor.init === 'function') {
      window.timelineEditor.init();
    }
    return project;
  }

  async function loadCloudProject(projectId) {
    if (!cloudEnabled() || !currentUser) {
      throw new Error('Sign in and enable cloud sync before loading cloud projects.');
    }
    const state = getState();
    const project = await window.ShowduinoFirebase.loadProject(projectId);
    if (!project) throw new Error('The cloud project could not be found.');
    state.project = normaliseProject(project);
    await saveCurrentProject({ cloud: false });
    notify(`Loaded from HauntSync: ${state.project.project.name}`, 'NET');
    return state.project;
  }

  function renameCurrentProject() {
    const project = ensureProject();
    const requestedName = window.prompt('Show name:', project.project.name);
    if (!requestedName || !requestedName.trim()) return;
    project.project.name = requestedName.trim().slice(0, 100);
    project.project.updatedAt = new Date().toISOString();
    updateStudioTitle(project);
    saveCurrentProject({ cloud: false }).catch((error) => notify(error.message, 'ERR'));
  }

  function exportCurrentProject() {
    const project = ensureProject();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.project.name.replace(/[^a-z0-9-_]+/gi, '_') || 'showduino-project'}.shdo`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notify(`Exported Showduino production: ${project.project.name}`, 'INFO');
  }

  function importProject(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Choose a .shdo or JSON project file.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const state = getState();
          const parsed = JSON.parse(String(reader.result));
          validatePackage(parsed);
          state.project = normaliseProject(parsed);
          await saveCurrentProject({ cloud: false });
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

  function listLocalProjects() {
    return readProjectIndex();
  }

  function initialiseAuth() {
    if (!cloudEnabled()) {
      currentUser = null;
      return;
    }

    window.ShowduinoFirebase.onAuthChanged((user) => {
      currentUser = user;
      window.dispatchEvent(new CustomEvent('showduino:auth-changed', { detail: { user } }));
      notify(user ? `HauntSync account connected: ${user.email || user.displayName}` : 'HauntSync account disconnected', 'NET');
    });
  }

  function initialise() {
    const saveButton = document.querySelector('.save-icon');
    if (saveButton) {
      saveButton.type = 'button';
      saveButton.title = 'Save project locally';
      saveButton.setAttribute('aria-label', 'Save project locally');
      saveButton.addEventListener('click', () => {
        saveCurrentProject().catch((error) => notify(error.message, 'ERR'));
      });
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

    initialiseAuth();
    setTimeout(() => {
      try {
        const project = ensureProject();
        updateStudioTitle(project);
      } catch (error) {
        console.warn('[Studio Projects]', error);
      }
    }, 0);
  }

  window.ShowduinoProjects = Object.freeze({
    saveCurrentProject,
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
