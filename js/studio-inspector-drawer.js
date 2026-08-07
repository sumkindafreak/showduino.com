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

  TimelineEditor.prototype._showInspector = function (clipId) {
    originalShowInspector.call(this, clipId);

    const clipExists = Boolean(clipId && this._clips().some((clip) => clip.id === clipId));
    if (!clipExists) {
      closeInspector();
      return;
    }

    addDrawerBar(this._inspectorPanel);
    document.body.classList.add('studio-inspector-open');
  };

  // If a selected clip is deleted, make sure the now-empty drawer disappears.
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

  // Public helper used by the existing mobile Inspector button.
  window.ShowduinoInspectorDrawer = Object.freeze({
    open() { document.body.classList.add('studio-inspector-open'); },
    close: closeInspector,
    toggle() { document.body.classList.toggle('studio-inspector-open'); }
  });
})();
