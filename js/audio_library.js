// AudioLibrary — Local audio file import, storage, and management
// Uses IndexedDB to persist audio blobs across sessions
// Falls back to in-memory + metadata-only when IndexedDB is unavailable

class AudioLibrary {
  constructor() {
    this._items   = [];   // { id, name, type, size, duration, objectUrl }
    this._db      = null;
    this._playing = null; // currently previewing Audio element
    this._playingId = null;
    this._renderTarget = null; // element to re-render into
    this._onChangeCallbacks = [];

    this._DB_NAME    = 'showduino_audio_lib';
    this._DB_VERSION = 1;
    this._STORE      = 'audio_files';
    this._META_KEY   = 'showduino_audio_meta';
  }

  /* ── Init ──────────────────────────────────────────────────────── */

  async init() {
    try {
      await this._openDB();
      await this._loadFromDB();
    } catch (_) {
      // Fall back to metadata-only mode
      this._loadMetaFromLocalStorage();
    }
  }

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._DB_NAME, this._DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this._STORE)) {
          db.createObjectStore(this._STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess  = e => { this._db = e.target.result; resolve(); };
      req.onerror    = () => reject(req.error);
      req.onblocked  = () => reject(new Error('IndexedDB blocked'));
    });
  }

  async _loadFromDB() {
    if (!this._db) return;
    const items = await this._dbGetAll();
    this._items = [];
    for (const record of items) {
      const url = URL.createObjectURL(record.blob);
      this._items.push({
        id:        record.id,
        name:      record.name,
        type:      record.type,
        size:      record.size,
        duration:  record.duration,
        objectUrl: url
      });
    }
    this._saveMetaToLocalStorage();
  }

  _loadMetaFromLocalStorage() {
    try {
      const raw = localStorage.getItem(this._META_KEY);
      if (!raw) return;
      const meta = JSON.parse(raw);
      // Items have no objectUrl — they need re-linking
      this._items = meta.map(m => ({ ...m, objectUrl: null, needsRelink: true }));
    } catch (_) {
      this._items = [];
    }
  }

  _saveMetaToLocalStorage() {
    try {
      const meta = this._items.map(({ id, name, type, size, duration }) => ({ id, name, type, size, duration }));
      localStorage.setItem(this._META_KEY, JSON.stringify(meta));
    } catch (_) {}
  }

  /* ── IndexedDB helpers ─────────────────────────────────────────── */

  _dbGetAll() {
    return new Promise((resolve, reject) => {
      const tx   = this._db.transaction(this._STORE, 'readonly');
      const req  = tx.objectStore(this._STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  }

  _dbPut(record) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction(this._STORE, 'readwrite');
      const req = tx.objectStore(this._STORE).put(record);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  _dbDelete(id) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction(this._STORE, 'readwrite');
      const req = tx.objectStore(this._STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /* ── Public API ────────────────────────────────────────────────── */

  getItems() { return this._items; }

  getItem(id) { return this._items.find(i => i.id === id) || null; }

  async addFiles(fileList) {
    const added = [];
    let seqCounter = 0;
    for (const file of fileList) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
        continue; // skip non-audio
      }
      // Use crypto.randomUUID if available, otherwise combine timestamp + counter + random
      const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? 'al_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : 'al_' + Date.now().toString(36) + '_' + (seqCounter++).toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      const url = URL.createObjectURL(file);
      let dur = 0;
      try { dur = await this._getDuration(url); } catch (_) {}

      const item = {
        id,
        name:      file.name,
        type:      file.type || 'audio/unknown',
        size:      file.size,
        duration:  dur,
        objectUrl: url
      };

      // Persist to IndexedDB
      if (this._db) {
        try {
          await this._dbPut({ id, name: item.name, type: item.type, size: item.size, duration: item.duration, blob: file });
        } catch (_) {}
      }

      this._items.push(item);
      added.push(item);
    }

    this._saveMetaToLocalStorage();
    this._notifyChange();
    return added;
  }

  async remove(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    if (this._playingId === id) this.stopPreview();
    this._items = this._items.filter(i => i.id !== id);
    if (this._db) {
      try { await this._dbDelete(id); } catch (_) {}
    }
    this._saveMetaToLocalStorage();
    this._notifyChange();
  }

  preview(id) {
    this.stopPreview();
    const item = this.getItem(id);
    if (!item || !item.objectUrl) return null;
    const audio = new Audio(item.objectUrl);
    audio.volume = 1;
    audio.play().catch(() => {});
    audio.addEventListener('ended', () => {
      if (this._playingId === id) {
        this._playing   = null;
        this._playingId = null;
        this._updatePlayBtns(id, false);
      }
    });
    this._playing   = audio;
    this._playingId = id;
    this._updatePlayBtns(id, true);
    return audio;
  }

  stopPreview() {
    if (this._playing) {
      this._playing.pause();
      this._playing.currentTime = 0;
      const wasId = this._playingId;
      this._playing   = null;
      this._playingId = null;
      if (wasId) this._updatePlayBtns(wasId, false);
    }
  }

  isPlaying(id) { return this._playingId === id; }

  /* ── Drag helpers ──────────────────────────────────────────────── */

  // Call this in dragstart handler on a library item
  setDragData(e, id) {
    const item = this.getItem(id);
    if (!item) return;
    e.dataTransfer.setData('audioSourceId', id);
    e.dataTransfer.setData('audioSourceName', item.name);
    e.dataTransfer.setData('blockType', 'audio');
    e.dataTransfer.effectAllowed = 'copy';
  }

  /* ── Rendering ─────────────────────────────────────────────────── */

  // Render the full audio library panel into a container element
  renderPanel(containerEl) {
    if (!containerEl) return;
    this._renderTarget = containerEl;
    this._doRender(containerEl);
  }

  _doRender(containerEl) {
    containerEl.innerHTML = '';
    containerEl.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1a1a1a;';

    // Header toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 10px;background:#222;border-bottom:1px solid #444;flex-shrink:0;flex-wrap:wrap;';

    const title = document.createElement('span');
    title.textContent = '🎵 Audio Library';
    title.style.cssText = 'color:#00ffcc;font-size:12px;font-weight:bold;flex:1;';
    toolbar.appendChild(title);

    const importBtn = document.createElement('button');
    importBtn.textContent = '+ Import';
    importBtn.className = 'btn-primary';
    importBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
    importBtn.title = 'Import MP3 / WAV / OGG files from your device';
    importBtn.addEventListener('click', () => this._triggerImport());
    toolbar.appendChild(importBtn);

    containerEl.appendChild(toolbar);

    // Drop zone
    const dropZone = document.createElement('div');
    dropZone.style.cssText = 'margin:8px;border:2px dashed #444;border-radius:6px;padding:10px;text-align:center;font-size:11px;color:#666;cursor:pointer;flex-shrink:0;';
    dropZone.textContent = 'Drop audio files here or tap Import ↑';
    dropZone.addEventListener('click', () => this._triggerImport());
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.style.borderColor = '#00ffcc'; dropZone.style.color = '#00ffcc'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#444'; dropZone.style.color = '#666'; });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = '#444'; dropZone.style.color = '#666';
      const files = e.dataTransfer.files;
      if (files && files.length) this.addFiles(files);
    });
    containerEl.appendChild(dropZone);

    // Items list
    const list = document.createElement('div');
    list.className = 'al-list';
    list.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';
    containerEl.appendChild(list);

    if (this._items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:24px 12px;color:#555;font-size:12px;';
      empty.innerHTML = 'No audio files imported.<br>Click <strong style="color:#888;">Import</strong> to add MP3, WAV, or OGG files.';
      list.appendChild(empty);
    } else {
      this._items.forEach(item => {
        list.appendChild(this._buildItemRow(item));
      });
    }
  }

  _buildItemRow(item) {
    const row = document.createElement('div');
    row.dataset.alId = item.id;
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid #2a2a2a;cursor:grab;';
    row.title = `Drag to timeline to create an audio clip`;

    // Drag handle (also enables drag from entire row)
    row.draggable = true;
    row.addEventListener('dragstart', e => {
      this.setDragData(e, item.id);
      row.style.opacity = '0.5';
    });
    row.addEventListener('dragend', () => { row.style.opacity = '1'; });
    row.addEventListener('mouseenter', () => { row.style.background = '#2a2a2a'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });

    // Icon
    const icon = document.createElement('span');
    icon.textContent = item.needsRelink ? '⚠️' : '🎵';
    icon.style.cssText = 'font-size:14px;flex-shrink:0;';
    row.appendChild(icon);

    // Info
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const name = document.createElement('div');
    name.textContent = item.name;
    name.style.cssText = 'font-size:12px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    info.appendChild(name);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:#666;';
    const dur = item.duration ? this._fmtDuration(item.duration) : (item.needsRelink ? 'Needs re-import' : '?');
    const sz  = item.size ? this._fmtSize(item.size) : '';
    meta.textContent = dur + (sz ? ' · ' + sz : '');
    info.appendChild(meta);
    row.appendChild(info);

    // Play/pause button
    const playBtn = document.createElement('button');
    playBtn.dataset.alPlayBtn = item.id;
    playBtn.style.cssText = 'background:#333;border:1px solid #555;color:#00ffcc;cursor:pointer;border-radius:3px;padding:2px 6px;font-size:12px;flex-shrink:0;';
    playBtn.title = 'Preview';
    playBtn.textContent = '▶';
    if (item.needsRelink || !item.objectUrl) {
      playBtn.disabled = true;
      playBtn.style.opacity = '0.4';
      playBtn.title = 'Re-import file to preview';
    } else {
      playBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (this.isPlaying(item.id)) {
          this.stopPreview();
        } else {
          this.preview(item.id);
        }
      });
    }
    row.appendChild(playBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.style.cssText = 'background:none;border:1px solid #444;color:#ff4444;cursor:pointer;border-radius:3px;padding:2px 6px;font-size:12px;flex-shrink:0;';
    delBtn.title = 'Remove from library';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Remove "${item.name}" from library?`)) {
        this.remove(item.id);
      }
    });
    row.appendChild(delBtn);

    return row;
  }

  _updatePlayBtns(id, playing) {
    document.querySelectorAll(`[data-al-play-btn="${id}"]`).forEach(btn => {
      btn.textContent = playing ? '⏸' : '▶';
    });
  }

  _triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/m4a,.mp3,.wav,.ogg,.flac,.m4a,.aac';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      if (input.files && input.files.length) {
        await this.addFiles(input.files);
      }
      document.body.removeChild(input);
    });
    input.click();
  }

  /* ── onChange ──────────────────────────────────────────────────── */

  onChange(fn) { this._onChangeCallbacks.push(fn); }

  _notifyChange() {
    this._onChangeCallbacks.forEach(fn => { try { fn(this._items); } catch (_) {} });
    // Re-render if we have a target
    if (this._renderTarget) this._doRender(this._renderTarget);
  }

  /* ── Format helpers ────────────────────────────────────────────── */

  _getDuration(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        if (!isFinite(dur) || dur <= 0) {
          // Streaming or unknown-length file — resolve with 0
          resolve(0);
        } else {
          resolve(Math.round(dur * 1000));
        }
      };
      audio.onerror = () => reject(new Error('Failed to load audio metadata'));
      audio.src = url;
    });
  }

  _fmtDuration(ms) {
    if (!ms) return '0:00';
    const s   = Math.floor(ms / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  _fmtSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024)    return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }
}

window.AudioLibrary = AudioLibrary;
