// Showduino Studio: touch gestures for the advanced timeline (tablets).
// Adapted from old PR #19. That PR rewrote clip data through editor internals; this version
// only translates touch input into the mouse handlers the timeline already has, so the core,
// FX and mixer drag rules (track types, locked tracks, overlaps, snapping, undo, autosave)
// stay the single source of truth. Mouse and pen input are not touched.
//
//   Tap a clip            select it (the timeline's own click handler)
//   Drag a selected clip  move it in time or to another track
//   Drag its edges        trim the start or end
//   Drag an unselected    scroll the timeline as before
//   Pinch                 zoom the timeline around the fingers
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof TimelineEditor === 'undefined') return;

  const MOVE_THRESHOLD_PX = 8;     // finger travel before a drag starts (a tap stays a tap)
  const EDGE_MIN_PX = 16;          // edge zone that trims instead of moving
  const STYLE_ID = 'tl-touch-armed-style';

  let drag = null;                 // { pointerId, clipId, mode, startX, startY, started }
  let pinch = null;                // { startDist, startPx, anchorMs, rafPending }

  const editor = () => window.timelineEditor || null;

  function mouseLike(x, y, target) {
    return {
      clientX: x, clientY: y, button: 0, buttons: 1,
      ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      target, preventDefault() {}, stopPropagation() {}
    };
  }

  function sendMouse(type, x, y) {
    document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1 }));
  }

  // The selected clip is the only one a finger can grab. Its touch-action is set before the
  // next touch begins, so the browser hands that gesture to us instead of scrolling.
  function armSelected() {
    const ed = editor();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    const id = ed && ed._selectedClipId;
    if (!id) { style.textContent = ''; return; }
    const sel = `.timeline-editor .tl-clip[data-clip-id="${CSS.escape(String(id))}"]`;
    style.textContent =
      `${sel}{touch-action:none}` +
      `@media (pointer:coarse){${sel} .tl-clip-handle{width:${EDGE_MIN_PX}px!important;background:rgba(255,255,255,.38)!important}}`;
  }

  function lockedTrack(ed, clipId) {
    const track = typeof ed._getClipTrack === 'function' ? ed._getClipTrack(clipId) : null;
    return Boolean(track && track.locked);
  }

  function edgeMode(clipEl, x) {
    const rect = clipEl.getBoundingClientRect();
    const zone = Math.max(EDGE_MIN_PX, Math.min(rect.width * 0.25, 28));
    if (rect.width < zone * 2 + 8) return 'move';   // too short to trim safely by finger
    if (x - rect.left <= zone) return 'left';
    if (rect.right - x <= zone) return 'right';
    return 'move';
  }

  function onPointerDown(event) {
    if (event.pointerType !== 'touch' || drag || pinch) return;
    const clipEl = event.target.closest?.('.timeline-editor .tl-clip[data-clip-id]');
    const ed = editor();
    if (!clipEl || !ed || clipEl.dataset.clipId !== String(ed._selectedClipId)) return;
    if (lockedTrack(ed, clipEl.dataset.clipId)) return;

    // Stops the browser's compatibility mousedown, which would start a second drag.
    // The tap's click (selection) still fires.
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      clipId: clipEl.dataset.clipId,
      mode: edgeMode(clipEl, event.clientX),
      startX: event.clientX,
      startY: event.clientY,
      target: event.target,
      started: false
    };
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    if (!drag.started) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < MOVE_THRESHOLD_PX) return;
      const ed = editor();
      if (!ed) { drag = null; return; }
      drag.started = true;
      document.documentElement.classList.add('tl-touch-dragging');
      const start = mouseLike(drag.startX, drag.startY, drag.target);
      if (drag.mode === 'move') ed._startDrag(start, drag.clipId);
      else ed._startResize(start, drag.clipId, drag.mode);
    }
    sendMouse('mousemove', event.clientX, event.clientY);
  }

  function onPointerEnd(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const started = drag.started;
    drag = null;
    document.documentElement.classList.remove('tl-touch-dragging');
    if (started) sendMouse('mouseup', event.clientX, event.clientY);
    window.requestAnimationFrame(armSelected);
  }

  // Pinch uses touch events: a second finger cancels pointer streams on most browsers.
  function scrollEl(target) {
    return target?.closest?.('.timeline-editor .tl-canvas-scroll') || null;
  }

  function dist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  function onTouchStart(event) {
    if (event.touches.length !== 2) return;
    const ed = editor();
    const scroller = scrollEl(event.target);
    if (!ed || !scroller || scroller !== ed._canvasScroll) return;
    if (drag) {   // a second finger turns a clip drag into a pinch; finish the drag cleanly
      if (drag.started) sendMouse('mouseup', drag.startX, drag.startY);
      drag = null;
      document.documentElement.classList.remove('tl-touch-dragging');
    }
    const [a, b] = event.touches;
    const rect = scroller.getBoundingClientRect();
    const midX = (a.clientX + b.clientX) / 2 - rect.left;
    pinch = {
      scroller,
      startDist: Math.max(1, dist(a, b)),
      startPx: ed._pxPerMs,
      anchorMs: ed._xToMs(scroller.scrollLeft + midX),
      midX,
      nextPx: ed._pxPerMs,
      rafPending: false
    };
  }

  function applyPinch() {
    const ed = editor();
    if (!pinch || !ed) return;
    pinch.rafPending = false;
    const factor = pinch.nextPx / ed._pxPerMs;
    if (Math.abs(factor - 1) > 0.001) ed._zoom(factor);
    // _zoom clamps; re-anchor so the point under the fingers stays put.
    pinch.scroller.scrollLeft = Math.max(0, ed._msToX(pinch.anchorMs) - pinch.midX);
  }

  function onTouchMove(event) {
    if (!pinch) return;
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const [a, b] = event.touches;
    const rect = pinch.scroller.getBoundingClientRect();
    pinch.midX = (a.clientX + b.clientX) / 2 - rect.left;
    pinch.nextPx = pinch.startPx * (dist(a, b) / pinch.startDist);
    if (!pinch.rafPending) {
      pinch.rafPending = true;
      window.requestAnimationFrame(applyPinch);
    }
  }

  function onTouchEnd(event) {
    if (pinch && event.touches.length < 2) pinch = null;
  }

  // iPad Safari fires its own pinch gesture events; keep them from zooming the whole page
  // while the fingers are on the timeline.
  function onGesture(event) {
    if (scrollEl(event.target)) event.preventDefault();
  }

  const originalSelect = TimelineEditor.prototype._selectClip;
  TimelineEditor.prototype._selectClip = function (clipId) {
    const result = originalSelect.apply(this, arguments);
    if (this === editor()) window.requestAnimationFrame(armSelected);
    return result;
  };

  function install() {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', onTouchEnd, true);
    document.addEventListener('touchcancel', onTouchEnd, true);
    document.addEventListener('gesturestart', onGesture, { passive: false });
    document.addEventListener('gesturechange', onGesture, { passive: false });
    // Selection can also change without _selectClip (delete, undo, project load).
    document.addEventListener('click', () => window.requestAnimationFrame(armSelected), true);
    armSelected();
  }

  window.ShowduinoTimelineTouch = { armSelected, edgeMode, MOVE_THRESHOLD_PX, EDGE_MIN_PX };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
