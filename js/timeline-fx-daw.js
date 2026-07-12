/* global TimelineEditor, SHDOModel */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') {
    console.error('[Showduino DAW] TimelineEditor is unavailable.');
    return;
  }

  const PRESETS = [
    { name: 'Audio Cue', type: 'audio', icon: '🎵', durationMs: 5000, params: { file: '', volume: 100, loop: false, fadeIn: 0, fadeOut: 0 } },
    { name: 'Impact Hit', type: 'audio', icon: '💥', durationMs: 1200, params: { file: 'impact.mp3', volume: 100, loop: false, fadeIn: 0, fadeOut: 120 } },
    { name: 'Ambient Loop', type: 'audio', icon: '🌫️', durationMs: 15000, params: { file: 'ambience.mp3', volume: 70, loop: true, fadeIn: 1000, fadeOut: 1000 } },
    { name: 'Relay Pulse', type: 'relay', icon: '⚡', durationMs: 500, params: { out: 'out1', state: true, pulseMs: 500 } },
    { name: 'Relay Hold', type: 'relay', icon: '🔌', durationMs: 3000, params: { out: 'out1', state: true, pulseMs: 0 } },
    { name: 'Light Fade', type: 'lighting', icon: '💡', durationMs: 3000, params: { r: 255, g: 255, b: 255, brightness: 255, effect: 'fade' } },
    { name: 'Strobe', type: 'lighting', icon: '⚠️', durationMs: 1200, params: { r: 255, g: 255, b: 255, brightness: 255, effect: 'flash' } },
    { name: 'Pixel Chase', type: 'pixel', icon: '🌈', durationMs: 5000, params: { r: 0, g: 255, b: 204, brightness: 255, effect: 'chase', line: 1 } },
    { name: 'Pixel Pulse', type: 'pixel', icon: '🟢', durationMs: 2500, params: { r: 0, g: 255, b: 80, brightness: 220, effect: 'pulse', line: 1 } },
    { name: 'DMX Scene', type: 'dmx', icon: '🎛️', durationMs: 5000, params: { channels: {} } },
    { name: 'Prop Trigger', type: 'prop', icon: '⚙️', durationMs: 500, params: { action: 'trigger', value: 1 } },
    { name: 'Event Trigger', type: 'trigger', icon: '🎯', durationMs: 250, params: { event: '', payload: '' } },
    { name: 'FX Block', type: 'fx', icon: '✨', durationMs: 2000, params: { effect: 'custom', intensity: 100 } }
  ];

  const originalRender = TimelineEditor.prototype._render;
  const originalRenderClip = TimelineEditor.prototype._renderClip;
  const originalBuildTrackRow = TimelineEditor.prototype._buildTrackRow;
  const originalStartDrag = TimelineEditor.prototype._startDrag;

  function formatMs(ms) {
    const total = Math.max(0, Number(ms) || 0);
    const seconds = Math.floor(total / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(total % 1000).padStart(3, '0')}`;
  }

  TimelineEditor.prototype._render = function () {
    originalRender.call(this);
    this._installFxLibrary();
    this._installDawShortcutsHint();
  };

  TimelineEditor.prototype._installFxLibrary = function () {
    const header = this._el.querySelector('.tl-track-list-header');
    if (!header || header.querySelector('.daw-library')) return;

    header.textContent = '';
    header.style.display = 'block';

    const library = document.createElement('section');
    library.className = 'daw-library';
    library.innerHTML = `
      <div class="daw-library-head">
        <span>FX Library</span>
        <button class="daw-library-toggle" type="button" aria-label="Toggle FX library">▾</button>
      </div>
      <div class="daw-library-body">
        <input class="daw-search" type="search" placeholder="Search FX…" aria-label="Search effects">
        <div class="daw-presets"></div>
      </div>`;

    const list = library.querySelector('.daw-presets');
    const search = library.querySelector('.daw-search');

    const render = (query) => {
      const term = String(query || '').toLowerCase();
      list.innerHTML = '';
      PRESETS.filter((preset) => `${preset.name} ${preset.type}`.toLowerCase().includes(term)).forEach((preset) => {
        const item = document.createElement('div');
        item.className = 'daw-preset';
        item.draggable = true;
        item.innerHTML = `<div class="daw-preset-icon">${preset.icon}</div><div><div class="daw-preset-name">${preset.name}</div><div class="daw-preset-meta">${preset.type} · ${formatMs(preset.durationMs)}</div></div>`;
        item.addEventListener('dragstart', (event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-showduino-preset', JSON.stringify(preset));
          event.dataTransfer.setData('blockType', preset.type);
        });
        item.addEventListener('dblclick', () => {
          const track = this._tracks().find((candidate) => candidate.type === preset.type && !candidate.locked) || this._tracks().find((candidate) => !candidate.locked);
          if (!track) {
            this._toast('Add a track before inserting FX.');
            return;
          }
          this._insertPreset(track.id, preset, this._state.playhead || 0);
        });
        list.appendChild(item);
      });
    };

    search.addEventListener('input', () => render(search.value));
    library.querySelector('.daw-library-toggle').addEventListener('click', () => library.classList.toggle('collapsed'));
    render('');
    header.appendChild(library);
  };

  TimelineEditor.prototype._installDawShortcutsHint = function () {
    const toolbar = this._el.querySelector('.tl-toolbar');
    if (!toolbar || toolbar.querySelector('.daw-shortcuts')) return;
    const hint = document.createElement('div');
    hint.className = 'daw-shortcuts';
    hint.textContent = 'Space Play/Pause · Del Remove · Ctrl+D Duplicate · Ctrl+S Save';
    toolbar.appendChild(hint);
  };

  TimelineEditor.prototype._buildTrackRow = function (track) {
    const row = originalBuildTrackRow.call(this, track);

    row.addEventListener('dragenter', () => row.classList.add('daw-drop-active'));
    row.addEventListener('dragleave', (event) => {
      if (!row.contains(event.relatedTarget)) row.classList.remove('daw-drop-active');
    });

    row.addEventListener('drop', (event) => {
      const raw = event.dataTransfer.getData('application/x-showduino-preset');
      if (!raw) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      row.classList.remove('daw-drop-active');
      if (track.locked) {
        this._toast('That track is locked.');
        return;
      }
      const preset = JSON.parse(raw);
      const rect = this._canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const startMs = this._snapEnabled ? this._snapValue(this._xToMs(x)) : this._xToMs(x);
      this._insertPreset(track.id, preset, startMs);
    }, true);

    return row;
  };

  TimelineEditor.prototype._insertPreset = function (trackId, preset, startMs) {
    this._pushUndo();
    const clip = SHDOModel.createClip(trackId, preset.type, Math.max(0, startMs), preset.durationMs, preset.name);
    clip.params = JSON.parse(JSON.stringify(preset.params || {}));
    this._project().clips.push(clip);
    this._renderClip(clip);
    this._selectClip(clip.id);
    this._autosave();
    this._log(`FX added: ${preset.name}`, 'FX');
    this._toast(`${preset.name} added`);
    return clip;
  };

  TimelineEditor.prototype._renderClip = function (clip) {
    originalRenderClip.call(this, clip);
    const element = this._canvas.querySelector(`[data-clip-id="${clip.id}"]`);
    if (!element || element.querySelector('.daw-clip-content')) return;

    const oldLabel = element.querySelector('span');
    if (oldLabel) oldLabel.remove();
    const content = document.createElement('div');
    content.className = 'daw-clip-content';
    content.innerHTML = `<span class="daw-clip-title">${clip.label || clip.type}</span><span class="daw-clip-time">${formatMs(clip.startMs)} · ${formatMs(clip.durationMs)}</span>`;
    element.insertBefore(content, element.firstChild ? element.firstChild.nextSibling : null);
  };

  TimelineEditor.prototype._startDrag = function (event, clipId) {
    const sourceTrack = this._getClipTrack(clipId);
    if (sourceTrack && sourceTrack.locked) return;
    event.preventDefault();

    const clip = this._clips().find((candidate) => candidate.id === clipId);
    if (!clip) return;
    this._selectClip(clipId);

    const startX = event.clientX;
    const startY = event.clientY;
    const originalStart = clip.startMs;
    const originalTrackId = clip.trackId;
    const orderedTracks = this._tracks().slice().sort((a, b) => a.order - b.order);
    const originalTrackIndex = orderedTracks.findIndex((track) => track.id === originalTrackId);

    const onMove = (moveEvent) => {
      const deltaMs = (moveEvent.clientX - startX) / this._pxPerMs;
      let nextStart = Math.max(0, originalStart + deltaMs);
      if (this._snapEnabled) nextStart = this._snapValue(nextStart);

      const deltaRows = Math.round((moveEvent.clientY - startY) / this._trackHeight);
      const targetIndex = Math.max(0, Math.min(orderedTracks.length - 1, originalTrackIndex + deltaRows));
      const targetTrack = orderedTracks[targetIndex];
      if (!targetTrack || targetTrack.locked) return;

      if (!this._overlaps(clipId, targetTrack.id, nextStart, clip.durationMs)) {
        clip.startMs = nextStart;
        clip.trackId = targetTrack.id;
        const element = this._canvas.querySelector(`[data-clip-id="${clipId}"]`);
        if (element) {
          element.style.left = `${this._msToX(nextStart)}px`;
          element.style.top = `${targetIndex * this._trackHeight + 8}px`;
          const time = element.querySelector('.daw-clip-time');
          if (time) time.textContent = `${formatMs(clip.startMs)} · ${formatMs(clip.durationMs)}`;
        }
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._pushUndo();
      this._autosave();
      this._showInspector(clipId);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  TimelineEditor.prototype._toast = function (message) {
    const existing = document.querySelector('.daw-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'daw-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1800);
  };

  document.addEventListener('keydown', (event) => {
    const editor = window.timelineEditor;
    if (!editor || !editor._el || !document.body.contains(editor._el)) return;
    if (event.target.matches('input, textarea, select')) return;

    if (event.code === 'Space') {
      event.preventDefault();
      editor._playing ? editor.pause() : editor.play();
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && editor._selectedClipId) {
      event.preventDefault();
      editor._deleteClip(editor._selectedClipId);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && editor._selectedClipId) {
      event.preventDefault();
      editor._duplicateClip(editor._selectedClipId);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (window.ShowduinoProjects) window.ShowduinoProjects.saveCurrentProject();
      else editor._saveToLocalStorage();
    }
  });
})();
