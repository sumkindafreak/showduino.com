/* Showduino Studio — Ollie UX pass
 * Effect-first desktop authoring layered over the existing timeline.
 * Presentation/discoverability only: SHDO, P4 runtime and safety stay unchanged.
 */
(function () {
  'use strict';

  const DESKTOP = '(min-width: 761px)';
  const STYLE_ID = 'studio-ollie-ux-style';
  const PATCH_FLAG = '__showduinoOllieUxPatched';

  const CUES = Object.freeze([
    { type:'audio',   trackType:'audio',   icon:'♪', name:'Sound',         hint:'Scream, ambience, music', duration:5000 },
    { type:'mosfet',  trackType:'mixed',   icon:'☀', name:'Lighting',      hint:'On, dim or pulse a light', duration:1000 },
    { type:'relay',   trackType:'relay',   icon:'⚙', name:'Prop / Switch', hint:'Prop, solenoid or switch', duration:500 },
    { type:'pixel',   trackType:'pixel',   icon:'✦', name:'Pixels / LEDs', hint:'Colour and animated LED FX', duration:3000 },
    { type:'trigger', trackType:'trigger', icon:'◎', name:'Trigger',       hint:'Fire a logical event', duration:250 },
    { type:'fx',      trackType:'fx',      icon:'◈', name:'Other Effect',  hint:'Fog, air, motor, servo…', duration:1500 }
  ]);

  const META = Object.freeze({
    audio:{icon:'♪',name:'Sound',hint:'Drag a sound cue here'},
    relay:{icon:'⚙',name:'Prop / Switch',hint:'Drag a prop or switched action here'},
    mosfet:{icon:'☀',name:'Lighting',hint:'Drag a lighting action here'},
    lighting:{icon:'☀',name:'Lighting',hint:'Drag a lighting action here'},
    pixel:{icon:'✦',name:'Pixels / LEDs',hint:'Drag a pixel effect here'},
    trigger:{icon:'◎',name:'Trigger',hint:'Drag a trigger here'},
    fx:{icon:'◈',name:'Other Effect',hint:'Drag an effect here'},
    prop:{icon:'⚙',name:'Prop / Effect',hint:'Drag a prop or effect here'},
    mixed:{icon:'+',name:'General',hint:'Drag an action here'}
  });

  let activeDragType = '';
  let lastHoverRow = null;

  const isDesktop = () => window.matchMedia(DESKTOP).matches;
  const meta = (type) => META[String(type || 'mixed').toLowerCase()] || META.mixed;

  function trackAccepts(track, cueType) {
    const type = String(track?.type || 'mixed').toLowerCase();
    if (type === 'mixed') return true;
    if (type === 'audio') return cueType === 'audio';
    if (type === 'relay') return cueType === 'relay';
    if (type === 'pixel') return cueType === 'pixel';
    if (type === 'trigger') return cueType === 'trigger';
    if (type === 'fx') return cueType === 'fx';
    if (type === 'lighting') return cueType === 'mosfet' || cueType === 'pixel';
    if (type === 'prop') return cueType === 'relay' || cueType === 'fx';
    return false;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:761px) {
        /* Keep cue creation visible without stealing the actual timeline. */
        .studio-v4 .showduino-ollie-shelf{
          flex:0 0 auto !important;
          display:grid !important;
          grid-template-columns:168px minmax(0,1fr) auto;
          align-items:center;
          gap:8px;
          min-height:0 !important;
          max-height:64px !important;
          padding:6px 8px !important;
          overflow:hidden;
          border:1px solid #263a44;
          border-bottom:0;
          border-radius:12px 12px 0 0;
          background:linear-gradient(180deg,#10191e,#0b1216);
          box-sizing:border-box;
        }
        .showduino-ollie-head{display:contents !important}
        .showduino-ollie-head>div{min-width:0}
        .showduino-ollie-head strong{
          display:block;color:#edf5f7;
          font:850 12px/1.15 Inter,system-ui,sans-serif;
          white-space:nowrap
        }
        .showduino-ollie-head span{display:none !important}
        .showduino-ollie-mode{
          grid-column:3;
          min-height:28px !important;
          height:28px;
          padding:4px 9px !important;
          border:1px solid #304650;border-radius:7px;
          background:#0b1419;color:#94a7af;cursor:pointer;
          font:800 9px/1 Inter,system-ui,sans-serif;
          white-space:nowrap
        }
        .showduino-ollie-mode:hover{border-color:rgba(0,255,200,.4);color:#c9fff2}
        .showduino-ollie-grid{
          grid-column:2;
          min-width:0;
          display:grid !important;
          grid-template-columns:repeat(6,minmax(104px,1fr));
          gap:5px;
          overflow-x:auto;
          overflow-y:hidden;
          scrollbar-width:none
        }
        .showduino-ollie-grid::-webkit-scrollbar{display:none}
        .showduino-ollie-cue{
          min-width:104px !important;
          min-height:44px !important;
          height:44px !important;
          display:grid !important;
          grid-template-columns:26px minmax(0,1fr);
          gap:6px;align-items:center;
          padding:4px 6px !important;
          border:1px solid #2b414a;border-radius:8px;
          background:linear-gradient(145deg,#121d22,#0b1317);
          color:#e5eef0;text-align:left;cursor:grab;user-select:none;
          box-sizing:border-box
        }
        .showduino-ollie-cue:hover{
          border-color:rgba(0,255,200,.45);
          background:linear-gradient(145deg,#14262b,#0d171b)
        }
        .showduino-ollie-cue:active{cursor:grabbing}
        .showduino-ollie-icon{
          width:26px;height:26px;display:grid;place-items:center;
          border:1px solid #314a54;border-radius:7px;
          background:#071014;color:#00ffc8;
          font:750 14px/1 Inter,system-ui,sans-serif
        }
        .showduino-ollie-copy{min-width:0}
        .showduino-ollie-copy b{
          display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
          font:850 9.5px/1.1 Inter,system-ui,sans-serif
        }
        .showduino-ollie-copy small{display:none !important}
        .showduino-ollie-foot{display:none !important}

        .timeline-editor.showduino-ollie-ready{
          height:100% !important;
          min-height:0 !important;
          display:flex !important;
          flex-direction:column !important;
          overflow:hidden !important;
          background:#0d1418 !important;
          border-color:#263a44 !important
        }
        .timeline-editor.showduino-ollie-ready .timeline-main{
          flex:1 1 auto !important;
          min-height:0 !important;
          height:auto !important;
          overflow:hidden !important
        }
        .timeline-editor.showduino-ollie-ready .tl-canvas-scroll{min-height:0 !important}
        .timeline-editor.showduino-ollie-ready .tl-left{
          width:190px !important;min-width:190px !important;background:#10181d !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-list-header{
          padding:0 11px !important;background:#0d1519 !important;color:#82969f !important;
          font:850 10px/1 Inter,system-ui,sans-serif !important;
          letter-spacing:.08em;text-transform:uppercase
        }
        .timeline-editor.showduino-ollie-ready .tl-track-header{
          padding:7px 8px !important;background:#111b20 !important;
          border-bottom-color:#26363e !important;font-family:Inter,system-ui,sans-serif !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-row{
          background:#0e161a !important;border-bottom-color:#22323a !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-row.sd-empty-lane::before{
          content:attr(data-empty-hint);position:absolute;left:18px;top:50%;
          transform:translateY(-50%);color:#526872;
          font:650 10px/1 Inter,system-ui,sans-serif;pointer-events:none;z-index:1
        }
        .timeline-editor.showduino-ollie-ready .tl-track-row.sd-drop-ok{
          outline:2px solid rgba(0,255,200,.65);outline-offset:-2px;
          background:rgba(0,255,200,.065) !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-row.sd-drop-bad{
          outline:2px solid rgba(255,91,112,.55);outline-offset:-2px;
          background:rgba(255,91,112,.045) !important
        }
        body.showduino-cue-dragging .tl-track-row.sd-empty-lane::before{
          content:'Drop here';color:#6fd2ba
        }
        .timeline-editor.showduino-ollie-ready .tl-clip{
          min-width:30px;border-radius:7px !important;box-shadow:0 3px 10px rgba(0,0,0,.24)
        }
        .timeline-editor.showduino-ollie-ready .tl-clip span{
          font:900 10px/1 Inter,system-ui,sans-serif !important;color:#061012 !important
        }

        .timeline-editor.showduino-ollie-ready .daw-library,
        .timeline-editor.showduino-ollie-ready .mixer-toolbar,
        .timeline-editor.showduino-ollie-ready .sd-advanced-only{display:none !important}
        .timeline-editor.showduino-ollie-ready .daw-shortcuts{display:none !important}
        .timeline-editor.showduino-ollie-ready.sd-advanced .daw-library{display:block !important}
        .timeline-editor.showduino-ollie-ready.sd-advanced .mixer-toolbar{display:flex !important}
        .timeline-editor.showduino-ollie-ready.sd-advanced .sd-advanced-only{display:initial !important}
        .timeline-editor.showduino-ollie-ready.sd-advanced .daw-shortcuts{display:block !important}

        .timeline-editor.showduino-ollie-ready .tl-toolbar{
          flex:0 0 38px !important;
          min-height:38px !important;
          max-height:38px !important;
          padding:4px 8px !important;
          gap:4px !important;
          overflow-x:auto !important;
          overflow-y:hidden !important;
          flex-wrap:nowrap !important;
          align-items:center !important;
          background:#172127 !important;
          border-bottom-color:#2a3b43 !important;
          box-sizing:border-box
        }
        .timeline-editor.showduino-ollie-ready .tl-toolbar button{
          min-height:26px !important;height:26px !important;
          padding:3px 8px !important;border-radius:6px !important
        }
        .timeline-editor.showduino-ollie-ready #tl-timecode{
          font-size:12px !important;line-height:26px !important
        }

        .sd-empty-show{
          position:absolute;left:50%;top:72px;z-index:160;
          width:min(440px,calc(100% - 60px));transform:translateX(-50%);
          padding:18px;border:1px dashed #344c56;border-radius:14px;
          background:rgba(12,20,24,.96);box-shadow:0 15px 45px rgba(0,0,0,.28);
          text-align:center;font-family:Inter,system-ui,sans-serif
        }
        .sd-empty-show strong{display:block;color:#eaf3f5;font-size:15px}
        .sd-empty-show p{
          margin:7px auto 0;max-width:340px;color:#7c919a;font-size:11px;line-height:1.5
        }
      }

      @media (min-width:761px) and (max-width:1180px){
        .studio-v4 .showduino-ollie-shelf{
          grid-template-columns:118px minmax(0,1fr) auto
        }
        .showduino-ollie-head strong{font-size:10px}
        .showduino-ollie-grid{
          grid-template-columns:repeat(6,minmax(125px,1fr))
        }
      }
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
      if (label && names[item.dataset.panel]) label.textContent = names[item.dataset.panel];
    });
  }

  function bestTrack(editor, cue) {
    const all = typeof editor._tracks === 'function' ? editor._tracks() : [];
    const selected = all.find((track) =>
      track.id === editor._selectedTrackId && !track.locked && trackAccepts(track, cue.type)
    );
    if (selected) return selected;

    if (cue.type === 'mosfet') {
      const lighting = all.find((track) =>
        !track.locked && String(track.type) === 'mixed' && /light/i.test(track.name || '')
      );
      if (lighting) return lighting;
    }

    return all.find((track) =>
      !track.locked &&
      trackAccepts(track, cue.type) &&
      (String(track.type) === cue.trackType || String(track.type) === 'mixed')
    ) || null;
  }

  function ensureTrack(editor, cue) {
    const existing = bestTrack(editor, cue);
    if (existing) return existing;
    return typeof editor.addTrack === 'function'
      ? editor.addTrack(cue.trackType, `${cue.name} Lane`)
      : null;
  }

  function addCue(editor, cue) {
    if (!editor || typeof editor._addClip !== 'function') return;
    const track = ensureTrack(editor, cue);
    if (!track) return;

    const start = Math.max(0, Number(editor._state?.playhead || 0));
    const clip = editor._addClip(track.id, cue.type, start, cue.duration);

    window.requestAnimationFrame(() => {
      const element = clip?.id
        ? editor._canvas?.querySelector(`[data-clip-id="${CSS.escape(clip.id)}"]`)
        : null;
      element?.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
    });
  }

  function clearHoverRow() {
    if (!lastHoverRow) return;
    lastHoverRow.classList.remove('sd-drop-ok', 'sd-drop-bad');
    lastHoverRow = null;
  }

  function clearDragState() {
    activeDragType = '';
    clearHoverRow();
    document.body.classList.remove('showduino-cue-dragging');
  }

  function cueButton(editor, cue) {
    const button = document.createElement('button');
    button.type = 'button';
    button.draggable = true;
    button.className = 'showduino-ollie-cue';
    button.dataset.cueType = cue.type;
    button.title = `Drag ${cue.name} onto the timeline, or click to add at the playhead`;
    button.innerHTML =
      `<span class="showduino-ollie-icon">${cue.icon}</span>` +
      `<span class="showduino-ollie-copy"><b>${cue.name}</b><small>${cue.hint}</small></span>`;

    button.addEventListener('click', () => addCue(editor, cue));
    button.addEventListener('dragstart', (event) => {
      activeDragType = cue.type;
      event.dataTransfer?.setData('blockType', cue.type);
      event.dataTransfer?.setData('text/plain', cue.type);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      document.body.classList.add('showduino-cue-dragging');
    });
    button.addEventListener('dragend', clearDragState);
    return button;
  }

  function buildShelf(editor) {
    const shelf = document.createElement('section');
    shelf.className = 'showduino-ollie-shelf';
    shelf.innerHTML =
      '<div class="showduino-ollie-head">' +
        '<div><strong>Add action</strong><span>Drag or click to add at the playhead.</span></div>' +
      '</div>';

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
    foot.textContent =
      'Start with the effect. Showduino keeps the relay / MOSFET / hardware detail underneath.';
    shelf.appendChild(foot);
    return shelf;
  }

  function simplifyToolbar(editor) {
    const toolbar = editor._el?.querySelector('.tl-toolbar');
    if (!toolbar) return;

    Array.from(toolbar.children).forEach((child) => {
      const text = child.textContent?.trim() || '';
      if (text.startsWith('Add Track:') || text.startsWith('Zoom:')) {
        child.classList.add('sd-advanced-only');
      }
    });

    toolbar.querySelectorAll('button').forEach((button) => {
      const text = button.textContent.trim();
      if (/^(🔍\+|🔍-|Fit|⋮ Grid:|📌 Marker|💾 Save|📂 Open|⬇ Export|⬆ Import|＋ New)/.test(text)) {
        button.classList.add('sd-advanced-only');
      }
    });

    toolbar.querySelector('.daw-shortcuts')?.classList.add('sd-advanced-only');
  }

  function decorateTracks(editor) {
    const allTracks = typeof editor._tracks === 'function' ? editor._tracks() : [];
    const allClips = typeof editor._clips === 'function' ? editor._clips() : [];
    const header = editor._el?.querySelector('.tl-track-list-header');
    if (header) header.textContent = 'Show lanes';

    editor._el?.querySelectorAll('.tl-track-row').forEach((row) => {
      const track = allTracks.find((item) => item.id === row.dataset.trackId);
      if (!track) return;
      const empty = !allClips.some((clip) => clip.trackId === track.id);
      row.classList.toggle('sd-empty-lane', empty);
      if (empty) row.dataset.emptyHint = meta(track.type).hint;
      else delete row.dataset.emptyHint;
    });

    editor._el?.querySelectorAll('.tl-clip').forEach((element) => {
      const clip = allClips.find((item) => item.id === element.dataset.clipId);
      const label = element.querySelector('span');
      if (clip && label) label.textContent = `${meta(clip.type).icon} ${clip.label || meta(clip.type).name}`;
    });
  }

  function emptyState(editor) {
    const scroll = editor._el?.querySelector('.tl-canvas-scroll');
    if (!scroll) return;
    const allClips = typeof editor._clips === 'function' ? editor._clips() : [];
    const existing = scroll.querySelector('.sd-empty-show');

    if (allClips.length) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const empty = document.createElement('div');
    empty.className = 'sd-empty-show';
    empty.innerHTML =
      '<strong>Your show is empty.</strong>' +
      '<p>Pick Sound, Lighting, Prop or Pixels above. Click adds it at the playhead; dragging lets you place it exactly where you want it.</p>';
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
    if (typeof TimelineEditor === 'undefined') return;
    const proto = TimelineEditor.prototype;
    if (proto[PATCH_FLAG]) return;
    proto[PATCH_FLAG] = true;

    const render = proto._render;
    proto._render = function () {
      const result = render.apply(this, arguments);
      requestAnimationFrame(() => enhance(this));
      return result;
    };

    const renderTracks = proto._renderTracks;
    proto._renderTracks = function () {
      const result = renderTracks.apply(this, arguments);
      requestAnimationFrame(() => enhance(this));
      return result;
    };

    const addClip = proto._addClip;
    proto._addClip = function () {
      const result = addClip.apply(this, arguments);
      requestAnimationFrame(() => enhance(this));
      return result;
    };

    if (window.timelineEditor) enhance(window.timelineEditor);
  }

  function bindDragGuard() {
    document.addEventListener('dragover', (event) => {
      if (!activeDragType || !(event.target instanceof Element)) return;
      const row = event.target.closest('.tl-track-row');

      if (row !== lastHoverRow) {
        clearHoverRow();
        lastHoverRow = row;
      }

      if (!row || !window.timelineEditor) return;
      const track = window.timelineEditor._tracks?.().find((item) => item.id === row.dataset.trackId);
      row.classList.toggle('sd-drop-ok', trackAccepts(track, activeDragType));
      row.classList.toggle('sd-drop-bad', !trackAccepts(track, activeDragType));
    }, true);

    document.addEventListener('drop', (event) => {
      if (!activeDragType || !(event.target instanceof Element)) return;
      const row = event.target.closest('.tl-track-row');

      if (row && window.timelineEditor) {
        const track = window.timelineEditor._tracks?.().find((item) => item.id === row.dataset.trackId);
        if (!trackAccepts(track, activeDragType)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }

      clearDragState();
    }, true);

    document.addEventListener('dragend', clearDragState, true);
  }

  function boot() {
    injectStyles();
    renameNavigation();
    patchTimeline();
    bindDragGuard();

    setTimeout(() => {
      renameNavigation();
      patchTimeline();
      if (window.timelineEditor) enhance(window.timelineEditor);
    }, 250);

    window.addEventListener('resize', () => {
      if (window.timelineEditor) enhance(window.timelineEditor);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
