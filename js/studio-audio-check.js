// Showduino Studio: audio cue file checks (W004 phase 2).
//
// Mirrors the Audio Node firmware rules in new_showduino protocol/showduino_audio_node.h
// (showduino_audio_path_check / showduino_audio_resolve_path) and the Audio Node inventory in
// AudioStorage.cpp (collectDir), so Studio never suggests a name the node will refuse and never
// claims a file is on the SD card without a real device listing.
//
//   relative name   <= 62 characters (79-character path limit minus "/showduino/audio/")
//   characters      A-Z a-z 0-9 _ - . /     ("..", "\" and "//" refused)
//   extension       .wav (any case)
//   absolute form   /showduino/audio/<relative name>
//   timeline        AUDIO:NODE:PLAY:<file> must fit the 63-character P4 command
//   inventory       lists the card root and ambience/ effects/ dialogue/ music/ stingers/ test/,
//                   at most 48 files, names cut to 39 characters
(function () {
  'use strict';

  const ROOT = '/showduino/audio';
  // SHOWDUINO_AUDIO_REL_MAX is 63, but the resolved path ("/showduino/audio/" + name) must also
  // fit SHOWDUINO_AUDIO_PATH_MAX (79), so the longest relative name the node accepts is 62.
  const REL_MAX = 79 - '/showduino/audio/'.length;
  const COMMAND_MAX = 63;
  const COMMAND_PREFIX = 'AUDIO:NODE:LOOP:';          // PLAY: and LOOP: are the same length
  const CUE_NAME_MAX = COMMAND_MAX - COMMAND_PREFIX.length;   // 47
  const INVENTORY_NAME_MAX = 39;
  const INVENTORY_MAX = 48;
  const INVENTORY_FOLDERS = ['', 'ambience', 'effects', 'dialogue', 'music', 'stingers', 'test'];
  const LISTING_KEY = 'showduino_audio_node_listing_v1';

  function relativeName(name) {
    const text = String(name ?? '').trim();
    if (text === ROOT || text === ROOT + '/') return '';
    if (text.startsWith(ROOT + '/')) return text.slice(ROOT.length + 1);
    return text;
  }

  // Returns { ok, code, reason, warnings[] }. ok=false means the Audio Node will refuse it.
  function fileRule(name) {
    const raw = String(name ?? '').trim();
    const warnings = [];
    if (!raw) return { ok: false, code: 'EMPTY', reason: 'No audio file is set.', warnings };
    if (raw.startsWith('/') && !(raw === ROOT || raw.startsWith(ROOT + '/'))) {
      return { ok: false, code: 'OUTSIDE_ROOT', reason: `Files must be inside ${ROOT}/ on the Audio Node SD card. Use a name such as scream.wav.`, warnings };
    }
    const rel = relativeName(raw);
    if (!rel) return { ok: false, code: 'EMPTY', reason: 'No audio file is set.', warnings };
    if (rel.length > REL_MAX) return { ok: false, code: 'TOO_LONG', reason: `Name is ${rel.length} characters; the Audio Node accepts up to ${REL_MAX}.`, warnings };
    if (rel.includes('..') || rel.includes('\\') || rel.includes('//')) {
      return { ok: false, code: 'TRAVERSAL', reason: 'Name may not contain "..", "\\" or "//".', warnings };
    }
    const bad = rel.match(/[^A-Za-z0-9_.\-/]/);
    if (bad) {
      const shown = bad[0] === ' ' ? 'a space' : `"${bad[0]}"`;
      return { ok: false, code: 'BAD_CHAR', reason: `The Audio Node refuses ${shown} in file names. Use only letters, numbers, _ - . and /. Rename the file (for example ${suggestName(rel)}).`, warnings };
    }
    if (!/\.wav$/i.test(rel)) return { ok: false, code: 'BAD_EXT', reason: 'The Audio Node plays .wav files only (16-bit PCM). Convert the sound to WAV.', warnings };
    if (raw.length > CUE_NAME_MAX) {
      return { ok: false, code: 'CUE_TOO_LONG', reason: `"${raw}" is ${raw.length} characters; with the timeline command it must be ${CUE_NAME_MAX} or fewer. Use a shorter name.`, warnings };
    }
    const slash = rel.lastIndexOf('/');
    const folder = slash < 0 ? '' : rel.slice(0, slash);
    if (!INVENTORY_FOLDERS.includes(folder)) {
      warnings.push(`It will play, but the Audio Node only lists files in ${ROOT}/ and its ambience, effects, dialogue, music, stingers and test folders, so Studio cannot confirm it.`);
    }
    if (rel.length > INVENTORY_NAME_MAX) {
      warnings.push(`It will play, but the Audio Node's file list cuts names to ${INVENTORY_NAME_MAX} characters, so Studio cannot confirm it. A shorter name is safer.`);
    }
    return { ok: true, code: 'OK', reason: '', warnings };
  }

  function suggestName(rel) {
    const slash = rel.lastIndexOf('/');
    const base = slash < 0 ? rel : rel.slice(slash + 1);
    const cleaned = base.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'sound';
    return cleaned + '.wav';
  }

  /* ── Device listing (the only evidence that a file is on the card) ──────── */

  let memoryListing = null;

  function readListing() {
    if (memoryListing) return memoryListing;
    try {
      const raw = window.localStorage.getItem(LISTING_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.files) || typeof parsed.at !== 'number') return null;
      memoryListing = { files: parsed.files.map(String).slice(0, 500), at: parsed.at, source: String(parsed.source || '') };
      return memoryListing;
    } catch (_) {
      return null;
    }
  }

  // Call only with a list the device actually returned.
  function recordDeviceListing(files, source) {
    const list = (Array.isArray(files) ? files : []).map((f) => (typeof f === 'string' ? f : f?.name)).filter(Boolean).map(String).slice(0, 500);
    memoryListing = { files: list, at: Date.now(), source: String(source || 'Audio Node') };
    try { window.localStorage.setItem(LISTING_KEY, JSON.stringify(memoryListing)); } catch (_) {}
    window.dispatchEvent(new CustomEvent('showduino:audio-listing', { detail: { count: list.length } }));
    return memoryListing;
  }

  function clearDeviceListing() {
    memoryListing = null;
    try { window.localStorage.removeItem(LISTING_KEY); } catch (_) {}
    window.dispatchEvent(new CustomEvent('showduino:audio-listing', { detail: { count: 0 } }));
  }

  const norm = (name) => relativeName(name).toLowerCase();   // the SD card is FAT: names are case-insensitive

  function onDevice(name) {
    const listing = readListing();
    if (!listing) return null;
    const want = norm(name);
    return listing.files.some((f) => norm(f) === want) ? listing : null;
  }

  function inLocalLibrary(name) {
    const items = window.ShowduinoSounds?.library?.items || [];
    const want = norm(name);
    return items.find((item) => norm(item.name) === want) || null;
  }

  function timeAgo(at) {
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours} h ago`;
    return new Date(at).toLocaleDateString();
  }

  // Status of one cue file:
  //   invalid     the Audio Node will refuse the name
  //   on-node     present in a real device listing (with its time)
  //   local-only  imported into this browser, not seen on the device
  //   unconfirmed neither
  function status(name) {
    const rule = fileRule(name);
    if (!rule.ok) return { state: 'invalid', label: 'Will not play', text: rule.reason, rule };
    const listing = onDevice(name);
    if (listing) {
      return { state: 'on-node', label: 'On Audio Node', text: `Seen on the Audio Node SD card ${timeAgo(listing.at)}.`, rule, at: listing.at };
    }
    const where = `${ROOT}/${relativeName(name)}`;
    const listed = readListing();
    const lastCheck = listed ? ` The last Audio Node file list (${timeAgo(listed.at)}) did not include it.` : ' Studio has not read the Audio Node file list in this browser.';
    if (inLocalLibrary(name)) {
      return { state: 'local-only', label: 'Only on this computer', text: `Imported in this browser only. Copy it to ${where} on the Audio Node SD card.${lastCheck}`, rule };
    }
    return { state: 'unconfirmed', label: 'Not confirmed', text: `Make sure ${where} is on the Audio Node SD card.${lastCheck}`, rule };
  }

  function audioCues(project) {
    const clips = Array.isArray(project?.clips) ? project.clips : [];
    return clips.filter((clip) => String(clip?.type || clip?.action?.type || '').toLowerCase() === 'audio');
  }

  function cueFile(clip) {
    return String(clip?.params?.file ?? clip?.action?.params?.file ?? clip?.action?.params?.asset ?? '');
  }

  function cueReport(project) {
    return audioCues(project).map((clip) => ({
      id: clip.id,
      label: String(clip.label || clip.name || 'Audio cue'),
      file: cueFile(clip),
      status: status(cueFile(clip))
    }));
  }

  // Phone cue editor (js/studio-mobile.js): fill the status line under its file field.
  function updatePhoneStatus() {
    const input = document.getElementById('sm-audio-file');
    const out = document.getElementById('sm-audio-file-status');
    if (!input || !out) return;
    const st = status(input.value);
    out.dataset.state = st.state;
    out.textContent = `${st.label}: ${st.text}` + ((st.rule?.warnings || []).length ? ' ' + st.rule.warnings.join(' ') : '');
  }
  document.addEventListener('input', (event) => { if (event.target?.id === 'sm-audio-file') updatePhoneStatus(); });
  if (typeof MutationObserver === 'function') {
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(() => {
        pending = false;
        const out = document.getElementById('sm-audio-file-status');
        if (out && !out.dataset.state) updatePhoneStatus();
      });
    });
    const start = () => observer.observe(document.body, { childList: true, subtree: true });
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }

  window.ShowduinoAudioCheck = Object.freeze({
    ROOT, REL_MAX, CUE_NAME_MAX, INVENTORY_NAME_MAX, INVENTORY_MAX, INVENTORY_FOLDERS,
    fileRule, suggestName, relativeName, status, cueReport, cueFile,
    recordDeviceListing, clearDeviceListing, readListing: () => readListing()
  });
})();
