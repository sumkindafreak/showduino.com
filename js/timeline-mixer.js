/* global TimelineEditor, SHDOModel */
(function () {
  'use strict';

  if (typeof TimelineEditor === 'undefined') {
    console.error('[Showduino Mixer] TimelineEditor is unavailable.');
    return;
  }

  const originalRender = TimelineEditor.prototype._render;
  const originalRenderClip = TimelineEditor.prototype._renderClip;
  const originalSelectClip = TimelineEditor.prototype._selectClip;
  const originalStartDrag = TimelineEditor.prototype._startDrag;

  TimelineEditor.prototype._mixerSelectedIds = null;
  TimelineEditor.prototype._mixerClipboard = null;

  TimelineEditor.prototype._ensureMixerState = function () {
    if (!(this._mixerSelectedIds instanceof Set)) this._mixerSelectedIds = new Set();
    if (!Array.isArray(this._mixerClipboard)) this._mixerClipboard = [];
  };

  TimelineEditor.prototype._render = function () {
    originalRender.call(this);
    this._ensureMixerState();
    this._installMixerToolbar();
    this._installMarqueeSelection();
    this._refreshMixerSelection();
  };

  TimelineEditor.prototype._renderClip = function (clip) {
    originalRenderClip.call(this, clip);
    this._ensureMixerState();
    const element = this._canvas.querySelector(`[data-clip-id="${clip.id}"]`);
    if (!element) return;
    if (this._mixerSelectedIds.has(clip.id)) element.classList.add('mixer-selected');
    element.addEventListener('click', (event) => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this._toggleMixerSelection(clip.id);
      }
    }, true);
  };

  TimelineEditor.prototype._selectClip = function (clipId) {
    this._ensureMixerState();
    if (!this._mixerSelectedIds.has(clipId)) {
      this._mixerSelectedIds.clear();
      this._mixerSelectedIds.add(clipId);
    }
    originalSelectClip.call(this, clipId);
    this._refreshMixerSelection();
  };

  TimelineEditor.prototype._toggleMixerSelection = function (clipId) {
    this._ensureMixerState();
    if (this._mixerSelectedIds.has(clipId)) this._mixerSelectedIds.delete(clipId);
    else this._mixerSelectedIds.add(clipId);

    if (this._mixerSelectedIds.size) {
      const latest = [...this._mixerSelectedIds].at(-1);
      this._selectedClipId = latest;
      this._showInspector(latest);
    } else {
      this._selectedClipId = null;
    }
    this._refreshMixerSelection();
  };

  TimelineEditor.prototype._refreshMixerSelection = function () {
    this._ensureMixerState();
    this._canvas?.querySelectorAll('.tl-clip').forEach((element) => {
      element.classList.toggle('mixer-selected', this._mixerSelectedIds.has(element.dataset.clipId));
    });
    const count = this._el?.querySelector('.mixer-count');
    if (count) count.textContent = `${this._mixerSelectedIds.size} selected`;
  };

  TimelineEditor.prototype._installMixerToolbar = function () {
    const toolbar = this._el.querySelector('.tl-toolbar');
    if (!toolbar || toolbar.querySelector('.mixer-toolbar')) return;

    const group = document.createElement('div');
    group.className = 'mixer-toolbar';
    const button = (label, action, title) => {
      const element = document.createElement('button');
      element.className = 'btn-toolbar';
      element.type = 'button';
      element.textContent = label;
      element.title = title;
      element.addEventListener('click', action);
      return element;
    };

    const count = document.createElement('span');
    count.className = 'mixer-count';
    count.textContent = '0 selected';
    group.appendChild(count);
    group.appendChild(button('Select All', () => this._selectAllClips(), 'Select all clips'));
    group.appendChild(button('Copy', () => this._copyMixerSelection(), 'Copy selected clips'));
    group.appendChild(button('Paste', () => this._pasteMixerSelection(), 'Paste clips at playhead'));
    group.appendChild(button('Group Move', () => this._nudgeMixerSelection(this._snapMs), 'Move selected clips forward one snap'));
    toolbar.appendChild(group);
  };

  TimelineEditor.prototype._selectAllClips = function () {
    this._ensureMixerState();
    this._mixerSelectedIds = new Set(this._clips().map((clip) => clip.id));
    if (this._mixerSelectedIds.size) {
      this._selectedClipId = [...this._mixerSelectedIds][0];
      this._showInspector(this._selectedClipId);
    }
    this._refreshMixerSelection();
  };

  TimelineEditor.prototype._copyMixerSelection = function () {
    this._ensureMixerState();
    const selected = this._clips().filter((clip) => this._mixerSelectedIds.has(clip.id));
    if (!selected.length) return this._toast?.('Select clips to copy');
    const earliest = Math.min(...selected.map((clip) => clip.startMs));
    this._mixerClipboard = selected.map((clip) => ({
      ...JSON.parse(JSON.stringify(clip)),
      relativeStartMs: clip.startMs - earliest
    }));
    this._toast?.(`${selected.length} clip${selected.length === 1 ? '' : 's'} copied`);
  };

  TimelineEditor.prototype._pasteMixerSelection = function () {
    this._ensureMixerState();
    if (!this._mixerClipboard.length) return this._toast?.('Clipboard is empty');
    this._pushUndo();
    const base = this._state.playhead || 0;
    const created = this._mixerClipboard.map((source) => {
      const copy = JSON.parse(JSON.stringify(source));
      copy.id = SHDOModel._uuid();
      copy.startMs = base + (copy.relativeStartMs || 0);
      delete copy.relativeStartMs;
      this._project().clips.push(copy);
      return copy;
    });
    this._mixerSelectedIds = new Set(created.map((clip) => clip.id));
    this._renderTracks();
    if (created[0]) this._showInspector(created[0].id);
    this._autosave();
    this._toast?.(`${created.length} clip${created.length === 1 ? '' : 's'} pasted`);
  };

  TimelineEditor.prototype._deleteMixerSelection = function () {
    this._ensureMixerState();
    if (!this._mixerSelectedIds.size) return;
    this._pushUndo();
    const ids = new Set(this._mixerSelectedIds);
    this._project().clips = this._clips().filter((clip) => !ids.has(clip.id));
    this._mixerSelectedIds.clear();
    this._selectedClipId = null;
    this._renderTracks();
    this._autosave();
  };

  TimelineEditor.prototype._nudgeMixerSelection = function (deltaMs) {
    this._ensureMixerState();
    const selected = this._clips().filter((clip) => this._mixerSelectedIds.has(clip.id));
    if (!selected.length) return;
    this._pushUndo();
    const minimum = Math.min(...selected.map((clip) => clip.startMs));
    const safeDelta = Math.max(-minimum, deltaMs);
    selected.forEach((clip) => { clip.startMs = Math.max(0, clip.startMs + safeDelta); });
    this._renderTracks();
    this._autosave();
  };

  TimelineEditor.prototype._startDrag = function (event, clipId) {
    this._ensureMixerState();
    const duplicate = event.ctrlKey || event.metaKey;
    if (duplicate) {
      if (!this._mixerSelectedIds.has(clipId)) {
        this._mixerSelectedIds.clear();
        this._mixerSelectedIds.add(clipId);
      }
      this._copyMixerSelection();
      this._pasteMixerSelection();
      const newest = [...this._mixerSelectedIds][0];
      return originalStartDrag.call(this, event, newest);
    }

    if (this._mixerSelectedIds.size <= 1 || !this._mixerSelectedIds.has(clipId)) {
      return originalStartDrag.call(this, event, clipId);
    }

    event.preventDefault();
    const selected = this._clips().filter((clip) => this._mixerSelectedIds.has(clip.id));
    const startX = event.clientX;
    const originals = selected.map((clip) => ({ clip, startMs: clip.startMs }));

    const onMove = (moveEvent) => {
      let deltaMs = (moveEvent.clientX - startX) / this._pxPerMs;
      if (this._snapEnabled) deltaMs = this._snapValue(deltaMs);
      const minimumStart = Math.min(...originals.map((item) => item.startMs));
      deltaMs = Math.max(-minimumStart, deltaMs);
      originals.forEach(({ clip, startMs }) => {
        clip.startMs = Math.max(0, startMs + deltaMs);
        const element = this._canvas.querySelector(`[data-clip-id="${clip.id}"]`);
        if (element) element.style.left = `${this._msToX(clip.startMs)}px`;
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._pushUndo();
      this._autosave();
      this._refreshMixerSelection();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  TimelineEditor.prototype._installMarqueeSelection = function () {
    if (!this._canvas || this._canvas.dataset.mixerMarquee === 'true') return;
    this._canvas.dataset.mixerMarquee = 'true';

    this._canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('.tl-clip')) return;
      if (!event.shiftKey) this._mixerSelectedIds.clear();

      const rect = this._canvas.getBoundingClientRect();
      const startX = event.clientX - rect.left;
      const startY = event.clientY - rect.top;
      const marquee = document.createElement('div');
      marquee.className = 'mixer-marquee';
      marquee.style.left = `${startX}px`;
      marquee.style.top = `${startY}px`;
      this._canvas.appendChild(marquee);

      const onMove = (moveEvent) => {
        const currentX = moveEvent.clientX - rect.left;
        const currentY = moveEvent.clientY - rect.top;
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        Object.assign(marquee.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });

        const selectionRect = marquee.getBoundingClientRect();
        this._canvas.querySelectorAll('.tl-clip').forEach((clipElement) => {
          const clipRect = clipElement.getBoundingClientRect();
          const intersects = !(clipRect.right < selectionRect.left || clipRect.left > selectionRect.right || clipRect.bottom < selectionRect.top || clipRect.top > selectionRect.bottom);
          if (intersects) this._mixerSelectedIds.add(clipElement.dataset.clipId);
        });
        this._refreshMixerSelection();
      };

      const onUp = () => {
        marquee.remove();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const first = [...this._mixerSelectedIds][0];
        if (first) { this._selectedClipId = first; this._showInspector(first); }
        this._refreshMixerSelection();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  };

  document.addEventListener('keydown', (event) => {
    const editor = window.timelineEditor;
    if (!editor || event.target.matches('input, textarea, select')) return;
    editor._ensureMixerState();

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault(); editor._selectAllClips();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault(); editor._copyMixerSelection();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault(); editor._pasteMixerSelection();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && editor._mixerSelectedIds.size > 1) {
      event.preventDefault(); editor._deleteMixerSelection();
    } else if (event.key === 'ArrowRight' && editor._mixerSelectedIds.size) {
      event.preventDefault(); editor._nudgeMixerSelection(event.shiftKey ? 1000 : 100);
    } else if (event.key === 'ArrowLeft' && editor._mixerSelectedIds.size) {
      event.preventDefault(); editor._nudgeMixerSelection(event.shiftKey ? -1000 : -100);
    }
  }, true);
})();
