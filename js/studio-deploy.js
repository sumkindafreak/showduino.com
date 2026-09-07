/* Showduino Studio — prepare or deploy a creator project to the ESP32-P4 Show Engine.
 *
 * Direct install is capability-gated. Until the current P4 production-import API
 * is implemented and advertises itself, Studio exports the exact same .shdo
 * snapshot rather than pretending that a browser transfer succeeded.
 */
(function () {
  'use strict';

  const DEFAULT_HOSTS = ['http://showduino.local', 'http://showduino-studio.local', 'http://192.168.4.1'];
  const PROBE_PATHS = ['/api/system', '/api/v1/system'];

  function notify(message, level) {
    if (typeof window.studioLog === 'function') window.studioLog(message, level || 'INFO');
    else console.log(`[Studio Deploy] ${message}`);
  }

  function browserAllowsDirectLocalSend() {
    // show-duino.com is HTTPS. Browsers may block requests from a secure public
    // origin to an ordinary HTTP private-network device. Export remains valid.
    return window.location.protocol !== 'https:';
  }

  function advertisesProductionImport(system) {
    if (!system || typeof system !== 'object') return false;
    const runtime = String(system.runtimeAuthority || system.runtime_authority || system.role || '').toLowerCase();
    const capability = Boolean(
      system.capabilities?.productionImport ||
      system.capabilities?.production_import ||
      system.features?.productionImport ||
      system.productionImport === true
    );
    const looksLikeP4 = runtime.includes('p4') || runtime.includes('show engine') || runtime.includes('show_engine');
    return capability && looksLikeP4;
  }

  async function probe(baseUrl) {
    for (const path of PROBE_PATHS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1600);
      try {
        const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) continue;
        const system = await response.json();
        return { baseUrl, system, importCapable: advertisesProductionImport(system) };
      } catch (_) {
        // Try the next probe path/host.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  async function findLocalShowduino() {
    if (!browserAllowsDirectLocalSend()) return null;
    for (const host of DEFAULT_HOSTS) {
      const found = await probe(host);
      if (found) return found;
    }
    return null;
  }

  function exportForShowEngine(reason) {
    window.ShowduinoProjects.exportCurrentProject();
    notify(reason || 'Production package prepared for the P4 Show Engine.', 'INFO');
    return { deployed: false, exported: true, reason: reason || 'export' };
  }

  async function deployCurrentProject() {
    if (!window.ShowduinoProjects?.saveCurrentProject) throw new Error('Showduino Studio is still starting.');

    // Save once and use exactly that snapshot for deployment/export.
    const project = await window.ShowduinoProjects.saveCurrentProject({ cloud: false });

    if (!browserAllowsDirectLocalSend()) {
      return exportForShowEngine('Direct private-network access is blocked from this HTTPS browser session. Exported the .shdo package instead.');
    }

    notify('Looking for a compatible local P4 Show Engine…', 'NET');
    const target = await findLocalShowduino();
    if (!target) return exportForShowEngine('No local Showduino system answered the Studio probe. Exported the .shdo package instead.');
    if (!target.importCapable) return exportForShowEngine('A Showduino system was found, but it did not advertise the production-import capability. Exported the .shdo package instead.');

    const importUrl = `${target.baseUrl}/api/production/import`;
    const response = await fetch(importUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });

    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(result.error || `Show Engine returned HTTP ${response.status}`);

    notify(`Installed on P4 Show Engine: ${project.project?.name || 'Untitled Show'}`, 'NET');
    window.dispatchEvent(new CustomEvent('showduino:project-deployed', { detail: { target, result, project } }));
    return { deployed: true, target, result };
  }

  function initialise() {
    const actions = document.querySelector('.studio-project-actions');
    if (!actions || document.getElementById('studio-deploy-button')) return;

    const button = document.createElement('button');
    button.id = 'studio-deploy-button';
    button.className = 'studio-action-btn studio-deploy-btn';
    button.type = 'button';
    button.textContent = 'Prepare for P4';
    button.title = 'Install on a compatible local P4 Show Engine or export the .shdo package';

    button.addEventListener('click', async () => {
      button.disabled = true;
      const old = button.textContent;
      button.textContent = browserAllowsDirectLocalSend() ? 'Checking P4…' : 'Preparing…';
      try {
        const result = await deployCurrentProject();
        button.textContent = result.deployed ? 'Installed ✓' : 'Show file ready ✓';
        setTimeout(() => { button.textContent = old; }, 2200);
      } catch (error) {
        notify(`Deploy failed: ${error.message}`, 'ERR');
        window.alert(`Could not prepare this production for the P4 Show Engine.\n\n${error.message}\n\nUse Export .shdo to save it manually.`);
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
    browserAllowsDirectLocalSend,
    advertisesProductionImport
  });

  document.addEventListener('DOMContentLoaded', initialise);
})();
