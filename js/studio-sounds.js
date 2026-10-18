/* Showduino Studio — Sounds panel.
 *
 * Adapted from the local audio library in old PRs #14 / #11 for the current Studio.
 *
 *  - "Sounds on this computer": import audio files into this browser (IndexedDB),
 *    preview them, remove them, and use one in the selected timeline audio cue.
 *    Each file is checked against the Audio Node's WAV rule (new_showduino
 *    protocol/showduino_audio_node.h showduino_audio_wav_pcm_ok): PCM, 16-bit,
 *    mono or stereo, 8/16/22.05/32/44.1/48 kHz. Studio never uploads audio to the
 *    hardware: the same file must be copied to the Audio Node SD card.
 *  - "Sounds on your Showduino": lists the Audio Node SD card through the local
 *    device API, only when Studio is opened from the local Showduino network.
 *
 * All file names are rendered as text. No inline scripts or handlers.
 */
(function () {
  'use strict';

  const DB_NAME = 'showduino_local_audio';
  const DB_VERSION = 1;
  const STORE = 'files';
  const MAX_FILE_BYTES = 50 * 1048576;
  const MAX_TOTAL_BYTES = 300 * 1048576;
  const MAX_FILES = 100;
  // "AUDIO:NODE:PLAY:<file>" must fit the 63-character P4 timeline command limit.
  const PLAY_PREFIX = 'AUDIO:NODE:PLAY:';
  const TIMELINE_COMMAND_MAX = 63;
  const MAX_CUE_NAME = TIMELINE_COMMAND_MAX - PLAY_PREFIX.length;
  const AUDIO_EXT = /\.(wav|wave|mp3|ogg|oga|flac|m4a|aac)$/i;
  const NODE_RATES = [8000, 16000, 22050, 32000, 44100, 48000];

  /* ── Pure helpers (exported for tests) ──────────────────────────── */

  // Parses a RIFF/WAVE header. Returns { isWav, format, channels, rate, bits, dataBytes }.
  function parseWavHeader(buffer) {
    const view = new DataView(buffer);
    const tag = (offset) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
    if (view.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { isWav: false };
    let offset = 12;
    let fmt = null;
    while (offset + 8 <= view.byteLength) {
      const id = tag(offset);
      const size = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (id === 'fmt ') {
        if (size < 16 || body + 16 > view.byteLength) return { isWav: true, truncated: true };
        fmt = {
          format: view.getUint16(body, true),
          channels: view.getUint16(body + 2, true),
          rate: view.getUint32(body + 4, true),
          bits: view.getUint16(body + 14, true)
        };
      } else if (id === 'data') {
        return fmt ? { isWav: true, ...fmt, dataBytes: size } : { isWav: true, noFmt: true };
      }
      offset = body + size + (size % 2);
    }
    return fmt ? { isWav: true, ...fmt, dataBytes: null } : { isWav: true, truncated: true };
  }

  // Same rule as the Audio Node firmware. Returns { ok, reason }.
  function audioNodeCompatibility(info, fileName) {
    if (!info || !info.isWav) {
      const ext = (String(fileName || '').match(/\.([a-z0-9]+)$/i) || [])[1];
      return { ok: false, reason: `${ext ? ext.toUpperCase() : 'This format'} will not play on the Audio Node. Convert it to 16-bit PCM WAV.` };
    }
    if (info.truncated || info.noFmt) return { ok: false, reason: 'The WAV header could not be read.' };
    if (info.format !== 1) return { ok: false, reason: 'Compressed WAV. The Audio Node needs PCM.' };
    if (info.channels !== 1 && info.channels !== 2) return { ok: false, reason: `${info.channels} channels. Use mono or stereo.` };
    if (info.bits !== 16) return { ok: false, reason: `${info.bits}-bit. The Audio Node needs 16-bit.` };
    if (!NODE_RATES.includes(info.rate)) return { ok: false, reason: `${info.rate} Hz. Use 44100 or 48000 Hz.` };
    return { ok: true, reason: `Plays on the Audio Node (${info.channels === 1 ? 'mono' : 'stereo'}, ${info.rate / 1000} kHz, 16-bit).` };
  }

  // Whether a file name can be used as a timeline cue. Returns { ok, reason }.
  function cueNameCheck(name) {
    const text = String(name || '');
    if (!text) return { ok: false, reason: 'No file name.' };
    if (text.length > MAX_CUE_NAME) return { ok: false, reason: `Name is longer than ${MAX_CUE_NAME} characters. Rename the file.` };
    if (/[:\r\n\\]/.test(text) || text.includes('..')) return { ok: false, reason: 'Name contains : \\ .. or a line break. Rename the file.' };
    return { ok: true, reason: '' };
  }

  function formatDuration(ms) {
    if (!ms) return '—';
    if (ms < 10000) return (ms / 1000).toFixed(1) + ' s';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function formatSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  /* ── Local library (IndexedDB) ──────────────────────────────────── */

  class LocalAudioLibrary {
    constructor() {
      this.items = [];         // { id, name, type, size, durationMs, compat, objectUrl }
      this.persistent = false; // false when IndexedDB is unavailable (private mode)
      this.ready = null;
      this.listeners = [];
      this._db = null;
      this._audio = null;
      this.playingId = null;
    }

    init() {
      if (!this.ready) this.ready = this._open().then(() => this._load()).catch(() => { this.persistent = false; });
      return this.ready;
    }

    _open() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        request.onsuccess = () => { this._db = request.result; this.persistent = true; resolve(); };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('IndexedDB blocked'));
      });
    }

    _tx(mode, fn) {
      return new Promise((resolve, reject) => {
        const tx = this._db.transaction(STORE, mode);
        const result = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
      });
    }

    async _load() {
      const records = await this._tx('readonly', (store) => store.getAll());
      this.items = (records || []).map((record) => ({
        id: record.id, name: record.name, type: record.type, size: record.size,
        durationMs: record.durationMs, compat: record.compat, objectUrl: URL.createObjectURL(record.blob)
      }));
      this._emit();
    }

    totalBytes() { return this.items.reduce((sum, item) => sum + (item.size || 0), 0); }

    async addFiles(fileList) {
      await this.init();
      const added = [];
      const skipped = [];
      for (const file of Array.from(fileList || [])) {
        const name = String(file.name || 'sound');
        if (!(String(file.type || '').startsWith('audio/') || AUDIO_EXT.test(name))) { skipped.push(`${name}: not an audio file`); continue; }
        if (file.size > MAX_FILE_BYTES) { skipped.push(`${name}: larger than ${formatSize(MAX_FILE_BYTES)}`); continue; }
        if (this.items.length >= MAX_FILES) { skipped.push(`${name}: library is full (${MAX_FILES} files)`); continue; }
        if (this.totalBytes() + file.size > MAX_TOTAL_BYTES) { skipped.push(`${name}: library storage limit reached`); continue; }
        if (this.items.some((item) => item.name === name && item.size === file.size)) { skipped.push(`${name}: already in the library`); continue; }

        let header = null;
        try { header = parseWavHeader(await file.slice(0, 65536).arrayBuffer()); } catch (_) { header = { isWav: false }; }
        const compat = audioNodeCompatibility(header, name);
        let durationMs = 0;
        if (header && header.isWav && header.dataBytes && header.rate && header.channels && header.bits) {
          durationMs = Math.round(header.dataBytes / (header.rate * header.channels * (header.bits / 8)) * 1000);
        }
        const id = 'snd_' + (window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        const item = { id, name, type: file.type || 'audio/unknown', size: file.size, durationMs, compat, objectUrl: URL.createObjectURL(file) };
        if (this.persistent && this._db) {
          try {
            await this._tx('readwrite', (store) => store.put({ id, name, type: item.type, size: item.size, durationMs, compat, blob: file }));
          } catch (error) {
            URL.revokeObjectURL(item.objectUrl);
            skipped.push(`${name}: the browser refused to store it (${error && error.name === 'QuotaExceededError' ? 'storage full' : 'storage error'})`);
            continue;
          }
        }
        this.items.push(item);
        added.push(item);
      }
      this._emit();
      return { added, skipped };
    }

    async remove(id) {
      const item = this.items.find((candidate) => candidate.id === id);
      if (!item) return;
      if (this.playingId === id) this.stop();
      if (this.persistent && this._db) await this._tx('readwrite', (store) => store.delete(id));
      URL.revokeObjectURL(item.objectUrl);
      this.items = this.items.filter((candidate) => candidate.id !== id);
      this._emit();
    }

    preview(id) {
      this.stop();
      const item = this.items.find((candidate) => candidate.id === id);
      if (!item) return;
      this._audio = new Audio(item.objectUrl);
      this.playingId = id;
      this._audio.addEventListener('ended', () => { this.playingId = null; this._emit(); });
      this._audio.play().catch(() => { this.playingId = null; this._emit(); });
      this._emit();
    }

    stop() {
      if (this._audio) { this._audio.pause(); this._audio = null; }
      this.playingId = null;
      this._emit();
    }

    onChange(fn) { this.listeners.push(fn); }
    _emit() { this.listeners.forEach((fn) => { try { fn(); } catch (_) {} }); }
  }

  const library = new LocalAudioLibrary();

  /* ── Panel rendering ────────────────────────────────────────────── */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function button(label, className, onClick, title) {
    const node = el('button', className, label);
    node.type = 'button';
    if (title) node.title = title;
    node.addEventListener('click', onClick);
    return node;
  }

  function selectedAudioClip() {
    const clip = window.timelineEditor?.getSelectedClip?.();
    return clip && clip.type === 'audio' ? clip : null;
  }

  function log(message, level) {
    if (typeof window.studioLog === 'function') window.studioLog(message, level || 'INFO');
  }

  function useInSelectedCue(name) {
    const clip = selectedAudioClip();
    if (!clip) return 'Select an audio cue on the timeline first (02 Build Show).';
    const check = cueNameCheck(name);
    if (!check.ok) return check.reason;
    window.timelineEditor.setSelectedClipFile(name);
    log(`Audio cue "${clip.label || clip.name || 'audio'}" now plays ${name}`, 'INFO');
    return `“${clip.label || clip.name || 'Audio cue'}” now plays ${name}. Copy the same file to the Audio Node SD card (/showduino/audio/).`;
  }

  function renderLocal(section, status) {
    const list = section.querySelector('.sounds-list');
    list.replaceChildren();
    if (!library.items.length) {
      list.append(el('p', 'sounds-empty', 'No sounds yet. Import WAV files to preview them and use them in audio cues.'));
      return;
    }
    library.items.forEach((item) => {
      const row = el('div', 'sounds-row');
      const info = el('div', 'sounds-info');
      info.append(el('strong', 'sounds-name', item.name));
      info.append(el('span', 'sounds-meta', `${formatDuration(item.durationMs)} · ${formatSize(item.size)}`));
      const badge = el('span', 'sounds-badge ' + (item.compat?.ok ? 'ok' : 'warn'), item.compat?.ok ? 'Audio Node ✓' : 'Won’t play on Audio Node');
      badge.title = item.compat?.reason || '';
      info.append(badge);
      if (!item.compat?.ok && item.compat?.reason) info.append(el('span', 'sounds-reason', item.compat.reason));
      const actions = el('div', 'sounds-actions');
      const playing = library.playingId === item.id;
      actions.append(button(playing ? '⏹ Stop' : '▶ Preview', 'btn-toolbar', () => (playing ? library.stop() : library.preview(item.id)), playing ? 'Stop preview' : 'Preview in this browser'));
      const nameCheck = cueNameCheck(item.name);
      const use = button('Use in selected cue', 'btn-primary', () => { status.textContent = useInSelectedCue(item.name); },
        nameCheck.ok ? 'Set the selected timeline audio cue to this file name' : nameCheck.reason);
      use.disabled = !nameCheck.ok;
      actions.append(use);
      actions.append(button('Remove', 'btn-secondary', async () => {
        if (!window.confirm(`Remove "${item.name}" from this browser? Your shows and the Audio Node are not changed.`)) return;
        await library.remove(item.id);
        status.textContent = `${item.name} removed from this browser.`;
      }, 'Remove from this browser'));
      row.append(info, actions);
      list.append(row);
    });
  }

  async function importFiles(files, status) {
    status.textContent = 'Importing…';
    const { added, skipped } = await library.addFiles(files);
    const parts = [];
    if (added.length) parts.push(`${added.length} sound${added.length === 1 ? '' : 's'} added${library.persistent ? '' : ' for this session only (this browser is not keeping files)'}.`);
    const incompatible = added.filter((item) => !item.compat?.ok).length;
    if (incompatible) parts.push(`${incompatible} will not play on the Audio Node as they are.`);
    if (skipped.length) parts.push('Skipped: ' + skipped.join('; ') + '.');
    status.textContent = parts.join(' ') || 'No audio files were selected.';
  }

  function localSection() {
    const section = el('section', 'control-section sounds-section');
    section.append(el('h3', null, 'Sounds on this computer'));
    section.append(el('p', 'sounds-help', 'Import sounds to preview them here and choose them for audio cues. They stay in this browser only and are never uploaded. The Audio Node plays the copy on its own SD card, so put the same file in /showduino/audio/ on the card.'));
    const status = el('p', 'sounds-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac';
    input.className = 'sounds-file-input';
    input.id = 'sounds-file-input';
    input.addEventListener('change', async () => { if (input.files?.length) await importFiles(input.files, status); input.value = ''; });
    const label = el('label', 'btn-primary sounds-import', '＋ Import sounds');
    label.htmlFor = input.id;
    const drop = el('div', 'sounds-drop', 'or drop audio files here');
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('active'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('active'));
    drop.addEventListener('drop', async (event) => {
      event.preventDefault();
      drop.classList.remove('active');
      if (event.dataTransfer?.files?.length) await importFiles(event.dataTransfer.files, status);
    });
    const bar = el('div', 'sounds-toolbar');
    bar.append(input, label, drop);
    section.append(bar, status, el('div', 'sounds-list'));
    library.onChange(() => renderLocal(section, status));
    library.init().then(() => renderLocal(section, status));
    renderLocal(section, status);
    return section;
  }

  function deviceSection() {
    const section = el('section', 'control-section sounds-section');
    section.append(el('h3', null, 'Sounds on your Showduino'));
    const status = el('p', 'sounds-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const list = el('div', 'sounds-list');
    const local = Boolean(window.ShowduinoDeploy?.browserAllowsDirectLocalSend?.());
    if (!local) {
      section.append(el('p', 'sounds-help', 'The Audio Node SD card can be browsed when Studio is opened from your Showduino on the local network. On show-duino.com, use the local console instead.'));
      const link = el('a', 'btn-secondary', 'Local network setup');
      link.href = 'hauntsync.html#lan-connection';
      section.append(link);
      return section;
    }
    const refresh = button('List Audio Node files', 'btn-primary', async () => {
      status.textContent = 'Asking the Audio Node…';
      list.replaceChildren();
      try {
        const result = await window.api?.listAudioFiles?.();
        const files = (result?.files || []).map((f) => (typeof f === 'string' ? f : f?.name)).filter(Boolean);
        if (!files.length) { status.textContent = 'No WAV files reported by the Audio Node.'; return; }
        status.textContent = `${files.length} file${files.length === 1 ? '' : 's'} on the Audio Node.`;
        files.forEach((name) => {
          const row = el('div', 'sounds-row');
          const info = el('div', 'sounds-info');
          info.append(el('strong', 'sounds-name', name));
          const actions = el('div', 'sounds-actions');
          actions.append(button('▶ Play on Showduino', 'btn-toolbar', () => window.api?.playAudio?.(String(name)), 'Play through the Audio Node'));
          const use = button('Use in selected cue', 'btn-primary', () => { status.textContent = useInSelectedCue(String(name)); });
          use.disabled = !cueNameCheck(name).ok;
          actions.append(use);
          row.append(info, actions);
          list.append(row);
        });
      } catch (error) {
        status.textContent = 'Could not reach the Audio Node: ' + String(error?.message || error);
      }
    });
    const stop = button('⏹ Stop', 'btn-secondary', () => window.api?.stopAudio?.(), 'Stop Audio Node playback');
    const bar = el('div', 'sounds-toolbar');
    bar.append(refresh, stop);
    section.append(bar, status, list);
    return section;
  }

  function render(container) {
    if (!container) return;
    container.replaceChildren(localSection(), deviceSection());
  }

  window.ShowduinoSounds = Object.freeze({
    render,
    library,
    parseWavHeader,
    audioNodeCompatibility,
    cueNameCheck,
    MAX_CUE_NAME
  });
})();
