/* Showduino Studio — Ollie UX pass
 * Friendly, effect-first desktop authoring layered over the existing timeline.
 * No SHDO/runtime/safety behaviour is changed here.
 */
(function () {
  'use strict';

  const DESKTOP = '(min-width: 761px)';
  const STYLE_ID = 'studio-ollie-ux-style';
  const PATCHED = Symbol('showduinoOllieUxPatched');

  const CUES = Object.freeze([
    { type:'audio',   trackType:'audio',   icon:'♪', name:'Sound',         hint:'Scream, ambience, music', duration:5000 },
    { type:'mosfet',  trackType:'mixed',   icon:'☀', name:'Lighting',      hint:'On, dim or pulse a light', duration:1000 },
    { type:'relay',   trackType:'relay',   icon:'⚙', name:'Prop / Switch', hint:'Prop, solenoid or switch', duration:500 },
    { type:'pixel',   trackType:'pixel',   icon:'✦', name:'Pixels / LEDs', hint:'Colour and animated LED FX', duration:3000 },
    { type:'trigger', trackType:'trigger', icon:'◎', name:'Trigger',       hint:'Fire a logical event', duration:250 },
    { type:'fx',      trackType:'fx',      icon:'◈', name:'Other Effect',  hint:'Fog, air, motor, servo…', duration:1500 }
  ]);

  const META = Object.freeze({
    audio:   { icon:'♪', name:'Sound', hint:'Drag a sound cue here' },
    relay:   { icon:'⚙', name:'Prop / Switch', hint:'Drag a prop or switched action here' },
    mosfet:  { icon:'☀', name:'Lighting', hint:'Drag a lighting action here' },
    lighting:{ icon:'☀', name:'Lighting', hint:'Drag a lighting action here' },
    pixel:   { icon:'✦', name:'Pixels / LEDs', hint:'Drag a pixel effect here' },
    trigger: { icon:'◎', name:'Trigger', hint:'Drag a trigger here' },
    fx:      { icon:'◈', name:'Other Effect', hint:'Drag an effect here' },
    mixed:   { icon:'+', name:'General', hint:'Drag an action here' }
  });

  function isDesktop() { return window.matchMedia(DESKTOP).matches; }
  function meta(type) { return META[String(type || 'mixed').toLowerCase()] || META.mixed; }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:761px) {
        .studio-v4 .showduino-ollie-shelf {
          flex:0 0 auto;
          padding:12px 14px 10px;
          border:1px solid #263a44;
          border-bottom:0;
          border-radius:12px 12px 0 0;
          background:linear-gradient(180deg,#10191e,#0b1216);
        }
        .showduino-ollie-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:9px}
        .showduino-ollie-head strong{display:block;color:#edf5f7;font:850 14px/1.2 Inter,system-ui,sans-serif}
        .showduino-ollie-head span{display:block;margin-top:3px;color:#70848e;font:650 10px/1.35 Inter,system-ui,sans-serif}
        .showduino-ollie-mode{flex:0 0 auto;min-height:32px;padding:6px 10px;border:1px solid #304650;border-radius:8px;background:#0b1419;color:#94a7af;cursor:pointer;font:800 10px/1 Inter,system-ui,sans-serif}
        .showduino-ollie-mode:hover{border-color:rgba(0,255,200,.4);color:#c9fff2}
        .showduino-ollie-grid{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:7px}
        .showduino-ollie-cue{min-width:0;min-height:62px;display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;padding:8px;border:1px solid #2b414a;border-radius:10px;background:linear-gradient(145deg,#121d22,#0b1317);color:#e5eef0;text-align:left;cursor:grab;user-select:none}
        .showduino-ollie-cue:hover{border-color:rgba(0,255,200,.45);background:linear-gradient(145deg,#14262b,#0d171b);transform:translateY(-1px)}
        .showduino-ollie-cue:active{cursor:grabbing;transform:none}
        .showduino-ollie-icon{width:32px;height:32px;display:grid;place-items:center;border:1px solid #314a54;border-radius:8px;background:#071014;color:#00ffc8;font:750 17px/1 Inter,system-ui,sans-serif}
        .showduino-ollie-copy{min-width:0}.showduino-ollie-copy b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:850 11px/1.15 Inter,system-ui,sans-serif}.showduino-ollie-copy small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#71858f;font:650 9px/1.2 Inter,system-ui,sans-serif}
        .showduino-ollie-foot{margin-top:7px;color:#60747e;font:650 9px/1.35 Inter,system-ui,sans-serif}

        .timeline-editor.showduino-ollie-ready{background:#0d1418 !important;border-color:#263a44 !important}
        .timeline-editor.showduino-ollie-ready .tl-left{width:190px !important;min-width:190px !important;background:#10181d !important}
        .timeline-editor.showduino-ollie-ready .tl-track-list-header{padding:0 11px !important;background:#0d1519 !important;color:#82969f !important;font:850 10px/1 Inter,system-ui,sans-serif !important;letter-spacing:.08em;text-transform:uppercase}
        .timeline-editor.showduino-ollie-ready .tl-track-header{padding:7px 8px !important;background:#111b20 !important;border-bottom-color:#26363e !important;font-family:Inter,system-ui,sans-serif !important}
        .timeline-editor.showduino-ollie-ready .tl-track-row{background:#0e161a !important;border-bottom-color:#22323a !important}
        .timeline-editor.showduino-ollie-ready .tl-track-row.sd-empty-lane::before{content:attr(data-empty-hint);position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#526872;font:650 10px/1 Inter,system-ui,sans-serif;pointer-events:none;z-index:1}
        body.showduino-cue-dragging .tl-track-row.sd-empty-lane::before{content:'Drop here';color:#6fd2ba}
        body.showduino-cue-dragging .tl-track-row{outline:1px dashed rgba(0,255,200,.18);outline-offset:-2px}
        body.showduino-cue-dragging .tl-track-row:hover{outline:2px solid rgba(0,255,200,.62);background:rgba(0,255,200,.065) !important}
        .timeline-editor.showduino-ollie-ready .tl-clip{min-width:30px;border-radius:7px !important;box-shadow:0 3px 10px rgba(0,0,0,.24)}
        .timeline-editor.showduino-ollie-ready .tl-clip span{font:900 10px/1 Inter,system-ui,sans-serif !important;color:#061012 !important}

        .timeline-editor.showduino-ollie-ready .daw-library{display:none !important}
        .timeline-editor.showduino-ollie-ready .mixer-toolbar{display:none !important}
        .timeline-editor.showduino-ollie-ready .sd-advanced-only{display:none !important}
        .timeline-editor.showduino-ollie-ready.sd-advanced .daw-library{display:block !important}
        .timeline-editor.showduino-ollie-ready.sd-advanced .mixer-toolbar{display:flex !important}
        .timeline-editor.showduino-ollie-ready.sd-advanced .sd-advanced-only{display:initial !important}

        .timeline-editor.showduino-ollie-ready .tl-toolbar{min-height:38px !important;padding:6px 9px !important;gap:5px !important;background:#172127 !important;border-bottom-color:#2a3b43 !important}
        .timeline-editor.showduino-ollie-ready .tl-toolbar > div:first-child{display:none !important}
        .timeline-editor.showduino-ollie-ready .tl-toolbar button{min-height:28px;border-radius:6px !important}
        .timeline-editor.showduino-ollie-ready #tl-timecode{font-size:13px !important}

        .sd-empty-show{position:absolute;left:50%;top:72px;z-index:160;width:min(440px,calc(100% - 60px));transform:translateX(-50%);padding:18px;border:1px dashed #344c56;border-radius:14px;background:rgba(12,20,24,.96);box-shadow:0 15px 45px rgba(0,0,0,.28);text-align:center;font-family:Inter,system-ui,sans-serif}
        .sd-empty-show strong{display:block;color:#eaf3f5;font-size:15px}.sd-empty-show p{margin:7px auto 0;max-width:340px;color:#7c919a;font-size:11px;line-height:1.5}

        .studio-v4 .sidebar-nav li[data-panel='timeline-editor'] span:last-child,
        .studio-v4 .sidebar-nav li[data-panel='playback'] span:last-child,
        .studio-v4 .sidebar-nav li[data-panel='audio-manager'] span:last-child,
        .studio-v4 .sidebar-nav li[data-panel='connect'] span:last-child,
        .studio-v4 .sidebar-nav li[data-panel='devices'] span:last-child{transition:none}
      }
      @media (min-width:761px) and (max-width:1250px){.showduino-ollie-grid{grid-template-columns:repeat(3,minmax(120px,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function renameNavigation() {
    const names = {
      'timeline-editor':'Build Show',
      'playback':'Lighting FX',
      'audio-manager':'Sounds',
      'connect':'Send to Showduino',
      'devices':'Devices'
    };
    document.querySelectorAll('.sidebar-nav li[data-panel]').forEach((item) => {
      const label = item.querySelector('span:last-child');
      const next = names[item.dataset.panel];
      if (label && next) label.textContent = next;
    });
  }

  function cueForType(type) { return CUES.find((cue) => cue.type === type) || null; }

  function bestTrack(editor, cue) {
    const tracks = typeof editor._tracks === 'function' ? editor._tracks() : [];
    const selected = tracks.find((track) => track.id === editor._selectedTrackId && !track.locked);
    if (selected) return selected;
    if (cue.type === 'mosfet') {
      const named = tracks.find((track) => !track.locked && /light/i.test(track.name || ''));
      if (named) return named;
    }
    return tracks.find((track) => !track.locked && String(track.type) === cue.trackType) || null;
  }

  function ensureTrack(editor, cue) {
    let track = bestTrack(editor, cue);
    if (track) return track;
    if (typeof editor.addTrack !== 'function') return null;
    const name = `${cue.name} Lane`;
    track = editor.addTrack(cue.trackType, name);
    return track || (typeof editor._tracks === 'function' ? editor._tracks().at(-1) : null);
  }

  function focusClip(editor, clip) {
    window.requestAnimationFrame(() => {
      const element = clip?.id ? editor._canvas?.querySelector(`[data-clip-id="${CSS.escape(clip.id)}"]`) : null;
      element?.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
    });
  }

  function addCue(editor, cue) {
    if (!editor || typeof editor._addClip !== 'function') return;
    const track = ensureTrack(editor, cue);
    if (!track) return;
    const start = Math.max(0, Number(editor._state?.playhead || 0));
    const clip = editor._addClip(track.id, cue.type, start, cue.duration);
    focusClip(editor, clip);
  }

  function cueButton(editor, cue) {
    const button = document.createElement('button');
    button.type = 'button';
    button.draggable = true;
    button.className = 'showduino-ollie-cue';
    button.dataset.cueType = cue.type;
    button.title = `Drag ${cue.name} onto the timeline, or click to add at the playhead`;
    button.innerHTML = `<span class="showduino-ollie-icon">${cue.icon}</span><span class="showduino-ollie-copy"><b>${cue.name}</b><small>${cue.hint}</small></span>`;
    button.addEventListener('click', () => addCue(editor, cue));
    button.addEventListener('dragstart', (event) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('blockType', cue.type);
      event.dataTransfer.setData('text/plain', cue.type);
      document.body.classList.add('showduino-cue-dragging');
    });
    button.addEventListener('dragend', () => document.body.classList.remove('showduino-cue-dragging'));
    return button;
  }

  function buildShelf(editor) {
    const shelf = document.createElement('section');
    shelf.className = 'showduino-ollie-shelf';
    shelf.innerHTML = `<div class="showduino-ollie-head"><div><strong>What should happen?</strong><span>Drag an action onto the timeline, or click it to add at the playhead.</span></div></div>`;

    const mode = document.createElement('button');
    mode.type = 'button';
    mode.className = 'showduino-ollie-mode';
    mode.textContent = 'Advanced tools';
    mode.addEventListener('click', () => {
      const advanced = editor._el.classList.toggle('sd-advanced');
      mode.textContent = advanced ? 'Simple view' : 'Advanced tools';
    });
    shelf.querySelector('.showduino-ollie-head').appendChild(mode);

    const grid = document.createElement('div');
    grid.className = 'showduino-ollie-grid';
    CUES.forEach((cue) => grid.appendChild(cueButton(editor, cue)));
    shelf.appendChild(grid);

    const foot = document.createElement('div');
    foot.className = 'showduino-ollie-foot';
    foot.textContent = 'Start with the effect. Showduino keeps the relay / MOSFET / hardware detail underneath.';
    shelf.appendChild(foot);
    return shelf;
  }

  function simplifyToolbar(editor) {
    const toolbar = editor._el?.querySelector('.tl-toolbar');
    if (!toolbar) return;
    Array.from(toolbar.querySelectorAll('button')).forEach((button) => {
      const text = button.textContent.trim();
      if (/^(🔍\+|🔍-|Fit|⋮ Grid:|📌 Marker|💾 Save|📂 Open|⬇ Export|⬆ Import|＋ New)/.test(text)) {
        button.classList.add('sd-advanced-only');
      }
    });
    Array.from(toolbar.children).forEach((child) => {
      if (child.textContent?.trim().startsWith('Add Track:')) child.style.display = 'none';
    });
  }

  function decorateTracks(editor) {
    const tracks = typeof editor._tracks === 'function' ? editor._tracks() : [];
    const clips = typeof editor._clips === 'function' ? editor._clips() : [];
    const header = editor._el?.querySelector('.tl-track-list-header');
    if (header) header.textContent = 'Show lanes';

    editor._el?.querySelectorAll('.tl-track-row').forEach((row) => {
      const track = tracks.find((item) => item.id === row.dataset.trackId);
      if (!track) return;
      const empty = !clips.some((clip) => clip.trackId === track.id);
      row.classList.toggle('sd-empty-lane', empty);
      if (empty) row.dataset.emptyHint = meta(track.type).hint;
      else delete row.dataset.emptyHint;
    });

    editor._el?.querySelectorAll('.tl-clip').forEach((element) => {
      const clip = clips.find((item) => item.id === element.dataset.clipId);
      if (!clip) return;
      const label = element.querySelector('span');
      if (label) label.textContent = `${meta(clip.type).icon} ${clip.label || meta(clip.type).name}`;
    });
  }

  function emptyState(editor) {
    const scroll = editor._el?.querySelector('.tl-canvas-scroll');
    if (!scroll) return;
    const clips = typeof editor._clips === 'function' ? editor._clips() : [];
    let empty = scroll.querySelector('.sd-empty-show');
    if (clips.length) {
      empty?.remove();
      return;
    }
    if (empty) return;
    empty = document.createElement('div');
    empty.className = 'sd-empty-show';
    empty.innerHTML = '<strong>Your show is empty.</strong><p>Pick Sound, Lighting, Prop or Pixels above. Click adds it at the playhead; dragging lets you place it exactly where you want it.</p>';
    scroll.appendChild(empty);
  }

  function enhance(editor) {
    if (!isDesktop() || !editor?._el) return;
    editor._el.classList.add('showduino-ollie-ready');
    if (!editor._el.querySelector('.showduino-ollie-shelf')) {
      const toolbar = editor._el.querySelector('.tl-toolbar');
      const shelf = buildShelf(editor);
      toolbar ? editor._el.insertBefore(shelf, toolbar) : editor._el.prepend(shelf);
    }
    simplifyToolbar(editor);
    decorateTracks(editor);
    emptyState(editor);
  }

  function patchTimeline() {
    if (typeof window.TimelineEditor === 'undefined' || window.TimelineEditor.prototype[PATCHED]) return;
    const proto = window.TimelineEditor.prototype;
    proto[PATCHED] = true;

    const render = proto._render;
    proto._render = function () {
      const result = render.apply(this, arguments);
      window.requestAnimationFrame(() => enhance(this));
      return result;
    };

    const renderTracks = proto._renderTracks;
    proto._renderTracks = function () {
      const result = renderTracks.apply(this, arguments);
      window.requestAnimationFrame(() => enhance(this));
      return result;
    };

    const addClip = proto._addClip;
    proto._addClip = function () {
      const clip = addClip.apply(this, arguments);
      window.requestAnimationFrame(() => enhance(this));
      return clip;
    };

    const deleteClip = proto._deleteClip;
    if (deleteClip) {
      proto._deleteClip = function () {
        const result = deleteClip.apply(this, arguments);
        window.requestAnimationFrame(() => enhance(this));
        return result;
      };
    }

    if (window.timelineEditor) enhance(window.timelineEditor);
  }

  function boot() {
    injectStyles();
    renameNavigation();
    patchTimeline();
    window.setTimeout(() => {
      renameNavigation();
      patchTimeline();
      if (window.timelineEditor) enhance(window.timelineEditor);
    }, 250);
    window.addEventListener('resize', () => window.timelineEditor && enhance(window.timelineEditor));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
