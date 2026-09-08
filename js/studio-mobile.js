/* Showduino Studio v4 — native mobile show builder.
 *
 * Portrait phones get a purpose-built cue workflow over the exact same .shdo v2
 * project model as desktop Studio. The desktop DAW remains available as an
 * advanced landscape view. Browser preview is simulation only: no live safety
 * or show-runtime authority is moved away from the ESP32-P4 Show Engine.
 */
(function () {
  'use strict';

  const PHONE_QUERY = '(max-width: 760px)';
  const CSS_PATH = 'css/studio-mobile-v4.css';
  const CURRENT_TYPES = ['audio', 'relay', 'mosfet', 'pixel', 'fx', 'trigger'];
  const TYPE_META = Object.freeze({
    audio:   { icon: '♪', name: 'Audio', subtitle: 'Sound cue', duration: 5000 },
    relay:   { icon: '⚡', name: 'Relay', subtitle: 'Switch / pulse output', duration: 500 },
    mosfet:  { icon: '▰', name: 'MOSFET', subtitle: 'Powered / PWM output', duration: 1000 },
    pixel:   { icon: '✦', name: 'Pixel FX', subtitle: 'Segmented pixel effect', duration: 3000 },
    fx:      { icon: '◈', name: 'FX', subtitle: 'Physical effect cue', duration: 1500 },
    trigger: { icon: '◎', name: 'Trigger', subtitle: 'Logical event', duration: 250 }
  });

  const PIXEL_EFFECTS = Object.freeze([
    ['solid','Solid','STATIC'],['fade','Fade','LEVEL'],['pulse','Pulse','LEVEL'],['breathe','Breathe','LEVEL'],
    ['flash','Flash','IMPACT'],['strobe','Strobe','IMPACT'],['lightning','Lightning','IMPACT'],
    ['flicker','Flicker','ORGANIC'],['fire','Fire','ORGANIC'],['ember','Ember','ORGANIC'],
    ['sparkle','Sparkle','ORGANIC'],['twinkle','Twinkle','ORGANIC'],['chase','Chase','MOTION'],
    ['comet','Comet','MOTION'],['scanner','Scanner','MOTION'],['meteor','Meteor','MOTION'],
    ['wipe','Colour Wipe','MOTION'],['theatre','Theatre Chase','MOTION'],['wave','Wave','MOTION'],
    ['ripple','Ripple','MOTION'],['rainbow','Rainbow','COLOUR'],['confetti','Confetti','COLOUR'],
    ['police','Red / Blue','COLOUR'],['uv-flicker','UV Flicker','COLOUR'],['blackout','Blackout','UTILITY']
  ].map(([id,name,family]) => ({ id,name,family })));

  let root = null;
  let activeTab = 'build';
  let editorDraft = null;
  let editorExistingId = null;
  let pixelEmergencyPreview = false;
  let preview = { playing: false, paused: false, timeMs: 0, startedAt: 0, offsetMs: 0, raf: 0 };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }
  function isPhone() { return window.matchMedia(PHONE_QUERY).matches; }
  function isV4() { return document.body.classList.contains('studio-v4'); }
  function isLandscape() { return window.matchMedia('(orientation: landscape)').matches; }

  function injectCss() {
    if (document.querySelector(`link[href="${CSS_PATH}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_PATH;
    document.head.appendChild(link);
  }

  function project() {
    const state = window.state;
    if (!state) return null;
    if (!state.project && window.SHDOModel) state.project = window.SHDOModel.createProject('Untitled Show');
    if (state.project && window.SHDOModel?.migrate) state.project = window.SHDOModel.migrate(state.project);
    return state.project;
  }

  function clips() { return project()?.clips || []; }
  function tracks() { return project()?.tracks || []; }

  function formatMs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
  }

  function projectDuration() {
    return clips().reduce((max, clip) => Math.max(max, Number(clip.startMs || 0) + Number(clip.durationMs || 0)), 0);
  }

  function nextCueStart() {
    if (!clips().length) return 0;
    const end = projectDuration();
    return Math.ceil(end / 500) * 500;
  }

  function projectStats() {
    const list = clips();
    return {
      cues: list.length,
      tracks: tracks().length,
      routed: list.filter(c => String(c.routing?.nodeId || '').trim()).length,
      duration: projectDuration()
    };
  }

  function routeText(clip) {
    const node = String(clip.routing?.nodeId || '').trim();
    const output = String(clip.routing?.output || '').trim();
    return node ? `${node}${output ? ` · ${output}` : ''}` : 'Routing not set';
  }

  function sortedClips() {
    return clips().slice().sort((a,b) => Number(a.startMs || 0) - Number(b.startMs || 0) || Number(a.durationMs || 0) - Number(b.durationMs || 0));
  }

  function headerHtml() {
    const name = project()?.project?.name || 'Untitled Show';
    return `<header class="sm-header">
      <div class="sm-brand"><span class="sm-brand-dot"></span><div class="sm-brand-copy"><strong>SHOWDUINO STUDIO</strong><span>${esc(name)}</span></div></div>
      <span class="sm-state">P4 RUNTIME</span>
    </header>`;
  }

  function navHtml() {
    const tabs = [
      ['build','＋','BUILD'],['preview','▶','PREVIEW'],['project','▣','PROJECT'],['system','⌁','SYSTEM']
    ];
    return `<nav class="sm-bottom-nav" aria-label="Mobile Studio">
      ${tabs.map(([id,icon,label]) => `<button class="sm-tab ${activeTab === id ? 'active' : ''}" type="button" data-sm-tab="${id}"><b>${icon}</b><span>${label}</span></button>`).join('')}
    </nav>`;
  }

  function buildHtml() {
    const stats = projectStats();
    const cueRows = sortedClips().map((clip) => {
      const meta = TYPE_META[clip.type] || { name: clip.type || 'Cue' };
      return `<button class="sm-cue-row" type="button" data-sm-edit="${esc(clip.id)}">
        <span class="sm-cue-time">${formatMs(clip.startMs)}</span>
        <span class="sm-cue-info"><strong>${esc(clip.label || meta.name)}</strong><span>${esc(routeText(clip))}</span></span>
        <span class="sm-cue-type">${esc(meta.name)}</span>
      </button>`;
    }).join('');

    return `<section class="sm-screen">
      <span class="sm-kicker">BUILD SHOW</span>
      <h1 class="sm-title">Build it cue by cue.</h1>
      <p class="sm-copy">Choose what happens, when it happens and which logical Showduino node performs it. The same production opens in desktop Studio.</p>

      <div class="sm-stats">
        <div class="sm-stat"><strong>${stats.cues}</strong><span>CUES</span></div>
        <div class="sm-stat"><strong>${stats.tracks}</strong><span>TRACKS</span></div>
        <div class="sm-stat"><strong>${formatMs(stats.duration).slice(0,5)}</strong><span>LENGTH</span></div>
      </div>

      <div class="sm-section">
        <div class="sm-section-head"><h2>Add cue</h2><span>TAP TO CREATE</span></div>
        <div class="sm-cue-grid">
          ${CURRENT_TYPES.map(type => { const m = TYPE_META[type]; return `<button class="sm-cue-button" type="button" data-sm-add="${type}"><span class="sm-cue-icon">${m.icon}</span><strong>${m.name}</strong><span>${m.subtitle}</span></button>`; }).join('')}
        </div>
        <button class="sm-template" type="button" data-sm-exit-template><strong>10-pixel Exit Sign</strong><span>PX 0 green, 1–9 blackout, repeat across the line</span></button>
      </div>

      <div class="sm-section">
        <div class="sm-section-head"><h2>Show sequence</h2><span>${stats.cues} CUES</span></div>
        <div class="sm-sequence">${cueRows || '<div class="sm-empty">No cues yet. Add the first thing you want the show to do.</div>'}</div>
      </div>
    </section>`;
  }

  function currentPreviewClips(timeMs) {
    return sortedClips().filter(c => timeMs >= Number(c.startMs || 0) && timeMs < Number(c.startMs || 0) + Math.max(1, Number(c.durationMs || 0)));
  }

  function nextPreviewClip(timeMs) {
    return sortedClips().find(c => Number(c.startMs || 0) > timeMs) || null;
  }

  function previewPixelHtml(clip, timeMs) {
    if (!clip || clip.type !== 'pixel') return `<div class="sm-pixel-shell"><div class="sm-pixel-strip">${Array.from({length:30},()=>'<i class="sm-pixel"></i>').join('')}</div></div>`;
    const p = clip.params || {};
    const mode = p.segmentMode || 'range';
    const start = Math.max(0, Number(p.startPixel || 0));
    const length = Math.max(1, Number(p.length || 10));
    const group = Math.max(1, Number(p.groupSize || 10));
    const marker = Math.max(0, Number(p.markerOffset || 0));
    const colour = `rgb(${clamp(p.r,0,255,0)},${clamp(p.g,0,255,255)},${clamp(p.b,0,255,200)})`;
    const phase = Math.floor(timeMs / Math.max(40, Number(p.speed || 120))) % 30;
    return `<div class="sm-pixel-shell"><div class="sm-pixel-strip" style="--sm-pixel:${colour}">${Array.from({length:30},(_,index) => {
      let on = false; let cls = '';
      if (mode === 'repeat-marker') { on = index >= start && index < start + length && ((index - start) % group) === marker; cls = on ? ' marker' : ''; }
      else on = index >= start && index < Math.min(30, start + length);
      if (on && ['chase','comet','scanner','meteor','wave','ripple','theatre'].includes(p.effect)) on = Math.abs(index - phase) <= 1;
      if (on && ['flash','strobe','lightning','flicker','sparkle','twinkle'].includes(p.effect)) on = ((Math.floor(timeMs / 90) + index * 7) % 4) !== 0;
      if (on && p.effect === 'blackout') on = false;
      return `<i class="sm-pixel${on ? ` on${cls}` : ''}"></i>`;
    }).join('')}</div></div>`;
  }

  function previewHtml() {
    const duration = Math.max(1, projectDuration());
    const active = currentPreviewClips(preview.timeMs);
    const current = active[0] || null;
    const next = nextPreviewClip(preview.timeMs);
    return `<section class="sm-screen">
      <span class="sm-kicker">BROWSER PREVIEW</span>
      <h1 class="sm-title">Preview the production.</h1>
      <p class="sm-copy">This simulates authored cues only. It never becomes the live show controller.</p>

      <div class="sm-card sm-card-pad" style="margin-top:.8rem;">
        <div class="sm-preview-time" id="sm-preview-time">${formatMs(preview.timeMs)}</div>
        <input id="sm-preview-progress" class="sm-progress" type="range" min="0" max="${duration}" value="${Math.min(duration,preview.timeMs)}" step="10" aria-label="Preview position">
        <div class="sm-btn-row" style="margin-top:.65rem;">
          <button class="sm-btn primary" type="button" data-sm-preview-play>${preview.playing ? 'Pause' : 'Play'}</button>
          <button class="sm-btn" type="button" data-sm-preview-stop>Stop</button>
        </div>
        <div class="sm-now" id="sm-preview-now"><small>NOW</small><strong>${esc(current?.label || 'Waiting for cue')}</strong><span>${esc(current ? routeText(current) : 'No cue active')}</span></div>
        <div id="sm-preview-pixels">${previewPixelHtml(current, preview.timeMs)}</div>
      </div>

      <div class="sm-section">
        <div class="sm-section-head"><h2>Next</h2><span>${next ? formatMs(next.startMs) : 'END'}</span></div>
        <div class="sm-card sm-card-pad"><strong style="font-size:.78rem;">${esc(next?.label || 'End of production')}</strong><div style="margin-top:.2rem;color:#71848f;font-size:.62rem;">${esc(next ? routeText(next) : 'Preview stops here.')}</div></div>
      </div>

      <div class="sm-section sm-rule"><strong>Emergency rule:</strong> emergency playback is not preview-authorable. On real hardware the ESP32-P4 interrupts normal playback and commands every pixel bright white.</div>
    </section>`;
  }

  function projectHtml() {
    const stats = projectStats();
    const name = project()?.project?.name || 'Untitled Show';
    return `<section class="sm-screen">
      <span class="sm-kicker">PROJECT</span>
      <h1 class="sm-title">${esc(name)}</h1>
      <p class="sm-copy">Local-first production storage with optional cloud sync and portable .shdo files.</p>

      <div class="sm-card sm-card-pad" style="margin-top:.8rem;">
        <div class="sm-stats" style="margin-top:0;"><div class="sm-stat"><strong>${stats.cues}</strong><span>CUES</span></div><div class="sm-stat"><strong>${stats.routed}</strong><span>ROUTED</span></div><div class="sm-stat"><strong>v2</strong><span>SHDO</span></div></div>
        <div class="sm-btn-row" style="margin-top:.75rem;">
          <button class="sm-btn primary" type="button" data-sm-save>Save now</button>
          <button class="sm-btn" type="button" data-sm-rename>Rename</button>
          <button class="sm-btn" type="button" data-sm-export>Export .shdo</button>
          <button class="sm-btn" type="button" data-sm-import>Import</button>
        </div>
      </div>

      <div class="sm-section">
        <div class="sm-section-head"><h2>Advanced timeline</h2><span>LANDSCAPE</span></div>
        <div class="sm-card sm-card-pad"><p class="sm-copy">Need precise block dragging, markers, snapping or track-level editing? Rotate the phone and open the full DAW timeline.</p><div class="sm-btn-row" style="margin-top:.65rem;"><button class="sm-btn" type="button" data-sm-advanced>Open advanced timeline</button></div></div>
      </div>

      <div class="sm-section sm-rule"><strong>One production model:</strong> mobile and desktop both edit the same tracks, clips, routing, pixel segments and .shdo v2 package.</div>
    </section>`;
  }

  function readinessChecks() {
    const list = clips();
    const checks = [];
    if (!list.length) checks.push(['warn','Empty production','Add at least one cue before deployment.']);
    else checks.push(['ok','Production has cues',`${list.length} cue${list.length === 1 ? '' : 's'} authored.`]);

    const legacy = list.filter(c => ['dmx','lighting','prop'].includes(c.type));
    checks.push(legacy.length ? ['warn','Legacy cue types',`${legacy.length} imported legacy cue(s) remain. Review before deployment.`] : ['ok','Current cue types','No legacy DMX / lighting / prop authoring found.']);

    const unrouted = list.filter(c => c.type !== 'trigger' && !String(c.routing?.nodeId || '').trim());
    checks.push(unrouted.length ? ['warn','Unrouted hardware cues',`${unrouted.length} cue(s) need a logical node ID.`] : ['ok','Routing',list.length ? 'Hardware cues have logical node targets.' : 'Routing will be checked as cues are added.']);

    const missingAudio = list.filter(c => c.type === 'audio' && !String(c.params?.file || '').trim());
    checks.push(missingAudio.length ? ['warn','Audio files',`${missingAudio.length} audio cue(s) have no file selected.`] : ['ok','Audio files','Audio cue file references are populated.']);

    const badPixels = list.filter(c => c.type === 'pixel' && (Number(c.params?.length || 0) < 1 || Number(c.params?.line || 0) < 1));
    checks.push(badPixels.length ? ['error','Pixel segments',`${badPixels.length} pixel cue(s) contain an invalid line or segment length.`] : ['ok','Pixel segments','Segment definitions are valid.']);
    return checks;
  }

  function nodeSummary() {
    const map = new Map();
    clips().forEach(c => {
      const id = String(c.routing?.nodeId || '').trim();
      if (!id) return;
      if (!map.has(id)) map.set(id, { id, types:new Set(), cues:0 });
      const entry = map.get(id); entry.types.add(c.type); entry.cues += 1;
    });
    return Array.from(map.values());
  }

  function systemHtml() {
    const checks = readinessChecks();
    const nodes = nodeSummary();
    return `<section class="sm-screen">
      <span class="sm-kicker">SYSTEM</span>
      <h1 class="sm-title">Ready it for Showduino.</h1>
      <p class="sm-copy">Studio authors the production. Director operates it. S3 Comms transports messages. The P4 owns runtime and safety.</p>

      <div class="sm-section">
        <div class="sm-section-head"><h2>Architecture</h2><span>CURRENT SYSTEM</span></div>
        <div class="sm-list">
          <div class="sm-list-row"><strong>Director</strong><span>ESP32-S3 touchscreen operator interface.</span></div>
          <div class="sm-list-row"><strong>S3 Communications Controller</strong><span>ESP-NOW ↔ UART bridge. No show decisions.</span></div>
          <div class="sm-list-row"><strong>ESP32-P4 Show Engine</strong><span>Authoritative runtime, timeline, cue dispatch and emergency state.</span></div>
          <div class="sm-list-row"><strong>Specialist Nodes</strong><span>Relay, MOSFET, Pixel and Audio action endpoints.</span></div>
        </div>
      </div>

      <div class="sm-section">
        <div class="sm-section-head"><h2>Project check</h2><span>${checks.filter(c=>c[0] === 'ok').length}/${checks.length} OK</span></div>
        <div class="sm-list">${checks.map(([state,title,copy]) => `<div class="sm-check ${state}"><i>${state === 'ok' ? '✓' : state === 'warn' ? '!' : '×'}</i><div><strong>${esc(title)}</strong><span>${esc(copy)}</span></div></div>`).join('')}</div>
      </div>

      <div class="sm-section">
        <div class="sm-section-head"><h2>Logical nodes</h2><span>${nodes.length} TARGETS</span></div>
        <div class="sm-list">${nodes.length ? nodes.map(n => `<div class="sm-list-row"><strong>${esc(n.id)}</strong><span>${esc(Array.from(n.types).join(' · '))} · ${n.cues} cue${n.cues === 1 ? '' : 's'}</span></div>`).join('') : '<div class="sm-empty">No logical node IDs have been assigned yet.</div>'}</div>
      </div>

      <div class="sm-section"><button class="sm-btn primary" style="width:100%;" type="button" data-sm-deploy>Prepare / Send to Showduino</button><div id="sm-deploy-result" style="margin-top:.45rem;color:#71848f;font-size:.62rem;"></div></div>
      <div class="sm-section sm-rule"><strong>Emergency = every pixel bright white.</strong> That override belongs to the P4 safety state and is deliberately not an authorable timeline effect.</div>
    </section>`;
  }

  function screenHtml() {
    if (activeTab === 'preview') return previewHtml();
    if (activeTab === 'project') return projectHtml();
    if (activeTab === 'system') return systemHtml();
    return buildHtml();
  }

  function render() {
    if (!root) return;
    root.innerHTML = `${headerHtml()}<main class="sm-main" id="sm-main">${screenHtml()}</main>${navHtml()}${editorShellHtml()}${rotateShellHtml()}`;
    if (activeTab === 'preview' && preview.playing) updatePreviewDom();
  }

  function editorShellHtml() {
    return `<section class="sm-editor" id="sm-editor" hidden aria-modal="true" role="dialog"><header class="sm-editor-head"><button type="button" data-sm-editor-close aria-label="Close editor">←</button><div class="sm-editor-title"><strong id="sm-editor-title">Cue</strong><span>SHOWDUINO CUE EDITOR</span></div></header><div class="sm-editor-body" id="sm-editor-body"></div><footer class="sm-editor-foot"><button class="sm-btn danger" type="button" id="sm-editor-delete" data-sm-editor-delete>Delete</button><button class="sm-btn primary" type="button" data-sm-editor-save>Save cue</button></footer></section>`;
  }

  function rotateShellHtml() {
    return `<section class="sm-rotate" id="sm-rotate" hidden><div class="sm-rotate-card"><strong>Rotate for the full timeline</strong><p>The DAW timeline is deliberately a landscape editing surface on phones. Rotate your device, then open it.</p><div class="sm-btn-row" style="justify-content:center;"><button class="sm-btn" type="button" data-sm-rotate-cancel>Not now</button><button class="sm-btn primary" type="button" data-sm-rotate-open>Open anyway</button></div></div></section><button id="studio-mobile-return" type="button">← Mobile Builder</button>`;
  }

  function commonFieldsHtml(draft) {
    return `<section class="sm-form-section"><h3>Cue</h3>
      <div class="sm-field"><label>NAME</label><input class="sm-input" id="sm-edit-label" value="${esc(draft.label || TYPE_META[draft.type]?.name || 'Cue')}"></div>
      <div class="sm-grid"><div class="sm-field"><label>START (SECONDS)</label><input class="sm-input" id="sm-edit-start" type="number" min="0" step="0.01" value="${(Number(draft.startMs || 0)/1000).toFixed(2)}"></div><div class="sm-field"><label>DURATION (SECONDS)</label><input class="sm-input" id="sm-edit-duration" type="number" min="0.01" step="0.01" value="${(Number(draft.durationMs || 1000)/1000).toFixed(2)}"></div></div>
    </section>
    <section class="sm-form-section"><h3>Routing</h3><div class="sm-field"><label>LOGICAL NODE ID</label><input class="sm-input" id="sm-edit-node" placeholder="e.g. PIXEL-HALL-01" value="${esc(draft.routing?.nodeId || '')}"></div><div class="sm-field"><label>OUTPUT / LINE</label><input class="sm-input" id="sm-edit-output" placeholder="e.g. OUT1 / LINE1" value="${esc(draft.routing?.output || '')}"></div></section>`;
  }

  function typeFieldsHtml(draft) {
    const p = draft.params || {};
    if (draft.type === 'audio') return `<section class="sm-form-section"><h3>Audio</h3><div class="sm-field"><label>AUDIO FILE</label><input class="sm-input" id="sm-audio-file" placeholder="audio/scene.wav" value="${esc(p.file || '')}"></div><div class="sm-field"><label>VOLUME · <span id="sm-audio-volume-value">${clamp(p.volume,0,100,100)}</span>%</label><input class="sm-input" id="sm-audio-volume" type="range" min="0" max="100" value="${clamp(p.volume,0,100,100)}"></div><label class="sm-checkline"><input id="sm-audio-loop" type="checkbox" ${p.loop ? 'checked' : ''}> Loop audio</label></section>`;

    if (draft.type === 'relay') return `<section class="sm-form-section"><h3>Relay output</h3><div class="sm-grid"><div class="sm-field"><label>OUTPUT</label><select class="sm-select" id="sm-relay-out">${Array.from({length:8},(_,i)=>`<option value="out${i+1}" ${(p.out || 'out1') === `out${i+1}` ? 'selected' : ''}>OUT${i+1}</option>`).join('')}</select></div><div class="sm-field"><label>MODE</label><select class="sm-select" id="sm-relay-mode">${['hold','pulse','toggle'].map(v=>`<option ${p.mode === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div><div class="sm-field"><label>PULSE (MS)</label><input class="sm-input" id="sm-relay-pulse" type="number" min="0" step="10" value="${clamp(p.pulseMs,0,600000,0)}"></div><label class="sm-checkline"><input id="sm-relay-safe" type="checkbox" ${p.safeOff !== false ? 'checked' : ''}> Force OFF when stopped</label></section>`;

    if (draft.type === 'mosfet') return `<section class="sm-form-section"><h3>MOSFET output</h3><div class="sm-grid"><div class="sm-field"><label>OUTPUT</label><select class="sm-select" id="sm-mosfet-out">${Array.from({length:8},(_,i)=>`<option value="out${i+1}" ${(p.out || 'out1') === `out${i+1}` ? 'selected' : ''}>OUT${i+1}</option>`).join('')}</select></div><div class="sm-field"><label>MODE</label><select class="sm-select" id="sm-mosfet-mode">${['hold','pulse'].map(v=>`<option ${p.mode === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div><div class="sm-field"><label>POWER · <span id="sm-mosfet-duty-value">${clamp(p.duty,0,100,100)}</span>%</label><input class="sm-input" id="sm-mosfet-duty" type="range" min="0" max="100" value="${clamp(p.duty,0,100,100)}"></div><div class="sm-field"><label>PULSE (MS)</label><input class="sm-input" id="sm-mosfet-pulse" type="number" min="0" step="10" value="${clamp(p.pulseMs,0,600000,0)}"></div><label class="sm-checkline"><input id="sm-mosfet-safe" type="checkbox" ${p.safeOff !== false ? 'checked' : ''}> Force OFF when stopped</label></section>`;

    if (draft.type === 'pixel') {
      const mode = p.segmentMode || 'range';
      return `<section class="sm-form-section"><h3>Pixel segment</h3>
        <div class="sm-grid"><div class="sm-field"><label>LINE</label><input class="sm-input" id="sm-pixel-line" type="number" min="1" max="32" value="${clamp(p.line,1,32,1)}"></div><div class="sm-field"><label>SEGMENT NAME</label><input class="sm-input" id="sm-pixel-name" value="${esc(p.segmentName || 'Segment A')}"></div></div>
        <div class="sm-field"><label>SEGMENT MODE</label><select class="sm-select" id="sm-pixel-mode"><option value="range" ${mode === 'range' ? 'selected' : ''}>Range: start + length</option><option value="repeat-marker" ${mode === 'repeat-marker' ? 'selected' : ''}>Repeating marker groups</option></select></div>
        <div class="sm-grid"><div class="sm-field"><label>START PIXEL</label><input class="sm-input" id="sm-pixel-start" type="number" min="0" value="${clamp(p.startPixel,0,100000,0)}"></div><div class="sm-field"><label>TOTAL / SEGMENT LENGTH</label><input class="sm-input" id="sm-pixel-length" type="number" min="1" value="${clamp(p.length,1,100000,10)}"></div></div>
        <div class="sm-grid" id="sm-pixel-group-fields" ${mode === 'repeat-marker' ? '' : 'hidden'}><div class="sm-field"><label>GROUP SIZE</label><input class="sm-input" id="sm-pixel-group" type="number" min="1" value="${clamp(p.groupSize,1,1000,10)}"></div><div class="sm-field"><label>ACTIVE PIXEL IN GROUP</label><input class="sm-input" id="sm-pixel-marker" type="number" min="0" value="${clamp(p.markerOffset,0,999,0)}"></div></div>
        <div class="sm-grid"><div class="sm-field"><label>PRIMARY COLOUR</label><input class="sm-input" id="sm-pixel-colour" type="color" value="${rgbHex(p.r,p.g,p.b)}"></div><div class="sm-field"><label>BRIGHTNESS</label><input class="sm-input" id="sm-pixel-brightness" type="number" min="0" max="255" value="${clamp(p.brightness,0,255,255)}"></div></div>
        <div class="sm-field"><label>SPEED</label><input class="sm-input" id="sm-pixel-speed" type="number" min="1" max="1000" value="${clamp(p.speed,1,1000,120)}"></div>
        <label class="sm-checkline"><input id="sm-pixel-blackout" type="checkbox" ${p.blackoutAtEnd ? 'checked' : ''}> Blackout this segment when cue ends</label>
        <input id="sm-pixel-effect" type="hidden" value="${esc(p.effect || 'solid')}">
        <div class="sm-pixel-shell"><div class="sm-pixel-strip" id="sm-editor-pixel-preview"></div></div>
        <div class="sm-btn-row" style="margin-top:.55rem;"><button class="sm-btn" type="button" data-sm-editor-exit>10-pixel Exit Sign</button><button class="sm-btn" type="button" data-sm-editor-emergency>Preview Emergency</button></div>
      </section>
      <section class="sm-form-section"><h3>Pixel effect</h3><div class="sm-fx-grid">${PIXEL_EFFECTS.map(f=>`<button class="sm-fx ${(p.effect || 'solid') === f.id ? 'active' : ''}" type="button" data-sm-pixel-fx="${f.id}"><strong>${esc(f.name)}</strong><span>${esc(f.family)}</span></button>`).join('')}</div></section>
      <div class="sm-rule"><strong>Emergency override is locked:</strong> every pixel becomes bright white under the P4 emergency state. Previewing it here does not add it to the show.</div>`;
    }

    if (draft.type === 'fx') return `<section class="sm-form-section"><h3>Physical FX</h3><div class="sm-field"><label>EFFECT</label><select class="sm-select" id="sm-fx-effect">${['custom','fog','air','vibration','scent','motor','servo','solenoid'].map(v=>`<option ${p.effect === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="sm-field"><label>INTENSITY · <span id="sm-fx-intensity-value">${clamp(p.intensity,0,100,100)}</span>%</label><input class="sm-input" id="sm-fx-intensity" type="range" min="0" max="100" value="${clamp(p.intensity,0,100,100)}"></div><label class="sm-checkline"><input id="sm-fx-safe" type="checkbox" ${p.safeStop !== false ? 'checked' : ''}> Stop during emergency</label></section>`;

    if (draft.type === 'trigger') return `<section class="sm-form-section"><h3>Trigger</h3><div class="sm-field"><label>EVENT NAME</label><input class="sm-input" id="sm-trigger-event" placeholder="scene_complete" value="${esc(p.event || '')}"></div><div class="sm-field"><label>PAYLOAD</label><textarea class="sm-textarea" id="sm-trigger-payload" placeholder="Optional text or JSON">${esc(p.payload || '')}</textarea></div><div class="sm-field"><label>SCOPE</label><select class="sm-select" id="sm-trigger-scope">${['project','scene','track','node','global'].map(v=>`<option ${p.scope === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div><label class="sm-checkline"><input id="sm-trigger-once" type="checkbox" ${p.once ? 'checked' : ''}> Fire once only</label></section>`;
    return '';
  }

  function rgbHex(r,g,b) { return `#${[r,g,b].map(v=>clamp(v,0,255,0).toString(16).padStart(2,'0')).join('')}`; }
  function hexRgb(hex) { const h=String(hex||'#000000').replace('#','').padEnd(6,'0').slice(0,6); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); }

  function openEditor(type, clipId, exitTemplate) {
    const existing = clipId ? clips().find(c => c.id === clipId) : null;
    if (existing && !CURRENT_TYPES.includes(existing.type)) {
      window.alert('This is an imported legacy cue. Open the desktop timeline to inspect or migrate it.');
      return;
    }
    editorExistingId = existing?.id || null;
    editorDraft = existing ? deepCopy(existing) : window.SHDOModel.createClip('pending', type, nextCueStart(), TYPE_META[type]?.duration || 1000, TYPE_META[type]?.name || type);
    editorDraft.routing = editorDraft.routing || { nodeId:'', output:'' };
    editorDraft.params = editorDraft.params || window.SHDOModel._defaultParams?.(type) || {};
    pixelEmergencyPreview = false;
    if (exitTemplate && type === 'pixel') applyExitTemplateToDraft();
    const editor = document.getElementById('sm-editor');
    const body = document.getElementById('sm-editor-body');
    document.getElementById('sm-editor-title').textContent = editorExistingId ? `Edit ${TYPE_META[type].name}` : `Add ${TYPE_META[type].name}`;
    document.getElementById('sm-editor-delete').style.visibility = editorExistingId ? 'visible' : 'hidden';
    body.innerHTML = commonFieldsHtml(editorDraft) + typeFieldsHtml(editorDraft);
    editor.hidden = false;
    bindEditorLiveControls();
    if (type === 'pixel') renderEditorPixelPreview();
  }

  function closeEditor() {
    const editor = document.getElementById('sm-editor');
    if (editor) editor.hidden = true;
    editorDraft = null; editorExistingId = null; pixelEmergencyPreview = false;
  }

  function applyExitTemplateToDraft() {
    if (!editorDraft || editorDraft.type !== 'pixel') return;
    editorDraft.label = 'Emergency Exit Sign Markers';
    editorDraft.params = { ...editorDraft.params, line:1, segmentMode:'repeat-marker', segmentName:'Exit Sign Markers', startPixel:0, length:100, groupSize:10, markerOffset:0, r:0, g:220, b:80, brightness:255, effect:'solid', speed:120, blackoutAtEnd:false };
  }

  function applyExitTemplateInEditor() {
    if (!editorDraft || editorDraft.type !== 'pixel') return;
    const values = { 'sm-edit-label':'Emergency Exit Sign Markers','sm-pixel-name':'Exit Sign Markers','sm-pixel-start':'0','sm-pixel-length':'100','sm-pixel-group':'10','sm-pixel-marker':'0','sm-pixel-colour':'#00dc50','sm-pixel-brightness':'255','sm-pixel-effect':'solid' };
    Object.entries(values).forEach(([id,value])=>{ const el=document.getElementById(id); if(el) el.value=value; });
    const mode=document.getElementById('sm-pixel-mode'); if(mode) mode.value='repeat-marker';
    document.getElementById('sm-pixel-group-fields')?.removeAttribute('hidden');
    document.querySelectorAll('[data-sm-pixel-fx]').forEach(b=>b.classList.toggle('active',b.dataset.smPixelFx === 'solid'));
    pixelEmergencyPreview=false;
    renderEditorPixelPreview();
  }

  function bindEditorLiveControls() {
    document.getElementById('sm-audio-volume')?.addEventListener('input',e=>{ const out=document.getElementById('sm-audio-volume-value'); if(out) out.textContent=e.target.value; });
    document.getElementById('sm-mosfet-duty')?.addEventListener('input',e=>{ const out=document.getElementById('sm-mosfet-duty-value'); if(out) out.textContent=e.target.value; });
    document.getElementById('sm-fx-intensity')?.addEventListener('input',e=>{ const out=document.getElementById('sm-fx-intensity-value'); if(out) out.textContent=e.target.value; });
    ['sm-pixel-mode','sm-pixel-start','sm-pixel-length','sm-pixel-group','sm-pixel-marker','sm-pixel-colour','sm-pixel-line','sm-pixel-brightness','sm-pixel-speed'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{
      if(id === 'sm-pixel-mode') document.getElementById('sm-pixel-group-fields')?.toggleAttribute('hidden',document.getElementById('sm-pixel-mode').value !== 'repeat-marker');
      pixelEmergencyPreview=false; renderEditorPixelPreview();
    }));
  }

  function renderEditorPixelPreview() {
    const target=document.getElementById('sm-editor-pixel-preview'); if(!target) return;
    if(pixelEmergencyPreview) { target.innerHTML=Array.from({length:30},()=>'<i class="sm-pixel white"></i>').join(''); return; }
    const mode=document.getElementById('sm-pixel-mode')?.value || 'range';
    const start=clamp(document.getElementById('sm-pixel-start')?.value,0,100000,0);
    const length=clamp(document.getElementById('sm-pixel-length')?.value,1,100000,10);
    const group=clamp(document.getElementById('sm-pixel-group')?.value,1,1000,10);
    const marker=clamp(document.getElementById('sm-pixel-marker')?.value,0,group-1,0);
    const colour=document.getElementById('sm-pixel-colour')?.value || '#00ffc8';
    target.style.setProperty('--sm-pixel',colour);
    target.innerHTML=Array.from({length:30},(_,i)=>{
      const inRange=i>=start && i<start+length;
      const on=mode==='repeat-marker' ? inRange && ((i-start)%group)===marker : inRange;
      return `<i class="sm-pixel${on ? (mode==='repeat-marker' ? ' on marker' : ' on') : ''}"></i>`;
    }).join('');
  }

  function readEditor() {
    if (!editorDraft) return null;
    const d=deepCopy(editorDraft); const p=d.params || (d.params={});
    d.label=document.getElementById('sm-edit-label')?.value.trim() || TYPE_META[d.type]?.name || d.type;
    d.startMs=Math.round(Math.max(0,Number(document.getElementById('sm-edit-start')?.value || 0))*1000);
    d.durationMs=Math.max(10,Math.round(Math.max(.01,Number(document.getElementById('sm-edit-duration')?.value || 1))*1000));
    d.routing={ nodeId:document.getElementById('sm-edit-node')?.value.trim() || '', output:document.getElementById('sm-edit-output')?.value.trim() || '' };
    if(d.type==='audio'){ p.file=document.getElementById('sm-audio-file')?.value.trim()||''; p.volume=clamp(document.getElementById('sm-audio-volume')?.value,0,100,100); p.loop=Boolean(document.getElementById('sm-audio-loop')?.checked); }
    if(d.type==='relay'){ p.out=document.getElementById('sm-relay-out')?.value||'out1'; p.mode=document.getElementById('sm-relay-mode')?.value||'hold'; p.pulseMs=clamp(document.getElementById('sm-relay-pulse')?.value,0,600000,0); p.state=true; p.safeOff=Boolean(document.getElementById('sm-relay-safe')?.checked); }
    if(d.type==='mosfet'){ p.out=document.getElementById('sm-mosfet-out')?.value||'out1'; p.mode=document.getElementById('sm-mosfet-mode')?.value||'hold'; p.duty=clamp(document.getElementById('sm-mosfet-duty')?.value,0,100,100); p.pulseMs=clamp(document.getElementById('sm-mosfet-pulse')?.value,0,600000,0); p.state=true; p.safeOff=Boolean(document.getElementById('sm-mosfet-safe')?.checked); }
    if(d.type==='pixel'){ const [r,g,b]=hexRgb(document.getElementById('sm-pixel-colour')?.value); p.line=clamp(document.getElementById('sm-pixel-line')?.value,1,32,1); p.segmentName=document.getElementById('sm-pixel-name')?.value.trim()||'Segment A'; p.segmentMode=document.getElementById('sm-pixel-mode')?.value||'range'; p.startPixel=clamp(document.getElementById('sm-pixel-start')?.value,0,100000,0); p.length=clamp(document.getElementById('sm-pixel-length')?.value,1,100000,10); p.groupSize=clamp(document.getElementById('sm-pixel-group')?.value,1,1000,10); p.markerOffset=clamp(document.getElementById('sm-pixel-marker')?.value,0,p.groupSize-1,0); p.r=r;p.g=g;p.b=b;p.brightness=clamp(document.getElementById('sm-pixel-brightness')?.value,0,255,255); p.speed=clamp(document.getElementById('sm-pixel-speed')?.value,1,1000,120); p.effect=document.getElementById('sm-pixel-effect')?.value||'solid'; p.blackoutAtEnd=Boolean(document.getElementById('sm-pixel-blackout')?.checked); }
    if(d.type==='fx'){ p.effect=document.getElementById('sm-fx-effect')?.value||'custom'; p.intensity=clamp(document.getElementById('sm-fx-intensity')?.value,0,100,100); p.safeStop=Boolean(document.getElementById('sm-fx-safe')?.checked); }
    if(d.type==='trigger'){ p.event=document.getElementById('sm-trigger-event')?.value.trim()||''; p.payload=document.getElementById('sm-trigger-payload')?.value||''; p.scope=document.getElementById('sm-trigger-scope')?.value||'project'; p.once=Boolean(document.getElementById('sm-trigger-once')?.checked); }
    return d;
  }

  function findOrCreateTrack(type) {
    let track=tracks().find(t=>t.type===type && !t.locked);
    if(track) return track;
    track=window.SHDOModel.createTrack(type,TYPE_META[type]?.name || `${type} Track`,tracks().length);
    project().tracks.push(track); return track;
  }

  async function saveEditorCue() {
    const d=readEditor(); if(!d) return;
    const p=project();
    if(editorExistingId){ const index=p.clips.findIndex(c=>c.id===editorExistingId); if(index>=0){ d.id=editorExistingId; d.trackId=p.clips[index].trackId; p.clips[index]=d; } }
    else { const track=findOrCreateTrack(d.type); d.trackId=track.id; p.clips.push(d); }
    p.project.updatedAt=new Date().toISOString();
    try { await window.ShowduinoProjects?.saveCurrentProject?.({cloud:false}); } catch(error){ console.warn('[Mobile Studio] local save failed',error); }
    window.ShowduinoStudioV4?.refreshProjectStats?.();
    closeEditor(); activeTab='build'; render();
  }

  async function deleteEditorCue() {
    if(!editorExistingId) return;
    const clip=clips().find(c=>c.id===editorExistingId); if(!clip) return;
    if(!window.confirm(`Delete "${clip.label || clip.type}"?`)) return;
    project().clips=clips().filter(c=>c.id!==editorExistingId);
    try { await window.ShowduinoProjects?.saveCurrentProject?.({cloud:false}); } catch(_) {}
    closeEditor(); activeTab='build'; render();
  }

  function startPreview() {
    if(preview.playing){ preview.playing=false; preview.paused=true; if(preview.raf) cancelAnimationFrame(preview.raf); render(); return; }
    const duration=projectDuration(); if(duration<=0) return;
    preview.playing=true; preview.paused=false; preview.offsetMs=preview.timeMs; preview.startedAt=performance.now();
    tickPreview(); render();
  }

  function stopPreview() { if(preview.raf) cancelAnimationFrame(preview.raf); preview={playing:false,paused:false,timeMs:0,startedAt:0,offsetMs:0,raf:0}; render(); }

  function tickPreview() {
    if(!preview.playing) return;
    preview.timeMs=preview.offsetMs+(performance.now()-preview.startedAt);
    const duration=projectDuration();
    if(preview.timeMs>=duration){ preview.timeMs=duration; preview.playing=false; updatePreviewDom(); return; }
    updatePreviewDom(); preview.raf=requestAnimationFrame(tickPreview);
  }

  function seekPreview(ms) { const duration=projectDuration(); preview.timeMs=clamp(ms,0,duration,0); if(preview.playing){ preview.offsetMs=preview.timeMs; preview.startedAt=performance.now(); } updatePreviewDom(); }

  function updatePreviewDom() {
    if(activeTab!=='preview') return;
    const time=document.getElementById('sm-preview-time'); if(time) time.textContent=formatMs(preview.timeMs);
    const progress=document.getElementById('sm-preview-progress'); if(progress) progress.value=String(Math.floor(preview.timeMs));
    const active=currentPreviewClips(preview.timeMs); const current=active[0]||null;
    const now=document.getElementById('sm-preview-now'); if(now) now.innerHTML=`<small>NOW</small><strong>${esc(current?.label || 'Waiting for cue')}</strong><span>${esc(current ? routeText(current) : 'No cue active')}</span>`;
    const pixels=document.getElementById('sm-preview-pixels'); if(pixels) pixels.innerHTML=previewPixelHtml(current,preview.timeMs);
  }

  async function saveProjectNow() { try{ await window.ShowduinoProjects?.saveCurrentProject?.({cloud:true}); render(); }catch(error){ window.alert(error.message||'Could not save this production.'); } }

  function requestAdvancedTimeline(force) {
    if(!force && !isLandscape()){ const rotate=document.getElementById('sm-rotate'); if(rotate) rotate.hidden=false; return; }
    document.body.classList.remove('studio-mobile-native'); document.body.classList.add('studio-mobile-advanced');
    window.ShowduinoStudioV4?.openPanel?.('timeline-editor');
  }

  function returnToMobile() { document.body.classList.remove('studio-mobile-advanced'); if(isPhone()) document.body.classList.add('studio-mobile-native'); activeTab='build'; render(); }

  async function deploy() {
    const out=document.getElementById('sm-deploy-result'); if(out) out.textContent='Preparing production…';
    try { const result=await window.ShowduinoDeploy?.deployCurrentProject?.(); if(out) out.textContent=result?.deployed ? 'Production sent to the local Showduino.' : 'A .shdo production file has been prepared for transfer.'; }
    catch(error){ if(out) out.textContent=`Could not prepare production: ${error.message}`; }
  }

  function handleClick(event) {
    const tab=event.target.closest('[data-sm-tab]'); if(tab){ activeTab=tab.dataset.smTab; if(activeTab!=='preview' && preview.playing){ preview.playing=false; if(preview.raf) cancelAnimationFrame(preview.raf); } render(); return; }
    const add=event.target.closest('[data-sm-add]'); if(add){ openEditor(add.dataset.smAdd,null,false); return; }
    if(event.target.closest('[data-sm-exit-template]')){ openEditor('pixel',null,true); return; }
    const edit=event.target.closest('[data-sm-edit]'); if(edit){ const c=clips().find(x=>x.id===edit.dataset.smEdit); if(c) openEditor(c.type,c.id,false); return; }
    if(event.target.closest('[data-sm-editor-close]')){ closeEditor(); return; }
    if(event.target.closest('[data-sm-editor-save]')){ saveEditorCue(); return; }
    if(event.target.closest('[data-sm-editor-delete]')){ deleteEditorCue(); return; }
    const fx=event.target.closest('[data-sm-pixel-fx]'); if(fx){ document.getElementById('sm-pixel-effect').value=fx.dataset.smPixelFx; document.querySelectorAll('[data-sm-pixel-fx]').forEach(b=>b.classList.toggle('active',b===fx)); pixelEmergencyPreview=false; renderEditorPixelPreview(); return; }
    if(event.target.closest('[data-sm-editor-exit]')){ applyExitTemplateInEditor(); return; }
    if(event.target.closest('[data-sm-editor-emergency]')){ pixelEmergencyPreview=!pixelEmergencyPreview; renderEditorPixelPreview(); return; }
    if(event.target.closest('[data-sm-preview-play]')){ startPreview(); return; }
    if(event.target.closest('[data-sm-preview-stop]')){ stopPreview(); return; }
    if(event.target.closest('[data-sm-save]')){ saveProjectNow(); return; }
    if(event.target.closest('[data-sm-rename]')){ window.ShowduinoProjects?.renameCurrentProject?.(); window.setTimeout(render,50); return; }
    if(event.target.closest('[data-sm-export]')){ window.ShowduinoProjects?.exportCurrentProject?.(); return; }
    if(event.target.closest('[data-sm-import]')){ document.getElementById('studio-import-file')?.click(); return; }
    if(event.target.closest('[data-sm-advanced]')){ requestAdvancedTimeline(false); return; }
    if(event.target.closest('[data-sm-rotate-cancel]')){ document.getElementById('sm-rotate').hidden=true; return; }
    if(event.target.closest('[data-sm-rotate-open]')){ requestAdvancedTimeline(true); return; }
    if(event.target.closest('#studio-mobile-return')){ returnToMobile(); return; }
    if(event.target.closest('[data-sm-deploy]')){ deploy(); }
  }

  function handleInput(event) {
    if(event.target.id==='sm-preview-progress') seekPreview(Number(event.target.value));
  }

  function mount() {
    if(!isV4() || !isPhone()) return;
    injectCss();
    document.body.classList.add('studio-mobile-native');
    document.body.classList.remove('studio-mobile-advanced');
    if(!root){ root=document.createElement('div'); root.id='studio-mobile-app'; document.body.appendChild(root); root.addEventListener('click',handleClick); root.addEventListener('input',handleInput); }
    render();
  }

  function syncViewport() {
    if(!isV4()) return;
    if(isPhone()) {
      if(document.body.classList.contains('studio-mobile-advanced') && isLandscape()) return;
      mount();
    } else {
      document.body.classList.remove('studio-mobile-native','studio-mobile-advanced');
      if(root) root.style.display='none';
    }
  }

  function initialise() {
    if(!isV4()) return;
    injectCss();
    syncViewport();
    const media=window.matchMedia(PHONE_QUERY);
    if(media.addEventListener) media.addEventListener('change',syncViewport); else media.addListener(syncViewport);
    window.addEventListener('orientationchange',()=>window.setTimeout(syncViewport,120));
    window.addEventListener('resize',()=>window.setTimeout(syncViewport,80));
    window.addEventListener('showduino:project-saved',()=>{ if(document.body.classList.contains('studio-mobile-native')) render(); });
    window.addEventListener('showduino:v4-saved',()=>{ if(document.body.classList.contains('studio-mobile-native')) render(); });
  }

  window.ShowduinoMobileStudio=Object.freeze({
    isPhone,
    openCue:(type)=>openEditor(type,null,false),
    returnToMobile,
    openAdvancedTimeline:()=>requestAdvancedTimeline(false),
    render
  });

  document.addEventListener('DOMContentLoaded',initialise);
})();
