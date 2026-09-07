/* global TimelineEditor, SHDOModel */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') {
    console.error('[Showduino DAW] TimelineEditor is unavailable.');
    return;
  }

  const PIXEL_FX = [
    ['Solid','solid','STATIC'],['Fade','fade','LEVEL'],['Pulse','pulse','LEVEL'],['Breathe','breathe','LEVEL'],
    ['Flash','flash','IMPACT'],['Strobe','strobe','IMPACT'],['Lightning','lightning','IMPACT'],['Flicker','flicker','ORGANIC'],
    ['Fire','fire','ORGANIC'],['Ember','ember','ORGANIC'],['Sparkle','sparkle','ORGANIC'],['Twinkle','twinkle','ORGANIC'],
    ['Chase','chase','MOTION'],['Comet','comet','MOTION'],['Scanner','scanner','MOTION'],['Meteor','meteor','MOTION'],
    ['Colour Wipe','wipe','MOTION'],['Theatre Chase','theatre','MOTION'],['Wave','wave','MOTION'],['Ripple','ripple','MOTION'],
    ['Rainbow','rainbow','COLOUR'],['Confetti','confetti','COLOUR'],['Red / Blue','police','COLOUR'],['UV Flicker','uv-flicker','COLOUR'],
    ['Blackout','blackout','UTILITY']
  ];

  function pixelParams(effect) {
    return {
      line: 1,
      segmentMode: 'range',
      segmentName: 'Segment A',
      startPixel: 0,
      length: 10,
      groupSize: 10,
      markerOffset: 0,
      r: effect === 'blackout' ? 0 : 0,
      g: effect === 'blackout' ? 0 : 255,
      b: effect === 'blackout' ? 0 : 200,
      secondary: '#101820',
      brightness: effect === 'blackout' ? 0 : 255,
      effect,
      speed: 120,
      fadeMs: 0,
      blackoutAtEnd: false
    };
  }

  const PRESETS = [
    { name: 'Audio Cue', type: 'audio', icon: 'AUD', durationMs: 5000, params: { file: '', volume: 100, loop: false, fadeIn: 0, fadeOut: 0, pan: 0, rate: 1 } },
    { name: 'Impact Hit', type: 'audio', icon: 'AUD', durationMs: 1200, params: { file: 'impact.wav', volume: 100, loop: false, fadeIn: 0, fadeOut: 120, pan: 0, rate: 1 } },
    { name: 'Ambient Loop', type: 'audio', icon: 'AUD', durationMs: 15000, params: { file: 'ambience.wav', volume: 70, loop: true, fadeIn: 1000, fadeOut: 1000, pan: 0, rate: 1 } },

    { name: 'Relay Pulse', type: 'relay', icon: 'RLY', durationMs: 500, params: { out: 'out1', mode: 'pulse', state: true, pulseMs: 500, safeOff: true } },
    { name: 'Relay Hold', type: 'relay', icon: 'RLY', durationMs: 3000, params: { out: 'out1', mode: 'hold', state: true, pulseMs: 0, safeOff: true } },

    { name: 'MOSFET Hold', type: 'mosfet', icon: 'MOS', durationMs: 3000, params: { out: 'out1', mode: 'hold', state: true, duty: 100, pulseMs: 0, safeOff: true } },
    { name: 'MOSFET Pulse', type: 'mosfet', icon: 'MOS', durationMs: 500, params: { out: 'out1', mode: 'pulse', state: true, duty: 100, pulseMs: 500, safeOff: true } },
    { name: 'MOSFET PWM', type: 'mosfet', icon: 'MOS', durationMs: 4000, params: { out: 'out1', mode: 'pwm', state: true, duty: 50, pulseMs: 0, safeOff: true } },

    { name: 'Exit Sign Markers', type: 'pixel', icon: 'PIX', durationMs: 10000, params: { ...pixelParams('solid'), segmentMode: 'repeat-marker', segmentName: 'Emergency Exit Markers', groupSize: 10, markerOffset: 0, r: 0, g: 216, b: 109, secondary: '#000000' } },
    ...PIXEL_FX.map(([name, effect, family]) => ({ name: `Pixel ${name}`, type: 'pixel', icon: 'PIX', family, durationMs: effect === 'flash' || effect === 'strobe' ? 1500 : 4000, params: pixelParams(effect) })),

    { name: 'FX Block', type: 'fx', icon: 'FX', durationMs: 2000, params: { effect: 'custom', intensity: 100, rampIn: 0, rampOut: 0, safeStop: true } },
    { name: 'Fog / Atmosphere', type: 'fx', icon: 'FX', durationMs: 3000, params: { effect: 'fog', intensity: 100, rampIn: 0, rampOut: 0, safeStop: true } },
    { name: 'Air Blast', type: 'fx', icon: 'FX', durationMs: 350, params: { effect: 'air', intensity: 100, rampIn: 0, rampOut: 0, safeStop: true } },
    { name: 'Vibration', type: 'fx', icon: 'FX', durationMs: 2000, params: { effect: 'vibration', intensity: 75, rampIn: 100, rampOut: 150, safeStop: true } },

    { name: 'Event Trigger', type: 'trigger', icon: 'TRG', durationMs: 250, params: { event: '', payload: '', scope: 'project', once: false } },
    { name: 'Node Event', type: 'trigger', icon: 'TRG', durationMs: 250, params: { event: 'node_event', payload: '', scope: 'node', once: false } }
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

  function presetSearchText(preset) {
    return `${preset.name} ${preset.type} ${preset.family || ''}`.toLowerCase();
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
        <span>Cue Library</span>
        <button class="daw-library-toggle" type="button" aria-label="Toggle cue library">▾</button>
      </div>
      <div class="daw-library-body">
        <input class="daw-search" type="search" placeholder="Search audio, relay, MOSFET, pixel FX…" aria-label="Search cue library">
        <div class="daw-presets"></div>
      </div>`;

    const list = library.querySelector('.daw-presets');
    const search = library.querySelector('.daw-search');

    const render = (query) => {
      const term = String(query || '').toLowerCase().trim();
      list.innerHTML = '';
      PRESETS.filter((preset) => !term || presetSearchText(preset).includes(term)).forEach((preset) => {
        const item = document.createElement('div');
        item.className = 'daw-preset';
        item.draggable = true;
        item.dataset.presetType = preset.type;
        item.innerHTML = `<div class="daw-preset-icon">${preset.icon}</div><div><div class="daw-preset-name">${preset.name}</div><div class="daw-preset-meta">${preset.family ? `${preset.family} · ` : ''}${preset.type} · ${formatMs(preset.durationMs)}</div></div>`;
        item.addEventListener('dragstart', (event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-showduino-preset', JSON.stringify(preset));
          event.dataTransfer.setData('blockType', preset.type);
        });
        item.addEventListener('dblclick', () => {
          const sameType = this._tracks().find((candidate) => candidate.type === preset.type && !candidate.locked);
          const mixed = this._tracks().find((candidate) => candidate.type === 'mixed' && !candidate.locked);
          const track = sameType || mixed;
          if (!track) {
            this._toast(`Add a ${preset.type === 'mosfet' ? 'MOSFET' : preset.type} track or Mixed Lane first.`);
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
      if (track.type !== 'mixed' && track.type !== preset.type) {
        this._toast(`Drop ${preset.type} cues onto a ${preset.type} track or Mixed Lane.`);
        return;
      }

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
    if (preset.type === 'pixel') {
      clip.routing = { nodeId: '', output: `Pixel Line ${clip.params.line || 1}` };
      clip.label = preset.name === 'Exit Sign Markers' ? 'Emergency Exit Markers' : preset.name;
    }
    if (preset.type === 'relay') clip.routing = { nodeId: '', output: clip.params.out || 'out1' };
    if (preset.type === 'mosfet') clip.routing = { nodeId: '', output: clip.params.out || 'out1' };
    this._project().clips.push(clip);
    this._renderClip(clip);
    this._selectClip(clip.id);
    this._autosave();
    this._log(`Cue added: ${preset.name}`, 'FX');
    this._toast(`${preset.name} added`);
    window.dispatchEvent(new CustomEvent('showduino:studio-cue-added', { detail: { clip, preset } }));
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
    const route = clip.routing?.nodeId ? ` · ${clip.routing.nodeId}` : '';
    content.innerHTML = `<span class="daw-clip-title">${clip.label || clip.type}</span><span class="daw-clip-time">${formatMs(clip.startMs)} · ${formatMs(clip.durationMs)}${route}</span>`;
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
      if (targetTrack.type !== 'mixed' && targetTrack.type !== clip.type) return;

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
