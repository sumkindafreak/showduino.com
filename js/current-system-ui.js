(() => {
  'use strict';

  const CURRENT_ROUTE_PLACEHOLDER = 'Logical node device ID';
  const DMX_DISABLED_MESSAGE = 'DMX is outside the current Showduino implementation scope.';

  function updateLegacyRoutingLabels(root) {
    root.querySelectorAll('input[placeholder="SUE, IAN or device ID"], input[placeholder*="SUE"], input[placeholder*="IAN"]').forEach((input) => {
      input.placeholder = CURRENT_ROUTE_PLACEHOLDER;
    });

    const routeNode = root.querySelector('#route-node');
    if (routeNode) routeNode.placeholder = CURRENT_ROUTE_PLACEHOLDER;

    // Studio v4 routes current output clips by logical node ID + output. Old
    // universe/channel fields remain in imported JSON for compatibility but are
    // not part of current authoring.
    if (document.body.classList.contains('studio-v4')) {
      const routeChannel = root.querySelector('#route-channel');
      const routeUniverse = root.querySelector('#route-universe');
      routeChannel?.closest('.inspector-field')?.setAttribute('hidden', '');
      routeUniverse?.closest('.inspector-field')?.setAttribute('hidden', '');
      const routeGrid = routeChannel?.closest('.inspector-grid');
      if (routeGrid) routeGrid.style.gridTemplateColumns = '1fr';
      const note = root.querySelector('.inspector-route .inspector-note') || root.querySelector('.inspector-section .inspector-note');
      if (note && note.textContent.includes('Routing')) note.textContent = 'Routing stores a logical node device ID and output. The P4 runtime resolves that target to physical hardware.';
    }
  }

  function updateLegacyText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      if (!node.nodeValue) return;
      node.nodeValue = node.nodeValue
        .replace(/SUE\s*\/\s*IAN/gi, 'Show Engine / Node')
        .replace(/SUE,\s*IAN/gi, 'Show Engine, Node')
        .replace(/SUE Controller/gi, 'Show Engine')
        .replace(/IAN Zone Node/gi, 'Specialist Node');
    });
  }

  function disableCurrentDmxAffordances(root) {
    root.querySelectorAll('option[value="dmx"], option').forEach((option) => {
      if (option.value === 'dmx' || option.textContent.trim().toLowerCase() === 'dmx') {
        option.disabled = true;
        option.hidden = true;
      }
    });

    root.querySelectorAll('[data-type="dmx"], [data-track-type="dmx"], [data-clip-type="dmx"]').forEach((element) => {
      element.hidden = true;
      element.setAttribute('aria-hidden', 'true');
    });

    root.querySelectorAll('button').forEach((button) => {
      const text = button.textContent.trim().toLowerCase();
      if (text === 'dmx' || text.includes('add dmx') || text.includes('dmx track')) {
        button.hidden = true;
        button.disabled = true;
        button.title = DMX_DISABLED_MESSAGE;
        button.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function addArchitectureHint() {
    // Studio v4 has a permanent runtime-authority chip in the shell.
    if (document.body.classList.contains('studio-v4') || document.querySelector('.runtime-authority-chip')) return;
    const topBar = document.querySelector('.top-bar');
    if (!topBar || document.getElementById('current-system-hint')) return;

    const hint = document.createElement('span');
    hint.id = 'current-system-hint';
    hint.className = 'studio-action-btn';
    hint.style.cursor = 'default';
    hint.style.borderColor = 'rgba(0,255,204,.35)';
    hint.style.color = 'var(--accent-color, #00ffcc)';
    hint.textContent = 'P4 = RUNTIME AUTHORITY';
    hint.title = 'Studio creates and deploys shows. The ESP32-P4 Show Engine owns the live runtime.';

    const actionArea = topBar.querySelector('.studio-project-actions');
    if (actionArea) actionArea.appendChild(hint);
  }

  function modernise(root = document) {
    updateLegacyRoutingLabels(root);
    updateLegacyText(root);
    disableCurrentDmxAffordances(root);
    addArchitectureHint();
  }

  function boot() {
    modernise(document);

    const workspace = document.querySelector('.workspace') || document.body;
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          modernise(node);
        });
      });
    });

    observer.observe(workspace, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
