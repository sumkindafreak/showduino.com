/* global TimelineEditor */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') {
    console.error('[Showduino Inspector Drawer] TimelineEditor is unavailable.');
    return;
  }

  const originalShowInspector = TimelineEditor.prototype._showInspector;
  const TAP_MOVE_THRESHOLD_PX = 10;
  let pointerGesture = null;

  function closeInspector() {
    document.body.classList.remove('studio-inspector-open');
  }

  function addDrawerBar(panel) {
    if (!panel || panel.querySelector('.studio-inspector-drawer-bar')) return;

    const bar = document.createElement('div');
    bar.className = 'studio-inspector-drawer-bar';

    const label = document.createElement('span');
    label.className = 'studio-inspector-drawer-label';
    label.textContent = 'Inspector';

    const close = document.createElement('button');
    close.className = 'studio-inspector-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close Inspector');
    close.title = 'Close Inspector';
    close.textContent = '×';
    close.addEventListener('click', closeInspector);

    bar.append(label, close);
    panel.prepend(bar);
  }

  function selectedClipExists(editor, clipId) {
    return Boolean(editor && clipId && editor._clips().some((clip) => clip.id === clipId));
  }

  function renderInspector(editor, clipId) {
    if (!selectedClipExists(editor, clipId)) {
      closeInspector();
      return false;
    }

    originalShowInspector.call(editor, clipId);
    addDrawerBar(editor._inspectorPanel);
    return true;
  }

  // Selection keeps Inspector content current without forcing the drawer open.
  // Touch/mobile taps are handled separately below so dragging stays fluid.
  TimelineEditor.prototype._showInspector = function (clipId) {
    renderInspector(this, clipId);
  };

  const originalDeleteClip = TimelineEditor.prototype._deleteClip;
  if (typeof originalDeleteClip === 'function') {
    TimelineEditor.prototype._deleteClip = function (clipId) {
      const result = originalDeleteClip.call(this, clipId);
      if (!this._selectedClipId || !this._clips().some((clip) => clip.id === this._selectedClipId)) {
        closeInspector();
      }
      return result;
    };
  }

  function openInspector(clipId) {
    const editor = window.timelineEditor;
    const targetClipId = clipId || (editor && editor._selectedClipId);
    if (!renderInspector(editor, targetClipId)) return false;
    document.body.classList.add('studio-inspector-open');
    return true;
  }

  function clipElementFromTarget(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('.timeline-editor .tl-clip[data-clip-id]');
  }

  function shouldTapOpenInspector() {
    if (document.body.classList.contains('studio-mobile-advanced')) return true;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const noHover = window.matchMedia?.('(hover: none)')?.matches;
    const narrow = window.matchMedia?.('(max-width: 900px)')?.matches;
    return Boolean(coarse || noHover || narrow);
  }

  // On phones/tablets a simple tap opens the bottom-sheet Inspector. We track
  // pointer movement so a timeline drag does not accidentally pop the drawer.
  document.addEventListener('pointerdown', (event) => {
    if (!shouldTapOpenInspector()) return;
    const clip = clipElementFromTarget(event.target);
    if (!clip) return;
    pointerGesture = {
      pointerId: event.pointerId,
      clipId: clip.dataset.clipId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointerGesture.startX, event.clientY - pointerGesture.startY) >= TAP_MOVE_THRESHOLD_PX) {
      pointerGesture.moved = true;
    }
  }, true);

  document.addEventListener('pointercancel', (event) => {
    if (pointerGesture && pointerGesture.pointerId === event.pointerId) pointerGesture = null;
  }, true);

  document.addEventListener('pointerup', (event) => {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
    const gesture = pointerGesture;
    pointerGesture = null;
    if (gesture.moved) return;

    // Let the timeline's normal click/select handler run first, then open the
    // drawer for the clip that was tapped.
    window.setTimeout(() => openInspector(gesture.clipId), 0);
  }, true);

  // Desktop keeps single-click selection for fast DAW dragging; double-click is
  // the direct inspect gesture. The existing More menu and context menu remain.
  document.addEventListener('dblclick', (event) => {
    const clip = clipElementFromTarget(event.target);
    if (!clip) return;
    event.preventDefault();
    openInspector(clip.dataset.clipId);
  });

  window.ShowduinoInspectorDrawer = Object.freeze({
    open: openInspector,
    close: closeInspector,
    toggle(clipId) {
      if (document.body.classList.contains('studio-inspector-open')) {
        closeInspector();
        return false;
      }
      return openInspector(clipId);
    }
  });
})();
