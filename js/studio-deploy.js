/* Showduino Studio — deploy a creator project to a local Showduino system. */
(function () {
  'use strict';

  const DEFAULT_HOSTS = ['http://showduino-studio.local', 'http://192.168.4.1'];
  const IMPORT_PORT = 82;

  function notify(message, level) {
    if (typeof window.studioLog === 'function') window.studioLog(message, level || 'INFO');
    else console.log(`[Studio Deploy] ${message}`);
  }

  function currentProject() {
    const project = window.state?.project;
    if (!project) throw new Error('Create or load a show before deploying.');
    return project;
  }

  function provisioningUrl(baseUrl, path) {
    const url = new URL(baseUrl);
    url.port = String(IMPORT_PORT);
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  async function probe(baseUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch(`${baseUrl}/api/system`, { signal: controller.signal });
      if (!response.ok) return null;
      const system = await response.json();
      return { baseUrl, system };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function findLocalShowduino() {
    for (const host of DEFAULT_HOSTS) {
      const found = await probe(host);
      if (found) return found;
    }
    return null;
  }

  async function deployCurrentProject() {
    const project = currentProject();
    await window.ShowduinoProjects?.saveCurrentProject({ cloud: true });
    notify('Looking for a local Showduino…', 'NET');

    const target = await findLocalShowduino();
    if (!target) {
      notify('No local Showduino found. Exporting .shdo instead.', 'WARN');
      window.ShowduinoProjects.exportCurrentProject();
      return { deployed: false, exported: true };
    }

    const response = await fetch(provisioningUrl(target.baseUrl, '/api/production/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });

    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(result.error || `Showduino returned HTTP ${response.status}`);

    notify(`Installed on Showduino: ${project.project?.name || 'Untitled Show'}`, 'NET');
    window.dispatchEvent(new CustomEvent('showduino:project-deployed', { detail: { target, result } }));
    return { deployed: true, target, result };
  }

  function initialise() {
    const actions = document.querySelector('.studio-project-actions');
    if (!actions || document.getElementById('studio-deploy-button')) return;
    const button = document.createElement('button');
    button.id = 'studio-deploy-button';
    button.className = 'studio-action-btn studio-deploy-btn';
    button.type = 'button';
    button.textContent = 'Send to Showduino';
    button.title = 'Install this .shdo project on a Showduino connected to your local network';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const old = button.textContent;
      button.textContent = 'Finding Showduino…';
      try {
        await deployCurrentProject();
        button.textContent = 'Sent ✓';
        setTimeout(() => { button.textContent = old; }, 1800);
      } catch (error) {
        notify(`Deploy failed: ${error.message}`, 'ERR');
        window.alert(`Could not send this show to Showduino.\n\n${error.message}\n\nYou can still use Export to save the .shdo file.`);
        button.textContent = old;
      } finally {
        button.disabled = false;
      }
    });
    actions.appendChild(button);
  }

  window.ShowduinoDeploy = Object.freeze({ findLocalShowduino, deployCurrentProject });
  document.addEventListener('DOMContentLoaded', initialise);
})();
