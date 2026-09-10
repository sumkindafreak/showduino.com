(() => {
  'use strict';

  const CURRENT_ROUTE_PLACEHOLDER = 'Logical node device ID';
  const DMX_DISABLED_MESSAGE = 'DMX is outside the current Showduino implementation scope.';
  const MOBILE_TYPE_META = Object.freeze({
    audio:   { icon:'♪', name:'Sound', subtitle:'Play audio at this exact time' },
    relay:   { icon:'↯', name:'Relay', subtitle:'Switch or pulse an output' },
    mosfet:  { icon:'▰', name:'Powered output', subtitle:'MOSFET / PWM output' },
    pixel:   { icon:'✦', name:'Pixels', subtitle:'Run another pixel action' },
    trigger: { icon:'◎', name:'Trigger', subtitle:'Fire a logical event' },
    fx:      { icon:'◈', name:'Other FX', subtitle:'Fog, air, motor, servo and more' }
  });

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

  function mobileTime(ms) {
    const total = Math.max(0, Math.round(Number(ms) || 0));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
  }

  function mobileEditTime(ms) {
    const total = Math.max(0, Math.round(Number(ms) || 0));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${minutes}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
  }

  function mobileCueDetail(clip) {
    const params = clip?.params || {};
    if (clip?.type === 'audio') return String(params.file || '').split('/').filter(Boolean).pop() || 'Choose audio file';
    if (clip?.type === 'pixel') {
      const effect = String(params.effect || 'solid').replaceAll('-', ' ');
      return `${effect} · ${mobilePixelSummary(clip)}`;
    }
    if (clip?.type === 'relay') return `${String(params.out || 'out1').toUpperCase()} · ${String(params.mode || 'hold')}`;
    if (clip?.type === 'mosfet') return `${String(params.out || 'out1').toUpperCase()} · ${Math.max(0,Math.min(100,Number(params.duty ?? 100)))}%`;
    if (clip?.type === 'trigger') return params.event || 'Trigger event';
    if (clip?.type === 'fx') return params.effect || 'FX';
    return clip?.type || 'Cue';
  }

  function injectMobileSyncStyles() {
    if (document.getElementById('showduino-mobile-sync-styles')) return;
    const style = document.createElement('style');
    style.id = 'showduino-mobile-sync-styles';
    style.textContent = `
      #studio-mobile-app .sm-sync-group-label{
        display:flex;align-items:center;justify-content:space-between;gap:.5rem;
        margin:.08rem .1rem .28rem;padding:.34rem .5rem;border-left:2px solid rgba(0,255,204,.5);
        color:#7f929c;font-size:.54rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
      }
      #studio-mobile-app .sm-sync-group-label strong{color:#dce6e9;font-size:.58rem;}
      #studio-mobile-app .sm-sync-action-button span{display:block;margin-top:.12rem;opacity:.7;font-size:.56rem;}
      #studio-mobile-app .sm-now-stack{display:grid;gap:.38rem;margin-top:.34rem;}
      #studio-mobile-app .sm-now-action{display:grid;grid-template-columns:30px minmax(0,1fr);gap:.45rem;align-items:start;padding:.38rem .42rem;border:1px solid rgba(0,255,204,.2);border-radius:9px;background:rgba(0,255,204,.035);}
      #studio-mobile-app .sm-now-action b{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:rgba(0,255,204,.08);font-size:.82rem;}
      #studio-mobile-app .sm-now-action strong{display:block;font-size:.68rem;line-height:1.2;}
      #studio-mobile-app .sm-now-action span{display:block;margin-top:.08rem;font-size:.55rem;line-height:1.25;color:#7f929c;}
      #studio-mobile-app #sm-sync-picker .sm-picker-sheet{max-height:min(78vh,620px);overflow:auto;}
    `;
    document.head.appendChild(style);
  }

  function ensureNativeMobileCueSyncControls(root = document) {
    const mobileRoot = document.getElementById('studio-mobile-app');
    if (!mobileRoot) return;

    injectMobileSyncStyles();

    // Retire the older pixel-only bridge. A cue moment can now contain sound,
    // pixels, outputs and triggers together at the same millisecond.
    mobileRoot.querySelectorAll('[data-sm-layer-from],[data-sm-native-layer-from]').forEach((button) => button.remove());

    const rows = Array.from(mobileRoot.querySelectorAll('.sm-cue-row[data-sm-edit]'));
    if (!rows.length) return;

    const rowEntries = rows.map((row) => {
      const clipId = String(row.dataset.smEdit || '');
      const clip = mobileProject()?.clips?.find((item) => String(item.id) === clipId) || null;
      return { row, clip };
    }).filter((entry) => entry.clip);

    rowEntries.forEach(({ row, clip }) => {
      if (clip.type !== 'pixel') return;
      const info = row.querySelector('.sm-cue-detail') || row.querySelector('.sm-cue-info span');
      if (info && !info.dataset.mobilePixelSummary) {
        const existing = String(info.textContent || '').trim();
        const summary = mobilePixelSummary(clip);
        if (!existing.includes(summary)) info.textContent = existing ? `${existing} · ${summary}` : summary;
        info.dataset.mobilePixelSummary = '1';
      }
    });

    const groups = new Map();
    rowEntries.forEach((entry) => {
      const startMs = Math.max(0, Math.round(Number(entry.clip.startMs) || 0));
      if (!groups.has(startMs)) groups.set(startMs, []);
      groups.get(startMs).push(entry);
    });

    groups.forEach((entries, startMs) => {
      const firstRow = entries[0].row;
      const lastRow = entries[entries.length - 1].row;
      const parent = lastRow.parentElement;
      if (!parent) return;

      if (entries.length > 1) {
        const markerKey = String(startMs);
        const existingMarker = Array.from(parent.querySelectorAll('[data-sm-sync-group]'))
          .find((marker) => marker.dataset.smSyncGroup === markerKey);
        if (!existingMarker) {
          const marker = document.createElement('div');
          marker.className = 'sm-sync-group-label';
          marker.dataset.smSyncGroup = markerKey;
          marker.innerHTML = `<strong>${mobileTime(startMs)}</strong><span>${entries.length} actions together</span>`;
          firstRow.insertAdjacentElement('beforebegin', marker);
        }
      }

      const existingButton = Array.from(parent.querySelectorAll('[data-sm-sync-at]'))
        .find((button) => Number(button.dataset.smSyncAt) === startMs);
      if (existingButton) return;

      const firstPixel = entries.find((entry) => entry.clip.type === 'pixel')?.clip || null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sm-btn sm-sync-action-button';
      button.dataset.smSyncAt = String(startMs);
      if (firstPixel?.id) button.dataset.smSyncPixel = String(firstPixel.id);
      button.innerHTML = `<strong>＋ Add action at ${mobileTime(startMs)}</strong><span>Sound, pixels, output or trigger · fires at the same time</span>`;
      button.style.cssText = 'width:100%;margin:-.22rem 0 .5rem;border-style:dashed;min-height:46px;';
      lastRow.insertAdjacentElement('afterend', button);
    });
  }

  function showMobileSyncPicker(startMs, pixelClipId = '') {
    const mobileRoot = document.getElementById('studio-mobile-app');
    if (!mobileRoot) return;
    mobileRoot.querySelector('#sm-sync-picker')?.remove();

    const picker = document.createElement('section');
    picker.id = 'sm-sync-picker';
    picker.className = 'sm-picker';
    picker.setAttribute('aria-modal','true');
    picker.setAttribute('role','dialog');
    picker.dataset.smSyncPickerTime = String(startMs);
    if (pixelClipId) picker.dataset.smSyncPixel = String(pixelClipId);
    picker.innerHTML = `
      <div class="sm-picker-sheet">
        <div class="sm-picker-head"><strong>Add at ${mobileTime(startMs)}</strong><button type="button" data-sm-sync-close aria-label="Close">×</button></div>
        <p class="sm-copy" style="margin:.2rem 0 .55rem;">Anything you add here starts on the exact same millisecond.</p>
        <div class="sm-type-grid">
          ${Object.entries(MOBILE_TYPE_META).map(([type,meta]) => `<button class="sm-type" type="button" data-sm-sync-type="${type}"><b>${meta.icon}</b><strong>${meta.name}</strong><span>${meta.subtitle}</span></button>`).join('')}
        </div>
        ${pixelClipId ? '<button class="sm-btn" style="width:100%;margin-top:.55rem;" type="button" data-sm-sync-copy-pixel>Copy existing pixel layer</button>' : ''}
      </div>`;
    mobileRoot.appendChild(picker);
  }

  function openSyncedMobileCue(type, startMs) {
    const api = window.ShowduinoMobileStudio;
    if (!api?.openCue) {
      window.alert('The mobile cue editor is still loading. Please try again in a moment.');
      return;
    }

    document.getElementById('sm-sync-picker')?.remove();
    api.openCue(type);

    // openCue renders a fresh editor. Set the visible start field after that
    // render so native save logic writes the exact shared timestamp to SHDO.
    let attempts = 0;
    const applyTime = () => {
      const input = document.getElementById('sm-edit-start');
      if (input) {
        input.value = mobileEditTime(startMs);
        input.dataset.smSyncedStart = String(startMs);
        return;
      }
      attempts += 1;
      if (attempts < 8) window.setTimeout(applyTime, 25);
    };
    applyTime();
  }

  function ensureMobilePreviewShowsAllActions() {
    const mobileRoot = document.getElementById('studio-mobile-app');
    const now = mobileRoot?.querySelector('#sm-preview-now');
    const progress = mobileRoot?.querySelector('#sm-preview-progress');
    const p = mobileProject();
    if (!now || !progress || !p?.clips) return;

    const timeMs = Math.max(0, Number(progress.value) || 0);
    const active = p.clips.filter((clip) => {
      const start = Math.max(0, Number(clip.startMs) || 0);
      const end = start + Math.max(1, Number(clip.durationMs) || 0);
      return timeMs >= start && timeMs < end;
    }).sort((a,b) => Number(a.startMs || 0) - Number(b.startMs || 0));

    if (active.length <= 1) {
      delete now.dataset.smSyncSignature;
      return;
    }

    const signature = active.map((clip) => String(clip.id)).join('|');
    if (now.dataset.smSyncSignature === signature && now.querySelectorAll('.sm-now-action').length === active.length) return;

    now.dataset.smSyncSignature = signature;
    now.innerHTML = `<small>NOW · ${active.length} ACTIONS TOGETHER</small><div class="sm-now-stack">${active.map((clip) => {
      const meta = MOBILE_TYPE_META[clip.type] || { icon:'•', name:clip.type || 'Cue' };
      const route = clip.type === 'trigger' ? '' : String(clip.routing?.nodeId || '').trim();
      const detail = mobileCueDetail(clip);
      return `<div class="sm-now-action"><b>${meta.icon}</b><div><strong>${String(clip.label || meta.name).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</strong><span>${String(detail).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}${route ? ` · ${String(route).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}` : ''}</span></div></div>`;
    }).join('')}</div>`;
  }

  function installNativeMobileCueSyncBridge() {
    ensureNativeMobileCueSyncControls(document);
    ensureMobilePreviewShowsAllActions();

    document.addEventListener('click', async (event) => {
      const syncButton = event.target.closest?.('[data-sm-sync-at]');
      if (syncButton) {
        event.preventDefault();
        event.stopPropagation();
        showMobileSyncPicker(Number(syncButton.dataset.smSyncAt) || 0, syncButton.dataset.smSyncPixel || '');
        return;
      }

      if (event.target.closest?.('[data-sm-sync-close]')) {
        event.preventDefault();
        event.stopPropagation();
        document.getElementById('sm-sync-picker')?.remove();
        return;
      }

      const typeButton = event.target.closest?.('[data-sm-sync-type]');
      if (typeButton) {
        event.preventDefault();
        event.stopPropagation();
        const picker = typeButton.closest('#sm-sync-picker');
        const startMs = Number(picker?.dataset.smSyncPickerTime) || 0;
        openSyncedMobileCue(typeButton.dataset.smSyncType, startMs);
        return;
      }

      const copyPixel = event.target.closest?.('[data-sm-sync-copy-pixel]');
      if (copyPixel) {
        event.preventDefault();
        event.stopPropagation();
        const picker = copyPixel.closest('#sm-sync-picker');
        const clipId = picker?.dataset.smSyncPixel || '';
        const api = window.ShowduinoPixelLayers;
        if (!clipId || !api?.createLayerFromClip) {
          window.alert('Pixel layering is still loading. Please try again in a moment.');
          return;
        }
        copyPixel.disabled = true;
        copyPixel.textContent = 'Copying pixel layer…';
        try {
          picker?.remove();
          await api.createLayerFromClip(clipId);
        } catch (error) {
          console.error('[Mobile Sync] Could not copy pixel layer', error);
          window.alert(error?.message || 'Could not copy the pixel layer.');
        }
      }
    });

    const observer = new MutationObserver((mutations) => {
      let touchedMobile = false;
      mutations.forEach((mutation) => {
        if (mutation.target instanceof Element && (mutation.target.id === 'studio-mobile-app' || mutation.target.closest?.('#studio-mobile-app'))) touchedMobile = true;
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.id === 'studio-mobile-app' || node.closest?.('#studio-mobile-app') || node.querySelector?.('#studio-mobile-app')) touchedMobile = true;
        });
      });
      if (!touchedMobile) return;
      ensureNativeMobileCueSyncControls(document);
      ensureMobilePreviewShowsAllActions();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('showduino:project-saved', () => window.setTimeout(() => {
      ensureNativeMobileCueSyncControls(document);
      ensureMobilePreviewShowsAllActions();
    }, 0));
    window.addEventListener('showduino:v4-saved', () => window.setTimeout(() => {
      ensureNativeMobileCueSyncControls(document);
      ensureMobilePreviewShowsAllActions();
    }, 0));
  }

  function modernise(root = document) {
    updateLegacyRoutingLabels(root);
    updateLegacyText(root);
    disableCurrentDmxAffordances(root);
    addArchitectureHint();
    ensureNativeMobileCueSyncControls(root);
    ensureMobilePreviewShowsAllActions();
  }

  function boot() {
    modernise(document);
    installNativeMobileCueSyncBridge();

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