/* Showduino Studio — creator bootstrap loaded after the existing application. */
(function () {
  'use strict';

  const PUBLIC_HOST = 'show-duino.com';
  const WRONG_PUBLIC_HOST = 'showduino.com';
  let pixelNormalising = false;
  let pixelSaveTimer = 0;
  let pixelUiObserver = null;
  let previewTimer = 0;

  function correctPublicLink(anchor) {
    if (!anchor || !anchor.getAttribute) return;
    const href = anchor.getAttribute('href');
    if (!href || !/^https?:\/\//i.test(href)) return;

    try {
      const url = new URL(href, window.location.href);
      if (url.hostname !== WRONG_PUBLIC_HOST && !url.hostname.endsWith(`.${WRONG_PUBLIC_HOST}`)) return;
      const prefix = url.hostname.slice(0, -(WRONG_PUBLIC_HOST.length));
      url.hostname = `${prefix}${PUBLIC_HOST}`;
      anchor.setAttribute('href', url.toString());
      if (String(anchor.textContent || '').trim() === WRONG_PUBLIC_HOST) {
        anchor.textContent = PUBLIC_HOST;
      }
    } catch (_) {
      // Invalid/non-navigation hrefs are ignored.
    }
  }

  function enforcePublicDomain(root) {
    if (!root) return;
    if (root.matches?.('a[href]')) correctPublicLink(root);
    root.querySelectorAll?.('a[href]').forEach(correctPublicLink);
  }

  function installPublicDomainGuard() {
    enforcePublicDomain(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node?.nodeType === 1) enforcePublicDomain(node);
        });
        if (mutation.type === 'attributes' && mutation.target?.nodeType === 1) {
          enforcePublicDomain(mutation.target);
        }
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
    window.ShowduinoPublicDomain = Object.freeze({
      host: PUBLIC_HOST,
      origin: `https://${PUBLIC_HOST}`,
      enforce: enforcePublicDomain
    });
  }

  function project() {
    return window.state?.project || null;
  }

  function deepCopy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function pixelParams(clip) {
    return clip?.params && typeof clip.params === 'object' ? clip.params : {};
  }

  function pixelSegmentKey(clip) {
    if (!clip || clip.type !== 'pixel') return '';
    const p = pixelParams(clip);
    const mode = String(p.segmentMode || 'range');
    const line = Math.max(1, Math.round(Number(p.line) || 1));
    const start = Math.max(0, Math.round(Number(p.startPixel) || 0));
    const length = Math.max(1, Math.round(Number(p.length) || 1));
    const group = Math.max(1, Math.round(Number(p.groupSize) || 10));
    const marker = Math.max(0, Math.round(Number(p.markerOffset) || 0));
    const node = String(clip.routing?.nodeId || '').trim().toLowerCase();
    const output = String(clip.routing?.output || '').trim().toLowerCase();
    return [node, output, line, mode, start, length, group, marker].join('|');
  }

  function pixelTrackName(clip) {
    const p = pixelParams(clip);
    const line = Math.max(1, Math.round(Number(p.line) || 1));
    const start = Math.max(0, Math.round(Number(p.startPixel) || 0));
    const length = Math.max(1, Math.round(Number(p.length) || 1));
    if ((p.segmentMode || 'range') === 'repeat-marker') {
      const group = Math.max(1, Math.round(Number(p.groupSize) || 10));
      const marker = Math.max(0, Math.round(Number(p.markerOffset) || 0));
      return `PX L${line} · ${start}+${length} · every ${group} @${marker}`;
    }
    return `PX L${line} · ${start}–${start + length - 1}`;
  }

  function genericPixelTrackName(name) {
    return /^(pixel|pixel fx|pixel track|pixels)$/i.test(String(name || '').trim());
  }

  function createPixelTrack(clip, order) {
    const p = project();
    if (!p || !window.SHDOModel?.createTrack) return null;
    const track = window.SHDOModel.createTrack('pixel', pixelTrackName(clip), order);
    track.pixelLayerAuto = true;
    track.pixelLayerKey = pixelSegmentKey(clip);
    p.tracks.push(track);
    return track;
  }

  function normalisePixelTracks() {
    if (pixelNormalising) return false;
    const p = project();
    if (!p || !Array.isArray(p.clips) || !Array.isArray(p.tracks)) return false;
    const pixelClips = p.clips.filter((clip) => clip?.type === 'pixel');
    if (!pixelClips.length) return false;

    pixelNormalising = true;
    let changed = false;
    try {
      const groups = new Map();
      pixelClips.forEach((clip) => {
        const key = pixelSegmentKey(clip);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(clip);
      });

      const claimed = new Set();
      groups.forEach((group, key) => {
        let track = p.tracks.find((candidate) => candidate?.type === 'pixel' && candidate.pixelLayerKey === key && !claimed.has(candidate.id));

        if (!track) {
          const preferred = p.tracks.find((candidate) => candidate?.id === group[0]?.trackId && candidate?.type === 'pixel' && !claimed.has(candidate.id));
          if (preferred) track = preferred;
        }

        if (!track) track = createPixelTrack(group[0], p.tracks.length);
        if (!track) return;

        claimed.add(track.id);
        if (track.pixelLayerKey !== key) { track.pixelLayerKey = key; changed = true; }
        if (track.pixelLayerAuto !== true) { track.pixelLayerAuto = true; changed = true; }
        const desiredName = pixelTrackName(group[0]);
        if ((track.pixelLayerAuto || genericPixelTrackName(track.name)) && track.name !== desiredName) {
          track.name = desiredName;
          changed = true;
        }

        group.forEach((clip) => {
          if (clip.trackId !== track.id) {
            clip.trackId = track.id;
            changed = true;
          }
        });
      });

      const usedTrackIds = new Set(pixelClips.map((clip) => clip.trackId));
      const before = p.tracks.length;
      p.tracks = p.tracks.filter((track) => !(track?.type === 'pixel' && track.pixelLayerAuto === true && !usedTrackIds.has(track.id)));
      if (p.tracks.length !== before) changed = true;
      p.tracks.forEach((track, index) => {
        if (track.order !== index) {
          track.order = index;
          changed = true;
        }
      });
    } finally {
      pixelNormalising = false;
    }
    return changed;
  }

  function schedulePixelTrackSave() {
    window.clearTimeout(pixelSaveTimer);
    pixelSaveTimer = window.setTimeout(async () => {
      try {
        if (normalisePixelTracks()) {
          await window.ShowduinoProjects?.saveCurrentProject?.({ cloud: false });
          window.ShowduinoStudioV4?.refreshProjectStats?.();
        }
      } catch (error) {
        console.warn('[Showduino Pixel Layers] Could not persist pixel lanes', error);
      }
    }, 120);
  }

  function pixelSummary(clip) {
    const p = pixelParams(clip);
    const line = Math.max(1, Math.round(Number(p.line) || 1));
    const start = Math.max(0, Math.round(Number(p.startPixel) || 0));
    const length = Math.max(1, Math.round(Number(p.length) || 1));
    return `L${line} · PX ${start}–${start + length - 1}`;
  }

  function decoratePixelRows(root) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll('.sm-cue-row[data-sm-edit]').forEach((row) => {
      const id = row.dataset.smEdit;
      const clip = project()?.clips?.find((candidate) => String(candidate.id) === String(id));
      if (!clip || clip.type !== 'pixel') return;

      const info = row.querySelector('.sm-cue-info span');
      if (info && !info.dataset.pixelLayerSummary) {
        const existing = String(info.textContent || '').trim();
        info.textContent = `${existing}${existing ? ' · ' : ''}${pixelSummary(clip)}`;
        info.dataset.pixelLayerSummary = '1';
      }

      const selectorId = String(id).replaceAll('"', '\\"');
      if (row.parentElement?.querySelector(`[data-sm-layer-from="${selectorId}"]`)) return;
      const layer = document.createElement('button');
      layer.type = 'button';
      layer.className = 'sm-btn sm-pixel-layer-button';
      layer.dataset.smLayerFrom = id;
      layer.textContent = '＋ Layer pixels with this cue';
      layer.style.cssText = 'width:100%;margin:-.28rem 0 .48rem;border-style:dashed;font-size:.64rem;';
      row.insertAdjacentElement('afterend', layer);
    });
  }

  async function createLayerFromClip(clipId) {
    const p = project();
    const base = p?.clips?.find((clip) => String(clip.id) === String(clipId));
    if (!base || base.type !== 'pixel' || !window.SHDOModel?.createClip) return null;

    const layer = window.SHDOModel.createClip('pending', 'pixel', Number(base.startMs) || 0, Math.max(10, Number(base.durationMs) || 1000), 'Pixel Layer');
    layer.routing = deepCopy(base.routing || { nodeId: '', output: '' });
    layer.params = deepCopy(base.params || {});
    layer.notes = base.notes || '';
    layer.enabled = base.enabled !== false;

    const params = layer.params || (layer.params = {});
    if ((params.segmentMode || 'range') === 'repeat-marker') {
      const group = Math.max(1, Math.round(Number(params.groupSize) || 10));
      params.markerOffset = (Math.max(0, Math.round(Number(params.markerOffset) || 0)) + 1) % group;
      params.segmentName = `${params.segmentName || 'Segment'} Layer`;
    } else {
      const start = Math.max(0, Math.round(Number(params.startPixel) || 0));
      const length = Math.max(1, Math.round(Number(params.length) || 1));
      params.startPixel = start + length;
      params.segmentName = `${params.segmentName || 'Segment'} Layer`;
    }
    params.blackoutAtEnd = true;

    p.clips.push(layer);
    normalisePixelTracks();
    p.project.updatedAt = new Date().toISOString();
    try { await window.ShowduinoProjects?.saveCurrentProject?.({ cloud: false }); } catch (_) {}
    window.ShowduinoMobileStudio?.render?.();
    window.setTimeout(() => document.querySelector(`[data-sm-edit="${layer.id}"]`)?.click(), 30);
    return layer;
  }

  function parsePreviewTime(text) {
    const match = String(text || '').trim().match(/^(\d+):(\d+)\.(\d+)$/);
    if (!match) return 0;
    return Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(match[3]);
  }

  function rgbForClip(clip) {
    const p = pixelParams(clip);
    const brightness = Math.max(0, Math.min(255, Number(p.brightness ?? 255))) / 255;
    const r = Math.round(Math.max(0, Math.min(255, Number(p.r) || 0)) * brightness);
    const g = Math.round(Math.max(0, Math.min(255, Number(p.g) || 0)) * brightness);
    const b = Math.round(Math.max(0, Math.min(255, Number(p.b) || 0)) * brightness);
    return `rgb(${r},${g},${b})`;
  }

  function effectPixelOn(clip, index, timeMs) {
    const p = pixelParams(clip);
    const start = Math.max(0, Math.round(Number(p.startPixel) || 0));
    const length = Math.max(1, Math.round(Number(p.length) || 1));
    if (index < start || index >= start + length) return false;
    if ((p.segmentMode || 'range') === 'repeat-marker') {
      const group = Math.max(1, Math.round(Number(p.groupSize) || 10));
      const marker = Math.max(0, Math.round(Number(p.markerOffset) || 0));
      if (((index - start) % group) !== marker) return false;
    }

    const effect = String(p.effect || 'solid').toLowerCase();
    if (effect === 'blackout' || effect === 'off') return false;
    const elapsed = Math.max(0, timeMs - Number(clip.startMs || 0));
    const speed = Math.max(1, Number(p.speed) || 50);
    if (['flash', 'strobe'].includes(effect)) return Math.floor(elapsed / Math.max(45, 700 - speed * 6)) % 2 === 0;
    if (['lightning', 'flicker', 'sparkle', 'twinkle'].includes(effect)) return ((Math.floor(elapsed / 90) + index * 7) % 4) !== 0;
    if (['chase', 'comet', 'scanner', 'meteor', 'wave', 'ripple', 'theatre'].includes(effect)) {
      const phase = Math.floor(elapsed / Math.max(35, 260 - Math.min(100, speed) * 2)) % Math.max(1, length);
      return Math.abs((index - start) - phase) <= 1;
    }
    return true;
  }

  function renderCompositePixelPreview() {
    const target = document.getElementById('sm-preview-pixels');
    const timeEl = document.getElementById('sm-preview-time');
    const p = project();
    if (!target || !timeEl || !p?.clips) return;

    const timeMs = parsePreviewTime(timeEl.textContent);
    const active = p.clips
      .filter((clip) => clip?.type === 'pixel' && clip.enabled !== false && timeMs >= Number(clip.startMs || 0) && timeMs < Number(clip.startMs || 0) + Math.max(1, Number(clip.durationMs || 0)))
      .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0));
    if (!active.length) return;

    const selectedLine = Math.max(1, Math.round(Number(pixelParams(active[0]).line) || 1));
    const layers = active.filter((clip) => Math.max(1, Math.round(Number(pixelParams(clip).line) || 1)) === selectedLine);
    const state = Array.from({ length: 30 }, () => null);
    layers.forEach((clip) => {
      const colour = rgbForClip(clip);
      for (let index = 0; index < state.length; index += 1) {
        if (effectPixelOn(clip, index, timeMs)) state[index] = colour;
      }
    });

    target.innerHTML = `<div class="sm-pixel-shell"><div class="sm-pixel-strip">${state.map((colour) => colour
      ? `<i class="sm-pixel on" style="background:${colour};box-shadow:0 0 10px ${colour};"></i>`
      : '<i class="sm-pixel"></i>').join('')}</div><div style="margin-top:.3rem;color:#71848f;font-size:.58rem;">LINE ${selectedLine} · ${layers.length} ACTIVE PIXEL LAYER${layers.length === 1 ? '' : 'S'}</div></div>`;
  }

  function installPixelLayerUi() {
    normalisePixelTracks();
    decoratePixelRows(document);

    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-sm-layer-from]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      createLayerFromClip(button.dataset.smLayerFrom);
    }, true);

    pixelUiObserver = new MutationObserver((mutations) => {
      let shouldNormalise = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node?.nodeType !== 1) return;
          decoratePixelRows(node);
          if (node.matches?.('.timeline-clip,[data-sm-edit]') || node.querySelector?.('.timeline-clip,[data-sm-edit]')) shouldNormalise = true;
        });
      });
      if (shouldNormalise && normalisePixelTracks()) schedulePixelTrackSave();
    });
    pixelUiObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('showduino:project-saved', () => {
      if (normalisePixelTracks()) schedulePixelTrackSave();
      window.setTimeout(() => decoratePixelRows(document), 0);
    });
    window.addEventListener('showduino:v4-saved', () => {
      if (normalisePixelTracks()) schedulePixelTrackSave();
      window.setTimeout(() => decoratePixelRows(document), 0);
    });

    previewTimer = window.setInterval(renderCompositePixelPreview, 60);
  }

  window.ShowduinoPixelLayers = Object.freeze({
    normalisePixelTracks,
    pixelSegmentKey,
    pixelTrackName,
    createLayerFromClip,
    renderCompositePixelPreview
  });

  document.addEventListener('DOMContentLoaded', () => {
    installPublicDomainGuard();
    const current = project();
    if (current && window.ShowduinoPackage) {
      window.ShowduinoPackage.ensurePackageMetadata(current);
    }
    installPixelLayerUi();
  });
})();
