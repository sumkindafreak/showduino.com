// audio_library.js — Local Audio Import & Library for Showduino Studio
// Stores audio blobs in IndexedDB; works offline, no cloud upload required.

/* ── Constants ───────────────────────────────────────────────────── */

const AUDIO_DURATION_TIMEOUT_MS = 8000; // max wait for loadedmetadata event

/* ── Unique ID helper ────────────────────────────────────────────── */

// Prefer crypto.randomUUID(); fall back to timestamp + counter + random for
// environments without it (e.g. non-secure HTTP contexts on older browsers).
let _idSeq = 0;
function _genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'local-' + crypto.randomUUID();
  }
  return 'local-' + Date.now() + '-' + (++_idSeq) + '-' + Math.random().toString(36).slice(2, 9);
}

/* ── IndexedDB wrapper ───────────────────────────────────────────── */

const AudioLibraryDB = (() => {
  const DB_NAME    = 'showduino-audio-library';
  const DB_VERSION = 1;
  const STORE      = 'audio-items';

  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('name',    'name',    { unique: false });
          store.createIndex('addedAt', 'addedAt', { unique: false });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function saveItem(item) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(item);
      req.onsuccess = () => resolve(item.id);
      req.onerror   = (e) => reject(e.target.error);
    }));
  }

  function getAllMeta() {
    return open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = (e) => {
        // Return metadata only (no blob) for efficiency
        resolve(e.target.result.map(({ id, name, type, size, addedAt, duration }) =>
          ({ id, name, type, size, addedAt, duration })
        ));
      };
      req.onerror = (e) => reject(e.target.error);
    }));
  }

  function getBlob(id) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
      req.onerror   = (e) => reject(e.target.error);
    }));
  }

  function deleteItem(id) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    }));
  }

  return { open, saveItem, getAllMeta, getBlob, deleteItem };
})();

/* ── AudioLibrary class ──────────────────────────────────────────── */

class AudioLibrary {
  constructor() {
    this._items       = [];   // cached metadata (no blobs)
    this._previewAudio = null; // currently-previewing HTMLAudioElement
    this._previewId   = null;  // id of item being previewed
    this._urlCache    = {};    // id -> ObjectURL
  }

  /* ── Init ─────────────────────────────────────────────────────── */

  async init() {
    try {
      await AudioLibraryDB.open();
      this._items = await AudioLibraryDB.getAllMeta();
    } catch (err) {
      console.warn('AudioLibrary: IndexedDB unavailable', err);
      this._items = [];
    }
    window.audioLibrary = this;
    return this;
  }

  getItems() { return [...this._items]; }

  /* ── Import ───────────────────────────────────────────────────── */

  /**
   * Import an array/FileList of File objects.
   * @param {FileList|File[]} fileList
   * @param {function({ok,name,error?}):void} [onProgress]
   * @returns {Promise<Array<{name,message}>>} errors (empty = all ok)
   */
  async importFiles(fileList, onProgress) {
    const errors = [];
    for (const file of fileList) {
      try {
        const duration = await this._getAudioDuration(file);
        const id = _genId();
        const item = {
          id,
          name:    file.name,
          type:    file.type || 'audio/*',
          size:    file.size,
          addedAt: Date.now(),
          duration,
          blob:    file
        };
        await AudioLibraryDB.saveItem(item);
        const meta = { id, name: file.name, type: item.type, size: file.size, addedAt: item.addedAt, duration };
        this._items.push(meta);
        if (onProgress) onProgress({ ok: true, name: file.name });
      } catch (err) {
        const isQuota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
        const message = isQuota ? 'Storage quota exceeded — free up space and try again' : (err.message || String(err));
        errors.push({ name: file.name, message });
        if (onProgress) onProgress({ ok: false, name: file.name, error: message });
      }
    }
    return errors;
  }

  /* ── Remove ───────────────────────────────────────────────────── */

  async removeItem(id) {
    await AudioLibraryDB.deleteItem(id);
    this._items = this._items.filter(i => i.id !== id);
    if (this._urlCache[id]) {
      URL.revokeObjectURL(this._urlCache[id]);
      delete this._urlCache[id];
    }
    if (this._previewId === id) this._stopPreview();
  }

  /* ── Blob / ObjectURL ─────────────────────────────────────────── */

