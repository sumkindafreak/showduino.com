/* Showduino Studio — guided timeline drop zones.
 * Makes the timeline readable before any tracks exist and lets users drop
 * library presets straight onto an empty timeline. */
/* global TimelineEditor */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') return;

  const originalRenderTracks = TimelineEditor.prototype._renderTracks;
  const originalBuildTrackRow = TimelineEditor.prototype._buildTrackRow;

  function titleFor(type) {
    const clean = String(type || 'show').replace(/[-_]/g, ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function readPreset(event) {
    const transfer = event.dataTransfer;
    if (!transfer) return null;

    const raw = transfer.getData('application/x-showduino-preset');
    if (raw) {
      try { return JSON.parse(raw); } catch (_) {}
    }

    const type = transfer.getData('blockType');
    if (!type) return null;
    return { name: `${titleFor(type)} Cue`, type, durationMs: 5000, params: {} };
  }

  function timelinePosition(editor, event) {
    const rect = editor._canvas.getBoundingClientRect();
    const x = Math.max(0, event.clientX - rect.left);
    const rawMs = editor._xToMs(x);
    return editor._snapEnabled ? editor._snapValue(rawMs) : rawMs;
  }

  function ensureTrack(editor, preset) {
    const existing = editor._tracks().find((track) => track.type === preset.type && !track.locked);
    if (existing) return existing;
    return editor.addTrack(preset.type, `${titleFor(preset.type)} Track ${editor._tracks().filter((track) => track.type === preset.type).length + 1}`);
  }

  function insertPreset(editor, preset, startMs) {
    const track = ensureTrack(editor, preset);
    if (typeof editor._insertPreset === 'function') {
      return editor._insertPreset(track.id, preset, startMs);
    }
    return editor._addClip(track.id, preset.type, startMs, preset.durationMs || 5000);
  }

  function createEmptyDrop(editor) {
    const existing = editor._canvas.querySelector('.tl-empty-drop');
    if (existing) existing.remove();
    if (editor._tracks().length) return;

    const empty = document.createElement('div');
    empty.className = 'tl-empty-drop';
    empty.innerHTML = '<strong>Start building your show</strong><span>Drag an effect here, or tap an item in the Library. Studio will create the correct track automatically.</span>';

    empty.addEventListener('dragenter', (event) => {
      event.preventDefault();
      empty.classList.add('is-drop-target');
    });

    empty.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      empty.classList.add('is-drop-target');
    });

    empty.addEventListener('dragleave', (event) => {
      if (!empty.contains(event.relatedTarget)) empty.classList.remove('is-drop-target');
    });

    empty.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      empty.classList.remove('is-drop-target');
      const preset = readPreset(event);
      if (!preset) return;
      insertPreset(editor, preset, timelinePosition(editor, event));
    });

    editor._canvas.appendChild(empty);
  }

  TimelineEditor.prototype._renderTracks = function () {
    originalRenderTracks.call(this);

    const clips = this._clips();
    this._canvas.querySelectorAll('.timeline-lane').forEach((row) => {
      const trackId = row.dataset.trackId;
      row.classList.toggle('is-empty', !clips.some((clip) => clip.trackId === trackId));
    });

    createEmptyDrop(this);
  };

  TimelineEditor.prototype._buildTrackRow = function (track) {
    const row = originalBuildTrackRow.call(this, track);
    row.classList.add('timeline-lane');
    row.dataset.trackType = track.type;

    const hint = document.createElement('div');
    hint.className = 'timeline-lane-hint';
    hint.textContent = `Drop ${titleFor(track.type)} here`;
    row.appendChild(hint);

    const activate = (event) => {
      event.preventDefault();
      row.classList.add('is-drop-target');
    };
    row.addEventListener('dragenter', activate);
    row.addEventListener('dragover', activate);
    row.addEventListener('dragleave', (event) => {
      if (!row.contains(event.relatedTarget)) row.classList.remove('is-drop-target');
    });
    row.addEventListener('drop', () => row.classList.remove('is-drop-target'));

    return row;
  };

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.is-drop-target').forEach((element) => element.classList.remove('is-drop-target'));
  });
})();
