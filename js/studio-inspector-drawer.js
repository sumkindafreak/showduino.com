/* global TimelineEditor */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') {
    console.error('[Showduino Inspector Drawer] TimelineEditor is unavailable.');
    return;
  }

  const originalShowInspector = TimelineEditor.prototype._showInspector;
  const TAP_MOVE_THRESHOLD_PX = 10;
  // Column layout only where the timeline keeps enough width beside it. Between 761 and
  // 1199 px (tablets, small laptop windows) the Inspector slides in over the timeline
  // instead of permanently taking 320 px from it.
  const DESKTOP_QUERY = '(min-width: 1200px)';
  let pointerGesture = null;
  let returnFocus = null;

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
    const wasOpen = document.body.classList.contains('studio-inspector-open');
    document.body.classList.remove('studio-inspector-open');
    if (wasOpen && returnFocus && document.contains(returnFocus)) {
      try { returnFocus.focus({ preventScroll: true }); } catch (_) {}
    }
    returnFocus = null;
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
    if (!isDesktop()) {
      if (!document.body.classList.contains('studio-inspector-open')) {
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      document.body.classList.add('studio-inspector-open');
    }
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
    // Below the column breakpoint the Inspector is hidden until a cue is opened, so a
    // tap or click on a cue must open it whatever the pointer type.
    return Boolean(coarse || noHover || !isDesktop());
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

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !document.body.classList.contains('studio-inspector-open')) return;
    if (isDesktop()) return;
    closeInspector();
  });

  // Growing the window into the column layout must not leave a stale "open" state behind.
  const desktopMedia = window.matchMedia?.(DESKTOP_QUERY);
  const onLayoutChange = () => {
    if (isDesktop()) {
      document.body.classList.remove('studio-inspector-open');
      window.timelineEditor?._inspectorPanel?.querySelector('.studio-inspector-drawer-bar')?.remove();
    } else if (window.timelineEditor?._inspectorPanel && document.body.classList.contains('studio-inspector-open')) {
      addDrawerBar(window.timelineEditor._inspectorPanel);
    }
  };
  if (desktopMedia?.addEventListener) desktopMedia.addEventListener('change', onLayoutChange);
  else if (desktopMedia?.addListener) desktopMedia.addListener(onLayoutChange);

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
