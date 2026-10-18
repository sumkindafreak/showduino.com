// Showduino Studio: make Undo revert clip drags and trims.
// The core, FX and mixer drag handlers call _pushUndo() when the gesture ends, which saved
// the state *after* the change, so Ctrl+Z after a drag or trim did nothing. This wraps the
// final drag/resize entry points so the snapshot taken at the start of the gesture is the
// one recorded. Every other caller of _pushUndo (add, delete, paste, ...) already calls it
// before changing anything and is unaffected.
(function () {
  'use strict';
  if (typeof TimelineEditor === 'undefined') return;
  const proto = TimelineEditor.prototype;
  const originalPush = proto._pushUndo;
  const originalDrag = proto._startDrag;
  const originalResize = proto._startResize;

  function begin(editor) {
    try { editor._gestureSnapshot = JSON.stringify(editor._project()); } catch (_) { editor._gestureSnapshot = null; }
  }

  proto._pushUndo = function () {
    if (this._gestureSnapshot) {
      const before = this._gestureSnapshot;
      this._gestureSnapshot = null;
      let now = null;
      try { now = JSON.stringify(this._project()); } catch (_) {}
      if (now === before) return;            // a click without movement is not an edit
      this._undoStack.push(before);
      if (this._undoStack.length > 50) this._undoStack.shift();
      this._redoStack = [];
      return;
    }
    return originalPush.apply(this, arguments);
  };

  proto._startDrag = function () {
    begin(this);
    return originalDrag.apply(this, arguments);
  };

  proto._startResize = function () {
    begin(this);
    return originalResize.apply(this, arguments);
  };

  // A gesture that ends without an edit (e.g. a locked track) must not leave a stale
  // snapshot behind for a later, unrelated _pushUndo. Window listeners run after the
  // handlers the drag code adds to document.
  window.addEventListener('mouseup', () => {
    const editor = window.timelineEditor;
    if (editor) window.setTimeout(() => { editor._gestureSnapshot = null; }, 0);
  });
})();
