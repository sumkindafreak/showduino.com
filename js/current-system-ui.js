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

  function mobileProject() {
    return window.state?.project || null;
  }

  function mobilePixelSummary(clip) {
    const params = clip?.params || {};
    const line = Math.max(1, Math.round(Number(params.line) || 1));
    const start = Math.max(0, Math.round(Number(params.startPixel) || 0));
    const length = Math.max(1, Math.round(Number(params.length) || 1));
    return `L${line} · PX ${start}–${start + length - 1}`;
  }

  function ensureNativeMobilePixelLayerControls(root = document) {
    const mobileRoot = document.getElementById('studio-mobile-app');
    if (!mobileRoot) return;

    // Remove the older injected bridge controls. Native mobile controls below
    // survive the phone builder's full innerHTML re-renders deterministically.
    mobileRoot.querySelectorAll('[data-sm-layer-from]').forEach((button) => button.remove());

    const rows = [];
    if (root?.matches?.('.sm-cue-row[data-sm-edit]')) rows.push(root);
    root?.querySelectorAll?.('.sm-cue-row[data-sm-edit]').forEach((row) => rows.push(row));
    if (!rows.length && root !== mobileRoot) {
      mobileRoot.querySelectorAll('.sm-cue-row[data-sm-edit]').forEach((row) => rows.push(row));
    }

    rows.forEach((row) => {
      if (!mobileRoot.contains(row)) return;
      const clipId = String(row.dataset.smEdit || '');
      const clip = mobileProject()?.clips?.find((item) => String(item.id) === clipId);
      if (!clip || clip.type !== 'pixel') return;

      // Prefer the dedicated detail line used by the simple mobile builder.
      // The fallback keeps compatibility with the previous mobile markup.
      const info = row.querySelector('.sm-cue-detail') || row.querySelector('.sm-cue-info span');
      if (info && !info.dataset.mobilePixelSummary) {
        const existing = String(info.textContent || '').trim();
        const summary = mobilePixelSummary(clip);
        info.textContent = existing ? `${existing} · ${summary}` : summary;
        info.dataset.mobilePixelSummary = '1';
      }

      const parent = row.parentElement;
      if (!parent) return;
      const existing = Array.from(parent.querySelectorAll('[data-sm-native-layer-from]'))
        .find((button) => String(button.dataset.smNativeLayerFrom || '') === clipId);
      if (existing) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sm-btn sm-pixel-layer-button';
      button.dataset.smNativeLayerFrom = clipId;
      button.innerHTML = '<strong>＋ Add overlapping pixel layer</strong><span style="display:block;margin-top:.12rem;opacity:.7;font-size:.56rem;">Same timing · independent pixel range</span>';
      button.style.cssText = 'width:100%;margin:-.22rem 0 .5rem;border-style:dashed;min-height:46px;';
      row.insertAdjacentElement('afterend', button);
    });
  }

  function installNativeMobilePixelLayerBridge() {
    ensureNativeMobilePixelLayerControls(document);

    document.addEventListener('click', async (event) => {
      const button = event.target.closest?.('[data-sm-native-layer-from]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();

      const api = window.ShowduinoPixelLayers;
      if (!api?.createLayerFromClip) {
        window.alert('Pixel layering is still loading. Please try again in a moment.');
        return;
      }

      button.disabled = true;
      const original = button.innerHTML;
      button.textContent = 'Creating pixel layer…';
      try {
        await api.createLayerFromClip(button.dataset.smNativeLayerFrom);
      } catch (error) {
        console.error('[Mobile Pixel Layers] Could not create layer', error);
        window.alert(error?.message || 'Could not create the pixel layer.');
        button.disabled = false;
        button.innerHTML = original;
      }
    });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.id === 'studio-mobile-app' || node.closest?.('#studio-mobile-app') || node.querySelector?.('#studio-mobile-app')) {
            ensureNativeMobilePixelLayerControls(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('showduino:project-saved', () => window.setTimeout(() => ensureNativeMobilePixelLayerControls(document), 0));
    window.addEventListener('showduino:v4-saved', () => window.setTimeout(() => ensureNativeMobilePixelLayerControls(document), 0));
  }

  function modernise(root = document) {
    updateLegacyRoutingLabels(root);
    updateLegacyText(root);
    disableCurrentDmxAffordances(root);
    addArchitectureHint();
    ensureNativeMobilePixelLayerControls(root);
  }

  function boot() {
    modernise(document);
    installNativeMobilePixelLayerBridge();

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