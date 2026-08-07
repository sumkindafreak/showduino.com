/* global TimelineEditor */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') {
    console.error('[Showduino Inspector Drawer] TimelineEditor is unavailable.');
    return;
  }

  const originalShowInspector = TimelineEditor.prototype._showInspector;

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

  // Selection keeps the Inspector content current, but never opens the drawer.
  // This preserves click-and-drag as the primary DAW interaction.
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