  async getObjectURL(id) {
    if (this._urlCache[id]) return this._urlCache[id];
    const blob = await AudioLibraryDB.getBlob(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this._urlCache[id] = url;
    return url;
  }

  /* ── Preview playback ─────────────────────────────────────────── */

  async previewItem(id) {
    if (this._previewId === id && this._previewAudio && !this._previewAudio.paused) {
      // Already playing this item — pause it
      this.pausePreview();
      return;
    }
    this._stopPreview();

    const url = await this.getObjectURL(id);
    if (!url) return;

    const audio = new Audio(url);
    this._previewAudio = audio;
    this._previewId    = id;

    audio.addEventListener('ended', () => {
      if (this._previewId === id) {
        this._previewId    = null;
        this._previewAudio = null;
        this._setPreviewBtn(id, '▶');
      }
    });

    try {
      await audio.play();
      this._setPreviewBtn(id, '⏸');
    } catch (_) {
      // Autoplay blocked or other error; reset state silently
      this._previewAudio = null;
      this._previewId    = null;
    }
  }

  pausePreview() {
    if (!this._previewAudio) return;
    if (!this._previewAudio.paused) {
      this._previewAudio.pause();
      this._setPreviewBtn(this._previewId, '▶');
    } else {
      this._previewAudio.play().then(() => {
        this._setPreviewBtn(this._previewId, '⏸');
      }).catch(() => {});
    }
  }

  stopPreview() { this._stopPreview(); }

  _stopPreview() {
    if (this._previewAudio) {
      this._previewAudio.pause();
      this._previewAudio.currentTime = 0;
      this._setPreviewBtn(this._previewId, '▶');
      this._previewAudio = null;
    }
    this._previewId = null;
  }

  _setPreviewBtn(id, text) {
    if (!id) return;
    const btn = document.querySelector('[data-preview-id="' + id + '"]');
    if (btn) btn.textContent = text;
  }

  /* ── Render library UI ────────────────────────────────────────── */

  /**
   * Renders the local audio library list into containerEl.
   * @param {HTMLElement} containerEl
   */
  renderLibrary(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    if (!this._items.length) {
      containerEl.innerHTML = '<span style="color:#666;font-size:12px;">No local audio imported. Use "📂 Import Audio" above.</span>';
      return;
    }

    this._items.forEach(item => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #222;flex-wrap:wrap;';

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const sizeTxt = this._fmtSize(item.size);
      const durTxt  = item.duration ? this._fmtDuration(item.duration) : '';
      info.innerHTML = '<div style="font-size:12px;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🎵 ' + item.name + '</div>'
        + '<div style="font-size:10px;color:#666;">' + [sizeTxt, durTxt].filter(Boolean).join(' · ') + '</div>';

      const isPlaying = this._previewId === item.id && this._previewAudio && !this._previewAudio.paused;

      const playBtn = document.createElement('button');
      playBtn.textContent = isPlaying ? '⏸' : '▶';
      playBtn.className   = 'btn-toolbar';
      playBtn.dataset.previewId = item.id;
      playBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
      playBtn.title = 'Play/Pause preview';
      playBtn.addEventListener('click', () => this.previewItem(item.id));

      const stopBtn = document.createElement('button');
      stopBtn.textContent = '⏹';
      stopBtn.className   = 'btn-secondary';
      stopBtn.style.cssText = 'font-size:11px;padding:2px 6px;';
      stopBtn.title = 'Stop preview';
      stopBtn.addEventListener('click', () => this.stopPreview());

      const useBtn = document.createElement('button');
      useBtn.textContent = 'Use';
      useBtn.className   = 'btn-primary';
      useBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
      useBtn.title = 'Assign to selected audio clip in timeline';
      useBtn.addEventListener('click', async () => {
        const url = await this.getObjectURL(item.id);
        if (url && window.timelineEditor) {
          window.timelineEditor.setSelectedClipFile(url);
        }
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.cssText = 'background:none;border:1px solid #555;color:#ff6666;cursor:pointer;border-radius:3px;padding:2px 7px;font-size:11px;';
      removeBtn.title = 'Remove from local library';
      removeBtn.addEventListener('click', async () => {
        await this.removeItem(item.id);
        this.renderLibrary(containerEl);
        await this.populatePlayerSelects();
      });

      row.appendChild(info);
      row.appendChild(playBtn);
      row.appendChild(stopBtn);
      row.appendChild(useBtn);
      row.appendChild(removeBtn);
      containerEl.appendChild(row);
    });
  }

  /* ── Player select population ─────────────────────────────────── */

  /**
   * Adds local audio items as options to the Player A/B <select> elements.
   * Safe to call after device files have already been loaded.
   */
  async populatePlayerSelects() {
    // Build URL list first (all async work done before touching the DOM)
    const localOptions = [];
    for (const item of this._items) {
      const url = await this.getObjectURL(item.id);
      if (url) localOptions.push({ url, name: item.name, id: item.id });
    }

    ['A', 'B'].forEach(ch => {
      const sel = document.getElementById('player-' + ch + '-file');
      if (!sel) return;
      // Remove any previously-added local options
      Array.from(sel.options).forEach(opt => {
        if (opt.dataset.localAudio) opt.remove();
      });
      // Append fresh local options
      localOptions.forEach(({ url, name, id }) => {
        const opt = document.createElement('option');
        opt.value = url;
        opt.textContent = '📁 ' + name;
        opt.dataset.localAudio = id;
        sel.appendChild(opt);
      });
    });
  }

  /* ── Helpers ──────────────────────────────────────────────────── */

  _getAudioDuration(file) {
    return new Promise(resolve => {
      const url   = URL.createObjectURL(file);
      const audio = new Audio();
      let settled = false;
      const done  = (val) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        clearTimeout(timer);
        resolve(val);
      };
      // 8 s timeout — some formats need longer to parse headers
      const timer = setTimeout(() => done(null), AUDIO_DURATION_TIMEOUT_MS);
      audio.addEventListener('loadedmetadata', () => done(isFinite(audio.duration) ? audio.duration : null));
      audio.addEventListener('error', () => done(null));
      audio.src = url;
    });
  }

  _fmtSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024)    return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  _fmtDuration(sec) {
    if (!sec || !isFinite(sec)) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }
}

/* ── Auto-init ───────────────────────────────────────────────────── */

window.AudioLibraryDB = AudioLibraryDB;
window.AudioLibrary   = AudioLibrary;

(function initAudioLibrary() {
  const lib = new AudioLibrary();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => lib.init());
  } else {
    lib.init();
  }
})();
