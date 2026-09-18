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
    { type:'audio',   trackType:'audio',   icon:'♪', name:'Sound',         bar:'Sound',   hint:'Scream, ambience, music', duration:5000 },
    { type:'mosfet',  trackType:'mixed',   icon:'☀', name:'Lighting',      bar:'Lighting', hint:'On, dim or pulse a light', duration:1000 },
    { type:'relay',   trackType:'relay',   icon:'⚙', name:'Prop / Switch', bar:'Prop',    hint:'Prop, solenoid or switch', duration:500 },
    { type:'pixel',   trackType:'pixel',   icon:'✦', name:'Pixels / LEDs', bar:'Pixels',  hint:'Colour and animated LED FX', duration:3000 },
    { type:'trigger', trackType:'trigger', icon:'◎', name:'Trigger',       bar:'Trigger', hint:'Fire a logical event', duration:250 },
    { type:'fx',      trackType:'fx',      icon:'◈', name:'Other Effect',  bar:'Other',   hint:'Fog, air, motor, servo…', duration:1500 }
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
        .studio-v4 .showduino-ollie-shelf{
          flex:0 0 auto !important;
          display:flex !important;
          align-items:center;
          gap:6px;
          min-height:36px !important;
          max-height:40px !important;
          padding:4px 10px !important;
          overflow:visible;
          border:0 !important;
          border-bottom:1px solid #1e2c34 !important;
          border-radius:0 !important;
          background:#0b1216 !important;
          box-sizing:border-box
        }
        .showduino-ollie-head{display:none !important}
        .showduino-ollie-grid{
          display:flex !important;
          flex-wrap:nowrap;
          align-items:center;
          gap:2px;
          min-width:0;
          flex:1 1 auto;
          overflow-x:auto;
          scrollbar-width:none
        }
        .showduino-ollie-grid::-webkit-scrollbar{display:none}
        .showduino-ollie-cue{
          min-width:0 !important;
          min-height:28px !important;
          height:28px !important;
          display:inline-flex !important;
          align-items:center;
          gap:5px;
          padding:0 8px !important;
          border:0 !important;
          border-radius:6px;
          background:transparent;
          color:#d7e3e7;
          cursor:grab;
          user-select:none;
          white-space:nowrap
        }
        .showduino-ollie-cue:hover,
        .showduino-ollie-cue:focus-visible{
          background:rgba(0,255,200,.08);
          color:#edf5f7;
          outline:none
        }
        .showduino-ollie-cue:active{cursor:grabbing}
        .showduino-ollie-icon{display:none}
        .showduino-ollie-copy b{
          font:750 12px/1 Inter,system-ui,sans-serif
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
          border-color:transparent !important
        }
        .timeline-editor.showduino-ollie-ready .timeline-main{
          flex:1 1 auto !important;
          min-height:0 !important;
          height:auto !important;
          overflow:hidden !important
        }
        .timeline-editor.showduino-ollie-ready .tl-canvas-scroll{min-height:0 !important}
        .timeline-editor.showduino-ollie-ready .tl-left{
          width:168px !important;min-width:168px !important;background:#0e1519 !important;
          border-right:1px solid #1e2c34 !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-list-header{
          min-height:36px !important;height:auto !important;
          padding:0 11px !important;background:transparent !important;color:#82969f !important;
          font:850 10px/1 Inter,system-ui,sans-serif !important;
          letter-spacing:.08em;text-transform:uppercase;
          border-bottom:1px solid #1e2c34 !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-header{
          padding:8px 10px 6px !important;background:transparent !important;
          border-bottom-color:#1e2c34 !important;font-family:Inter,system-ui,sans-serif !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-header span{
          font:750 12px/1.2 Inter,system-ui,sans-serif !important
        }
        .timeline-editor.showduino-ollie-ready .tl-track-row{
          background:#0e161a !important;border-bottom-color:#1a272e !important
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
        .timeline-editor.showduino-ollie-ready .tl-empty-drop,
        .timeline-editor.showduino-ollie-ready .timeline-lane-hint{display:none !important}
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
        .timeline-editor.showduino-ollie-ready.sd-advanced .sd-overflow-source{display:none !important}

        .timeline-editor.showduino-ollie-ready .tl-toolbar{
          flex:0 0 36px !important;
          min-height:36px !important;
          max-height:36px !important;
          padding:3px 8px !important;
          gap:4px !important;
          overflow:visible !important;
          flex-wrap:nowrap !important;
          align-items:center !important;
          background:transparent !important;
          border-bottom:1px solid #1e2c34 !important;
          box-sizing:border-box
        }
        .timeline-editor.showduino-ollie-ready .tl-toolbar button{
          min-height:26px !important;height:26px !important;
          padding:3px 8px !important;border-radius:6px !important;
          border-color:transparent !important;background:transparent !important
        }
        .timeline-editor.showduino-ollie-ready .tl-toolbar button:hover,
        .timeline-editor.showduino-ollie-ready .tl-toolbar button:focus-visible{
          background:rgba(0,255,200,.08) !important;border-color:transparent !important
        }
        .timeline-editor.showduino-ollie-ready #tl-play-btn{
          color:#00ffc8 !important;font-weight:800
        }
        .timeline-editor.showduino-ollie-ready #tl-timecode{
          font-size:12px !important;line-height:26px !important;
          background:transparent !important;border:0 !important;padding:0 6px !important
        }

        .sd-overflow-menu .sd-track-extra{
          display:block !important;width:100%;min-height:32px !important;
          margin:0;padding:6px 8px !important;border:0 !important;border-radius:5px;
          background:transparent !important;color:#d5dee2 !important;text-align:left
        }
        .sd-overflow-menu[hidden]{display:none !important}
        .sd-empty-show{
          position:absolute;left:50%;top:48px;z-index:160;
          width:min(420px,calc(100% - 60px));transform:translateX(-50%);
          padding:16px;border:0;border-radius:12px;
          background:rgba(12,20,24,.92);
          text-align:center;font-family:Inter,system-ui,sans-serif
        }
        .sd-empty-show strong{display:block;color:#eaf3f5;font-size:15px}
        .sd-empty-show p{
          margin:7px auto 0;max-width:340px;color:#7c919a;font-size:11px;line-height:1.5
        }
      }

      @media (min-width:761px) and (max-width:1180px){
        .showduino-ollie-cue{padding:0 6px !important}
        .showduino-ollie-copy b{font-size:11px}
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

  function syncBuildShowClass() {
    const on = Boolean(document.querySelector('.workspace .timeline-editor'));
    document.body.classList.toggle('studio-build-show', on);
  }

  function closeAllMenus() {
    document.querySelectorAll('.sd-overflow-menu, #studio-header-menu').forEach((menu) => {
      menu.hidden = true;
    });
    document.getElementById('studio-header-more')?.setAttribute('aria-expanded', 'false');
  }

  function moreWrap(label) {
    const wrap = document.createElement('div');
    wrap.className = 'sd-action-more';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sd-more-btn';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.title = label;
    button.textContent = '•••';
    const menu = document.createElement('div');
    menu.className = 'sd-overflow-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = menu.hidden;
      closeAllMenus();
      menu.hidden = !open;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    wrap.append(button, menu);
    return wrap;
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
    button.setAttribute('aria-label', `Add ${cue.name}`);
    button.title = `Add ${cue.name}. Drag onto the timeline, or click to add at the playhead`;
    button.innerHTML =
      `<span class="showduino-ollie-icon">${cue.icon}</span>` +
      `<span class="showduino-ollie-copy"><b>+ ${cue.bar}</b><small>${cue.hint}</small></span>`;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // The timeline DOM can be rebuilt when panels/projects change. Always
      // resolve the live editor instead of relying only on the instance that
      // originally created this shelf.
      addCue(window.timelineEditor || editor, cue);
    });
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
    shelf.setAttribute('aria-label', 'Add action');
    shelf.innerHTML =
      '<div class="showduino-ollie-head">' +
        '<div><strong>Add action</strong><span>Drag or click to add at the playhead.</span></div>' +
      '</div>';

    const grid = document.createElement('div');
    grid.className = 'showduino-ollie-grid';
    CUES.forEach((cue) => grid.appendChild(cueButton(editor, cue)));
    shelf.appendChild(grid);

    const advancedWrap = moreWrap('More authoring tools');
    advancedWrap.className = 'sd-action-more';
    const menu = advancedWrap.querySelector('.sd-overflow-menu');
    const advanced = document.createElement('button');
    advanced.type = 'button';
    advanced.className = 'sd-overflow-item';
    advanced.textContent = 'Advanced tools';
    advanced.addEventListener('click', () => {
      const on = editor._el.classList.toggle('sd-advanced');
      advanced.textContent = on ? 'Simple view' : 'Advanced tools';
      closeAllMenus();
    });
    menu.appendChild(advanced);
    shelf.appendChild(advancedWrap);

    const foot = document.createElement('div');
    foot.className = 'showduino-ollie-foot';
    foot.textContent =
      'Start with the effect. Showduino keeps the relay / MOSFET / hardware detail underneath.';
    shelf.appendChild(foot);
    return shelf;
  }

  function syncPlayPauseButton(editor) {
    const button = editor._el?.querySelector('#tl-play-btn');
    if (!button) return;
    const playing = Boolean(editor._playing);
    button.textContent = playing ? '❚❚ Pause' : '▶ Play';
    button.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
    button.title = playing ? 'Pause preview' : 'Play preview';
  }

  function wirePlayPause(editor) {
    const button = editor._el?.querySelector('#tl-play-btn');
    if (!button || button.dataset.sdTogglePlay) return;
    button.dataset.sdTogglePlay = '1';
    button.addEventListener('click', (event) => {
      if (!editor._playing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.pause();
    }, true);
  }

  function simplifyToolbar(editor) {
    const toolbar = editor._el?.querySelector('.tl-toolbar');
    if (!toolbar) return;

    Array.from(toolbar.children).forEach((child) => {
      const text = child.textContent?.trim() || '';
      if (text.startsWith('Add Track:') || text.startsWith('Zoom:')) {
        child.classList.add('sd-advanced-only', 'sd-overflow-source', 'sd-overflow-group');
      }
    });

    toolbar.querySelectorAll('button').forEach((button) => {
      const text = button.textContent.trim();
      if (text === '⏸ Pause') {
        button.classList.add('sd-hidden-transport');
        button.setAttribute('aria-hidden', 'true');
        button.tabIndex = -1;
      }
      if (/^(🔍\+|🔍-|Fit|⋮ Grid:|📌 Marker|💾 Save|📂 Open|⬇ Export|⬆ Import|＋ New)/.test(text)) {
        button.classList.add('sd-advanced-only', 'sd-overflow-source');
      }
      if (/^(⏮ Rewind|🔁 Loop|✓ Check Show)/.test(text) || button.classList.contains('sth-check-show')) {
        button.classList.add('sd-overflow-source');
      }
    });

    toolbar.querySelector('.daw-shortcuts')?.classList.add('sd-advanced-only');
    wirePlayPause(editor);
    syncPlayPauseButton(editor);
    ensureTransportOverflow(toolbar);
  }

  function ensureTransportOverflow(toolbar) {
    let wrap = toolbar.querySelector('.sd-transport-more');
    if (!wrap) {
      wrap = moreWrap('More timeline tools');
      wrap.className = 'sd-transport-more';
      const timecode = toolbar.querySelector('#tl-timecode');
      if (timecode) toolbar.insertBefore(wrap, timecode);
      else toolbar.appendChild(wrap);
    }

    const menu = wrap.querySelector('.sd-overflow-menu');
    menu.innerHTML = '';
    const seen = new Set();
    toolbar.querySelectorAll('.sd-overflow-source').forEach((source) => {
      const buttons = source.classList.contains('sd-overflow-group')
        ? [...source.querySelectorAll('button')]
        : (source.matches('button') ? [source] : []);
      buttons.forEach((button) => {
        if (seen.has(button) || button.closest('.sd-overflow-menu')) return;
        seen.add(button);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'sd-overflow-item';
        item.setAttribute('role', 'menuitem');
        item.textContent = button.textContent.trim() || button.title || 'Tool';
        item.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          // Run the canonical timeline control. Close after dispatch so a
          // document-level click handler cannot tear the menu down first.
          button.click();
          closeAllMenus();
        });
        menu.appendChild(item);
      });
    });
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

    editor._el?.querySelectorAll('.tl-track-header').forEach((trackHeader) => {
      const buttons = [...trackHeader.querySelectorAll('button')];
      buttons.forEach((button) => {
        if (button.title && !button.getAttribute('aria-label')) {
          button.setAttribute('aria-label', button.title);
        }
      });
      if (trackHeader.querySelector('.sd-track-more')) return;
      const extras = buttons.filter((button) => /Duplicate|Delete/i.test(button.title || ''));
      if (!extras.length) return;
      const wrap = moreWrap('More track actions');
      wrap.className = 'sd-track-more';
      const menu = wrap.querySelector('.sd-overflow-menu');
      extras.forEach((button) => {
        button.classList.add('sd-track-extra');
        menu.appendChild(button);
      });
      buttons[0]?.parentElement?.appendChild(wrap);
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
    syncBuildShowClass();
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
    requestAnimationFrame(() => {
      if (editor?._el) simplifyToolbar(editor);
    });
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

    ['play', 'pause', 'stop'].forEach((name) => {
      const original = proto[name];
      if (typeof original !== 'function') return;
      proto[name] = function () {
        const result = original.apply(this, arguments);
        syncPlayPauseButton(this);
        return result;
      };
    });

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

  function bindChrome() {
    const more = document.getElementById('studio-header-more');
    const menu = document.getElementById('studio-header-menu');
    if (more && menu && !more.dataset.sdBound) {
      more.dataset.sdBound = '1';
      // Keep menu interaction inside the menu. Some Studio layers install
      // document-level dismissal handlers; without this, the menu can be
      // removed before its button click reaches the real action.
      menu.addEventListener('pointerdown', (event) => event.stopPropagation());
      menu.addEventListener('click', (event) => event.stopPropagation());
      more.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = menu.hidden;
        closeAllMenus();
        menu.hidden = !open;
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.sd-overflow-menu, .sd-more-btn, .studio-header-overflow')) return;
      closeAllMenus();
    }, false);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllMenus();
    });

    const workspace = document.querySelector('.workspace');
    if (workspace && !workspace.dataset.sdBuildShowBound) {
      workspace.dataset.sdBuildShowBound = '1';
      const observer = new MutationObserver(syncBuildShowClass);
      observer.observe(workspace, { childList: true, subtree: false });
    }
    syncBuildShowClass();
  }

  function boot() {
    injectStyles();
    renameNavigation();
    patchTimeline();
    bindDragGuard();
    bindChrome();

    setTimeout(() => {
      renameNavigation();
      patchTimeline();
      bindChrome();
      if (window.timelineEditor) enhance(window.timelineEditor);
    }, 250);

    window.addEventListener('resize', () => {
      syncBuildShowClass();
      if (window.timelineEditor) enhance(window.timelineEditor);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
