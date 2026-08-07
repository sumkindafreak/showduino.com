/* Showduino Studio — deploy a creator project to a local Showduino system. */
(function () {
  'use strict';

  const DEFAULT_HOSTS = ['http://showduino-studio.local', 'http://192.168.4.1'];
  const IMPORT_PORT = 82;

  function notify(message, level) {
    if (typeof window.studioLog === 'function') window.studioLog(message, level || 'INFO');
    else console.log(`[Studio Deploy] ${message}`);
  }

  function provisioningUrl(baseUrl, path) {
    const url = new URL(baseUrl);
    url.port = String(IMPORT_PORT);
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  function browserAllowsDirectLocalSend() {
    // showduino.com uses HTTPS. Most browsers block a secure public website from
    // directly controlling an ordinary HTTP device on the user's private network.
    return window.location.protocol !== 'https:';
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
    if (!browserAllowsDirectLocalSend()) return null;
    for (const host of DEFAULT_HOSTS) {
      const found = await probe(host);
      if (found) return found;
    }
    return null;
  }

  function exportForShowduino(reason) {
    window.ShowduinoProjects.exportCurrentProject();
    notify(reason || 'Show file prepared for Showduino.', 'INFO');
    return { deployed: false, exported: true, reason: reason || 'export' };
  }

  async function deployCurrentProject() {
    if (!window.ShowduinoProjects?.saveCurrentProject) {
      throw new Error('Showduino Studio is still starting.');
    }

    // Save once locally and use exactly that saved snapshot for either deployment or export.
    // Cloud saving is handled separately by the normal Save workflow and must not block transfer.
    const project = await window.ShowduinoProjects.saveCurrentProject({ cloud: false });

    if (!browserAllowsDirectLocalSend()) {
      return exportForShowduino('Your browser protects local devices from direct website access. Downloaded the .shdo file instead.');
    }

    notify('Looking for a local Showduino…', 'NET');
    const target = await findLocalShowduino();
    if (!target) {
      return exportForShowduino('No local Showduino was found. Downloaded the .shdo file instead.');
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
    button.title = browserAllowsDirectLocalSend()
      ? 'Install this show on a Showduino connected to your local network'
      : 'Prepare this show for your Showduino';

    button.addEventListener('click', async () => {
      button.disabled = true;
      const old = button.textContent;
      button.textContent = browserAllowsDirectLocalSend() ? 'Finding Showduino…' : 'Preparing show…';
      try {
        const result = await deployCurrentProject();
        button.textContent = result.deployed ? 'Sent ✓' : 'Show file ready ✓';
        setTimeout(() => { button.textContent = old; }, 2200);
      } catch (error) {
        notify(`Deploy failed: ${error.message}`, 'ERR');
        window.alert(`Could not prepare this show for Showduino.\n\n${error.message}\n\nUse Export .shdo to save the show manually.`);
        button.textContent = old;
      } finally {
        button.disabled = false;
      }
    });
    actions.appendChild(button);
  }

  window.ShowduinoDeploy = Object.freeze({
    findLocalShowduino,
    deployCurrentProject,
    browserAllowsDirectLocalSend
  });

  document.addEventListener('DOMContentLoaded', initialise);
})();
