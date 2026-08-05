// Showduino Studio mobile clip manipulation.
// Adds touch-first drag, resize and long-press actions without changing the timeline data model.
(function () {
  'use strict';

  const MOBILE_BREAKPOINT = 768;
  const EDGE_SIZE_PX = 20;
  const MOVE_THRESHOLD_PX = 7;
  const LONG_PRESS_MS = 560;
  const MIN_CLIP_MS = 100;

  let gesture = null;
  let longPressTimer = null;
  let suppressClickUntil = 0;

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function editor() {
    return window.timelineEditor || null;
  }

  function clips(ed) {
    if (!ed) return [];
    if (typeof ed._clips === 'function') return ed._clips();
    return ed._state?.project?.clips || [];
  }

  function tracks(ed) {
    if (!ed) return [];
    const list = typeof ed._tracks === 'function' ? ed._tracks() : (ed._state?.project?.tracks || []);
    return list.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function snapshot(ed) {
    const project = ed?._state?.project;
    if (!project || !Array.isArray(ed._undoStack)) return;
    try {
      ed._undoStack.push(JSON.parse(JSON.stringify(project)));
      if (ed._undoStack.length > 60) ed._undoStack.shift();
      if (Array.isArray(ed._redoStack)) ed._redoStack.length = 0;
    } catch (_) {
      // Undo support is best-effort; editing still continues if cloning fails.
    }
  }

  function snapMs(ed, value) {
    const safe = Math.max(0, value);
    if (ed?._snapEnabled && typeof ed._snapValue === 'function') return Math.max(0, ed._snapValue(safe));
    return safe;
  }

  function pxToMs(ed, px) {
    const scale = Number(ed?._pxPerMs) || 0.1;
    return px / scale;
  }

  function refresh(ed) {
    if (!ed) return;
    if (typeof ed._updateAllClips === 'function') ed._updateAllClips();
    if (typeof ed._renderInspector === 'function') ed._renderInspector();
    if (typeof ed._updateInspector === 'function') ed._updateInspector();
    if (typeof ed._syncPlayheadPosition === 'function') ed._syncPlayheadPosition();
  }

  function selectClip(ed, clipId, clipEl) {
    if (!ed || !clipId) return;
    ed._selectedClipId = clipId;
    refresh(ed);
    clipEl?.classList.add('mobile-clip-selected');
  }

  function announce(message) {
    let region = document.getElementById('mobile-studio-announcer');
    if (!region) {
      region = document.createElement('div');
      region.id = 'mobile-studio-announcer';
      region.className = 'sr-only';
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    region.textContent = '';
    window.setTimeout(() => { region.textContent = message; }, 20);
  }

  function makeId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function closeActions() {
    const sheet = document.getElementById('mobile-clip-actions');
    sheet?.classList.remove('open');
    sheet?.setAttribute('aria-hidden', 'true');
  }

  function ensureActions() {
    let sheet = document.getElementById('mobile-clip-actions');
    if (sheet) return sheet;

    sheet = document.createElement('section');
    sheet.id = 'mobile-clip-actions';
    sheet.className = 'mobile-clip-actions';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="mobile-sheet-handle" aria-hidden="true"></div>
      <div class="mobile-clip-actions-title">
        <div><strong>Clip actions</strong><span id="mobile-clip-actions-name">Selected clip</span></div>
        <button type="button" class="mobile-sheet-close" data-action="close" aria-label="Close clip actions">✕</button>
      </div>
      <div class="mobile-clip-actions-grid">
        <button type="button" data-action="inspect"><span>☷</span><strong>Inspect</strong></button>
        <button type="button" data-action="duplicate"><span>⧉</span><strong>Duplicate</strong></button>
        <button type="button" data-action="delete" class="danger"><span>🗑</span><strong>Delete</strong></button>
      </div>`;

    document.body.appendChild(sheet);
    sheet.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      const ed = editor();
      const clipId = sheet.dataset.clipId;
      const clip = clips(ed).find((item) => item.id === clipId);

      if (action === 'close') {
        closeActions();
        return;
      }
      if (!ed || !clip) return;

      if (action === 'inspect') {
        selectClip(ed, clip.id);
        closeActions();
        window.ShowduinoMobile?.openInspector?.();
        return;
      }

      if (action === 'duplicate') {
        snapshot(ed);
        const copy = JSON.parse(JSON.stringify(clip));
        copy.id = makeId();
        copy.startMs = snapMs(ed, Number(clip.startMs || 0) + Math.max(Number(ed._snapMs) || 250, 250));
        copy.label = copy.label ? `${copy.label} copy` : 'Clip copy';
        clips(ed).push(copy);
        ed._selectedClipId = copy.id;
        refresh(ed);
        closeActions();
        announce('Clip duplicated');
        return;
      }

      if (action === 'delete') {
        const name = clip.label || clip.type || 'clip';
        if (!window.confirm(`Delete ${name}?`)) return;
        snapshot(ed);
        const list = clips(ed);
        const index = list.findIndex((item) => item.id === clip.id);
        if (index >= 0) list.splice(index, 1);
        if (ed._selectedClipId === clip.id) ed._selectedClipId = null;
        refresh(ed);
        closeActions();
        window.ShowduinoMobile?.closeInspector?.();
        announce('Clip deleted');
      }
    });

    return sheet;
  }

  function openActions(ed, clip, clipEl) {
    if (!clip) return;
    selectClip(ed, clip.id, clipEl);
    window.ShowduinoMobile?.closeInspector?.();
    const sheet = ensureActions();
    sheet.dataset.clipId = clip.id;
    const name = sheet.querySelector('#mobile-clip-actions-name');
    if (name) name.textContent = clip.label || clip.type || 'Selected clip';
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    navigator.vibrate?.(20);
  }

  function clearLongPress() {
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function locateTrack(ed, clientY) {
    const canvas = document.querySelector('.tl-canvas');
    const scroll = document.querySelector('.tl-canvas-scroll');
    const ordered = tracks(ed);
    if (!canvas || !ordered.length) return null;
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top + (scroll?.scrollTop || 0);
    const rowHeight = Number(ed._trackHeight) || 60;
    const index = Math.max(0, Math.min(ordered.length - 1, Math.floor(y / rowHeight)));
    return ordered[index] || null;
  }

  function pointerDown(event) {
    if (!isMobile() || event.pointerType === 'mouse' || event.button !== 0) return;
    const clipEl = event.target.closest?.('.tl-clip');
    if (!clipEl) return;

    const ed = editor();
    const clipId = clipEl.dataset.clipId;
    const clip = clips(ed).find((item) => item.id === clipId);
    if (!ed || !clip) return;

    const track = tracks(ed).find((item) => item.id === clip.trackId);
    if (track?.locked) return;

    const rect = clipEl.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const mode = localX <= EDGE_SIZE_PX ? 'resize-left' : (localX >= rect.width - EDGE_SIZE_PX ? 'resize-right' : 'move');

    gesture = {
      pointerId: event.pointerId,
      clipEl,
      clip,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originalStartMs: Number(clip.startMs) || 0,
      originalDurationMs: Math.max(MIN_CLIP_MS, Number(clip.durationMs) || MIN_CLIP_MS),
      originalTrackId: clip.trackId,
      active: false,
      snapshotTaken: false
    };

    clipEl.setPointerCapture?.(event.pointerId);
    clipEl.classList.add('mobile-clip-armed');
    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      if (!gesture || gesture.active) return;
      gesture.longPressed = true;
      openActions(ed, clip, clipEl);
    }, LONG_PRESS_MS);
  }

  function pointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const ed = editor();
    if (!ed) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const distance = Math.hypot(dx, dy);

    if (!gesture.active) {
      if (distance < MOVE_THRESHOLD_PX || gesture.longPressed) return;
      gesture.active = true;
      clearLongPress();
      if (!gesture.snapshotTaken) {
        snapshot(ed);
        gesture.snapshotTaken = true;
      }
      gesture.clipEl.classList.remove('mobile-clip-armed');
      gesture.clipEl.classList.add('mobile-clip-manipulating');
      document.body.classList.add('mobile-clip-gesture');
      window.ShowduinoMobile?.closeInspector?.();
    }

    event.preventDefault();
    const deltaMs = pxToMs(ed, dx);
    const minDuration = Math.max(MIN_CLIP_MS, Number(ed._snapMs) || MIN_CLIP_MS);

    if (gesture.mode === 'move') {
      gesture.clip.startMs = snapMs(ed, gesture.originalStartMs + deltaMs);
      const targetTrack = locateTrack(ed, event.clientY);
      if (targetTrack && !targetTrack.locked) gesture.clip.trackId = targetTrack.id;
    } else if (gesture.mode === 'resize-left') {
      const endMs = gesture.originalStartMs + gesture.originalDurationMs;
      const nextStart = Math.min(endMs - minDuration, snapMs(ed, gesture.originalStartMs + deltaMs));
      gesture.clip.startMs = Math.max(0, nextStart);
      gesture.clip.durationMs = Math.max(minDuration, endMs - gesture.clip.startMs);
    } else {
      gesture.clip.durationMs = Math.max(minDuration, snapMs(ed, gesture.originalDurationMs + deltaMs));
    }

    const left = (Number(gesture.clip.startMs) || 0) * (Number(ed._pxPerMs) || 0.1);
    const width = Math.max(8, (Number(gesture.clip.durationMs) || minDuration) * (Number(ed._pxPerMs) || 0.1));
    gesture.clipEl.style.left = `${left}px`;
    gesture.clipEl.style.width = `${width}px`;

    if (gesture.mode === 'move') {
      const ordered = tracks(ed);
      const index = ordered.findIndex((item) => item.id === gesture.clip.trackId);
      if (index >= 0) gesture.clipEl.style.top = `${index * (Number(ed._trackHeight) || 60) + 8}px`;
    }
  }

  function finishGesture(event, cancelled) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const ed = editor();
    clearLongPress();
    gesture.clipEl.releasePointerCapture?.(event.pointerId);
    gesture.clipEl.classList.remove('mobile-clip-armed', 'mobile-clip-manipulating');
    document.body.classList.remove('mobile-clip-gesture');

    if (cancelled && gesture.active) {
      gesture.clip.startMs = gesture.originalStartMs;
      gesture.clip.durationMs = gesture.originalDurationMs;
      gesture.clip.trackId = gesture.originalTrackId;
    }

    if (gesture.active) {
      suppressClickUntil = Date.now() + 450;
      selectClip(ed, gesture.clip.id);
      refresh(ed);
      announce(gesture.mode === 'move' ? 'Clip moved' : 'Clip resized');
    } else if (!gesture.longPressed) {
      selectClip(ed, gesture.clip.id, gesture.clipEl);
      window.setTimeout(() => window.ShowduinoMobile?.openInspector?.(), 0);
    }

    gesture = null;
  }

  function interceptClick(event) {
    if (Date.now() < suppressClickUntil && event.target.closest?.('.tl-clip')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  document.addEventListener('pointerdown', pointerDown, true);
  document.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', (event) => finishGesture(event, false), true);
  document.addEventListener('pointercancel', (event) => finishGesture(event, true), true);
  document.addEventListener('click', interceptClick, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeActions();
  });

  window.ShowduinoMobileTouch = {
    closeActions
  };
}());
