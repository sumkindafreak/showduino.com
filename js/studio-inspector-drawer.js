/* global TimelineEditor */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') {
    console.error('[Showduino Inspector Drawer] TimelineEditor is unavailable.');
    return;
  }

  const originalShowInspector = TimelineEditor.prototype._showInspector;
  const TAP_MOVE_THRESHOLD_PX = 10;
  const DESKTOP_QUERY = '(min-width: 761px)';
  let pointerGesture = null;

  function isDesktop() {
    return Boolean(window.matchMedia?.(DESKTOP_QUERY)?.matches);
  }

  function emptyInspectorHtml() {
    return (
      '<div class="inspector-empty" role="status">' +
        '<p><strong>Select an action on the timeline</strong><br>to edit its settings.</p>' +
      '</div>'
    );
  }

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

  function showEmptyInspector(editor) {
    if (!editor?._inspectorPanel) return;
    editor._inspectorPanel.innerHTML = emptyInspectorHtml();
    closeInspector();
  }

  function renderInspector(editor, clipId) {
    if (!selectedClipExists(editor, clipId)) {
      showEmptyInspector(editor);
      return false;
    }

    originalShowInspector.call(editor, clipId);
    if (!isDesktop()) addDrawerBar(editor._inspectorPanel);
    return true;
  }

  TimelineEditor.prototype._showInspector = function (clipId) {
    renderInspector(this, clipId);
  };

  const originalDeleteClip = TimelineEditor.prototype._deleteClip;
  if (typeof originalDeleteClip === 'function') {
    TimelineEditor.prototype._deleteClip = function (clipId) {
      const result = originalDeleteClip.call(this, clipId);
      if (!this._selectedClipId || !this._clips().some((clip) => clip.id === this._selectedClipId)) {
        showEmptyInspector(this);
      }
      return result;
    };
  }

  function openInspector(clipId) {
    const editor = window.timelineEditor;
    const targetClipId = clipId || (editor && editor._selectedClipId);
    if (!renderInspector(editor, targetClipId)) return false;
    if (!isDesktop()) document.body.classList.add('studio-inspector-open');
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
    const narrow = window.matchMedia?.('(max-width: 760px)')?.matches;
    return Boolean(coarse || noHover || narrow);
  }

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
    window.setTimeout(() => openInspector(gesture.clipId), 0);
  }, true);

  document.addEventListener('dblclick', (event) => {
    const clip = clipElementFromTarget(event.target);
    if (!clip) return;
    if (isDesktop()) return;
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
