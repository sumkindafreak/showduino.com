/* Showduino Studio — pre-test UX hardening
 *
 * Small, low-risk editor improvements for hands-on tester sessions:
 * - visible desktop Undo / Redo and Check Show actions
 * - human-friendly mobile cue language
 * - mobile cue drag reordering without changing SHDO structure
 * - mobile Undo / Redo for cue edits
 *
 * This file never owns live runtime or safety. The ESP32-P4 remains authoritative.
 */
(function () {
  'use strict';

  const DESKTOP_QUERY = '(min-width: 761px)';
  const MAX_MOBILE_HISTORY = 20;
  const TIMELINE_PATCH_FLAG = '__showduinoTestingHardeningPatched';
  const STYLE_ID = 'showduino-testing-hardening-style';

  const FRIENDLY_TYPES = Object.freeze({
    audio: {
      oldName: 'Sound',
      name: 'Sound',
      subtitle: 'Scream, ambience, music or another audio file'
    },
    relay: {
      oldName: 'Relay',
      name: 'Prop / Switch',
      subtitle: 'Prop, solenoid or another switched device'
    },
    mosfet: {
      oldName: 'Powered output',
      name: 'Lighting',
      subtitle: 'Turn on, dim or pulse a powered light'
    },
    pixel: {
      oldName: 'Pixels',
      name: 'Pixels / LEDs',
      subtitle: 'Colour and animated LED effects'
    },
    trigger: {
      oldName: 'Trigger',
      name: 'Trigger',
      subtitle: 'Fire a logical event in the show'
    },
    fx: {
      oldName: 'Other FX',
      name: 'Other Effect',
      subtitle: 'Fog, air, motor, servo and more'
    }
  });

  const mobileUndo = [];
  const mobileRedo = [];
  let mobileDrag = null;
  let mobileObserver = null;

  function currentProject() {
    return window.state?.project || null;
  }

  function serialiseProject() {
    const project = currentProject();
    if (!project) return '';
    try { return JSON.stringify(project); }
    catch (_) { return ''; }
  }

  function pushMobileSnapshot() {
    const snapshot = serialiseProject();
    if (!snapshot) return;
    if (mobileUndo[mobileUndo.length - 1] === snapshot) return;
    mobileUndo.push(snapshot);
    if (mobileUndo.length > MAX_MOBILE_HISTORY) mobileUndo.shift();
    mobileRedo.length = 0;
    updateMobileHistoryButtons();
  }

  async function restoreMobileSnapshot(stackFrom, stackTo) {
    if (!stackFrom.length || !window.state) return;
    const current = serialiseProject();
    if (current) {
      stackTo.push(current);
      if (stackTo.length > MAX_MOBILE_HISTORY) stackTo.shift();
    }

    const snapshot = stackFrom.pop();
    try {
      window.state.project = JSON.parse(snapshot);
      if (window.SHDOModel?.migrate) {
        window.state.project = window.SHDOModel.migrate(window.state.project);
      }
      await window.ShowduinoProjects?.saveCurrentProject?.({ cloud: false });
      window.ShowduinoStudioV4?.refreshProjectStats?.();
      window.ShowduinoMobileStudio?.render?.();
    } catch (error) {
      console.warn('[Studio hardening] Could not restore mobile history', error);
    }
    updateMobileHistoryButtons();
  }

  function undoMobile() {
    return restoreMobileSnapshot(mobileUndo, mobileRedo);
  }

  function redoMobile() {
    return restoreMobileSnapshot(mobileRedo, mobileUndo);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width: 761px) {
        .sth-toolbar-actions {
          display:flex;
          align-items:center;
          gap:4px;
          flex:0 0 auto;
        }
        .sth-toolbar-actions .btn-toolbar {
          min-width:auto;
        }
        .sth-toolbar-actions .sth-check-show {
          border-color:rgba(0,255,200,.35) !important;
          color:#bfffee !important;
        }
      }

      @media (max-width: 760px) {
        #studio-mobile-app .sm-header {
          gap:.34rem;
        }
        #studio-mobile-app .sth-mobile-history {
          display:flex;
          align-items:center;
          gap:.22rem;
          margin-left:auto;
        }
        #studio-mobile-app .sth-mobile-history button {
          width:2rem;
          height:2rem;
          display:grid;
          place-items:center;
          padding:0;
          border:1px solid #263b44;
          border-radius:.55rem;
          background:#0c1519;
          color:#cfe0e5;
          font:800 1rem/1 system-ui,sans-serif;
        }
        #studio-mobile-app .sth-mobile-history button:disabled {
          opacity:.28;
        }
        #studio-mobile-app .sm-header-action {
          margin-left:0 !important;
        }
        #studio-mobile-app .sm-cue-row {
          position:relative;
          padding-left:2.35rem !important;
        }
        #studio-mobile-app .sth-reorder-handle {
          position:absolute;
          left:.45rem;
          top:50%;
          transform:translateY(-50%);
          width:1.45rem;
          height:2.35rem;
          display:grid;
          place-items:center;
          border:1px solid #263b44;
          border-radius:.45rem;
          background:#0b1418;
          color:#78909a;
          font:900 .9rem/1 system-ui,sans-serif;
          cursor:grab;
          touch-action:none;
          user-select:none;
          z-index:3;
        }
        #studio-mobile-app .sth-reorder-handle:active {
          cursor:grabbing;
        }
        #studio-mobile-app .sm-cue-row.sth-drag-source {
          opacity:.58;
        }
        #studio-mobile-app .sm-cue-row.sth-drag-target {
          outline:2px solid rgba(0,255,200,.65);
          outline-offset:2px;
        }
        #studio-mobile-app .sth-sequence-help {
          color:#6f858e;
          font-size:.54rem;
          letter-spacing:.03em;
          text-align:right;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function updateDesktopHistoryButtons(editor) {
    if (!editor?._el) return;
    const undo = editor._el.querySelector('[data-sth-undo]');
    const redo = editor._el.querySelector('[data-sth-redo]');
    if (undo) undo.disabled = !editor._undoStack?.length;
    if (redo) redo.disabled = !editor._redoStack?.length;
  }

  function openProjectCheck() {
    if (window.ShowduinoStudioV4?.openPanel) {
      window.ShowduinoStudioV4.openPanel('diagnostics');
      return;
    }
    document.querySelector('.sidebar-nav li[data-panel="diagnostics"]')?.click();
  }

  function enhanceDesktopToolbar(editor) {
    if (!window.matchMedia(DESKTOP_QUERY).matches || !editor?._el) return;
    const toolbar = editor._el.querySelector('.tl-toolbar');
    if (!toolbar) return;

    let group = toolbar.querySelector('.sth-toolbar-actions');
    if (!group) {
      group = document.createElement('div');
      group.className = 'sth-toolbar-actions';

      const undo = editor._toolbarBtn
        ? editor._toolbarBtn('↶ Undo', () => { editor._undo?.(); requestAnimationFrame(() => updateDesktopHistoryButtons(editor)); })
        : document.createElement('button');
      undo.type = 'button';
      undo.dataset.sthUndo = '1';
      undo.title = 'Undo the last timeline edit (Ctrl+Z)';
      if (!undo.classList.contains('btn-toolbar')) undo.classList.add('btn-toolbar');
      if (!undo.textContent) undo.textContent = '↶ Undo';

      const redo = editor._toolbarBtn
        ? editor._toolbarBtn('↷ Redo', () => { editor._redo?.(); requestAnimationFrame(() => updateDesktopHistoryButtons(editor)); })
        : document.createElement('button');
      redo.type = 'button';
      redo.dataset.sthRedo = '1';
      redo.title = 'Redo the last timeline edit (Ctrl+Y)';
      if (!redo.classList.contains('btn-toolbar')) redo.classList.add('btn-toolbar');
      if (!redo.textContent) redo.textContent = '↷ Redo';

      const check = editor._toolbarBtn
        ? editor._toolbarBtn('✓ Check Show', openProjectCheck)
        : document.createElement('button');
      check.type = 'button';
      check.classList.add('btn-toolbar', 'sth-check-show');
      check.title = 'Check routing, files and cue readiness before testing';
      if (!check.textContent) check.textContent = '✓ Check Show';

      group.append(undo, redo, check);
      const timecode = toolbar.querySelector('#tl-timecode');
      if (timecode) toolbar.insertBefore(group, timecode);
      else toolbar.appendChild(group);
    }

    updateDesktopHistoryButtons(editor);
  }

  function patchTimeline() {
    if (typeof window.TimelineEditor === 'undefined') return;
    const proto = window.TimelineEditor.prototype;
    if (proto[TIMELINE_PATCH_FLAG]) return;
    proto[TIMELINE_PATCH_FLAG] = true;

    ['_render', '_renderTracks', '_pushUndo', '_undo', '_redo'].forEach((name) => {
      if (typeof proto[name] !== 'function') return;
      const original = proto[name];
      proto[name] = function () {
        const result = original.apply(this, arguments);
        requestAnimationFrame(() => enhanceDesktopToolbar(this));
        return result;
      };
    });

    if (window.timelineEditor) enhanceDesktopToolbar(window.timelineEditor);
  }

  function replaceExactText(element, from, to) {
    if (element && element.textContent?.trim() === from) element.textContent = to;
  }

  function decorateMobileLanguage(root) {
    Object.entries(FRIENDLY_TYPES).forEach(([type, meta]) => {
      const button = root.querySelector(`[data-sm-add="${type}"]`);
      if (button) {
        const strong = button.querySelector('strong');
        const subtitle = button.querySelector('span');
        if (strong) strong.textContent = meta.name;
        if (subtitle) subtitle.textContent = meta.subtitle;
      }
    });

    root.querySelectorAll('.sm-cue-row[data-sm-edit]').forEach((row) => {
      const name = row.querySelector('.sm-cue-name');
      Object.values(FRIENDLY_TYPES).forEach((meta) => replaceExactText(name, meta.oldName, meta.name));
    });

    const label = root.querySelector('#sm-edit-label');
    if (label) {
      Object.values(FRIENDLY_TYPES).forEach((meta) => {
        if (label.value === meta.oldName && meta.name !== meta.oldName) label.value = meta.name;
      });
    }

    root.querySelectorAll('.sm-form-section h3').forEach((heading) => {
      replaceExactText(heading, 'Relay', 'Prop / Switch');
      replaceExactText(heading, 'Powered output', 'Lighting');
      replaceExactText(heading, 'Pixels', 'Pixels / LEDs');
      replaceExactText(heading, 'Other FX', 'Other Effect');
    });

    const addCueHint = root.querySelector('[data-sm-picker-open] span');
    if (addCueHint) addCueHint.textContent = 'Sound, lighting, prop, pixels or trigger';
  }

  function updateMobileHistoryButtons() {
    const root = document.getElementById('studio-mobile-app');
    if (!root) return;
    const undo = root.querySelector('[data-sth-mobile-undo]');
    const redo = root.querySelector('[data-sth-mobile-redo]');
    if (undo) undo.disabled = mobileUndo.length === 0;
    if (redo) redo.disabled = mobileRedo.length === 0;
  }

  function decorateMobileHeader(root) {
    const header = root.querySelector('.sm-header');
    if (!header) return;

    let controls = header.querySelector('.sth-mobile-history');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'sth-mobile-history';
      controls.innerHTML =
        '<button type="button" data-sth-mobile-undo aria-label="Undo last cue edit" title="Undo">↶</button>' +
        '<button type="button" data-sth-mobile-redo aria-label="Redo last cue edit" title="Redo">↷</button>';
      const preview = header.querySelector('[data-sm-header-preview]');
      if (preview) header.insertBefore(controls, preview);
      else header.appendChild(controls);
    }
    updateMobileHistoryButtons();
  }

  function decorateMobileRows(root) {
    const head = root.querySelector('.sm-section-head');
    if (head?.querySelector('h2')?.textContent?.trim() === 'Show sequence') {
      const hint = head.querySelector('span');
      if (hint) {
        hint.textContent = 'TAP TO EDIT · DRAG ↕ TO REORDER';
        hint.classList.add('sth-sequence-help');
      }
    }

    root.querySelectorAll('.sm-cue-row[data-sm-edit]').forEach((row) => {
      if (row.querySelector('.sth-reorder-handle')) return;
      const handle = document.createElement('span');
      handle.className = 'sth-reorder-handle';
      handle.dataset.sthReorder = row.dataset.smEdit || '';
      handle.title = 'Drag to move this cue earlier or later';
      handle.setAttribute('aria-hidden', 'true');
      handle.textContent = '↕';
      row.prepend(handle);
    });
  }

  function decorateMobile() {
    const root = document.getElementById('studio-mobile-app');
    if (!root || !document.body.classList.contains('studio-mobile-native')) return;
    decorateMobileLanguage(root);
    decorateMobileHeader(root);
    decorateMobileRows(root);
  }

  function clearMobileDrag() {
    document.querySelectorAll('#studio-mobile-app .sth-drag-source, #studio-mobile-app .sth-drag-target')
      .forEach((element) => element.classList.remove('sth-drag-source', 'sth-drag-target'));
    mobileDrag = null;
  }

  function orderedProjectClips() {
    const clips = currentProject()?.clips || [];
    return clips.slice().sort((a, b) =>
      Number(a.startMs || 0) - Number(b.startMs || 0) ||
      Number(a.durationMs || 0) - Number(b.durationMs || 0) ||
      String(a.id || '').localeCompare(String(b.id || ''))
    );
  }

  async function reorderMobileCue(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const ordered = orderedProjectClips();
    const sourceIndex = ordered.findIndex((clip) => clip.id === sourceId);
    const targetIndex = ordered.findIndex((clip) => clip.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    pushMobileSnapshot();
    const timeSlots = ordered.map((clip) => Math.max(0, Number(clip.startMs || 0)));
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    ordered.forEach((clip, index) => { clip.startMs = timeSlots[index]; });

    const project = currentProject();
    if (project?.project) project.project.updatedAt = new Date().toISOString();

    try { await window.ShowduinoProjects?.saveCurrentProject?.({ cloud: false }); }
    catch (error) { console.warn('[Studio hardening] Reorder save failed', error); }

    window.ShowduinoStudioV4?.refreshProjectStats?.();
    window.ShowduinoMobileStudio?.render?.();
  }

  function bindMobileEvents() {
    document.addEventListener('click', (event) => {
      const undo = event.target.closest?.('[data-sth-mobile-undo]');
      if (undo) {
        event.preventDefault();
        event.stopImmediatePropagation();
        undoMobile();
        return;
      }

      const redo = event.target.closest?.('[data-sth-mobile-redo]');
      if (redo) {
        event.preventDefault();
        event.stopImmediatePropagation();
        redoMobile();
        return;
      }

      const handle = event.target.closest?.('.sth-reorder-handle');
      if (handle) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const mutating = event.target.closest?.(
        '#studio-mobile-app [data-sm-editor-save], ' +
        '#studio-mobile-app [data-sm-editor-delete], ' +
        '#studio-mobile-app [data-sm-editor-duplicate], ' +
        '#studio-mobile-app [data-sm-rename], ' +
        '#studio-mobile-app [data-sm-import]'
      );
      if (mutating) pushMobileSnapshot();
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest?.('.sth-reorder-handle');
      if (!handle) return;
      const row = handle.closest('.sm-cue-row[data-sm-edit]');
      if (!row) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      mobileDrag = {
        pointerId: event.pointerId,
        sourceId: row.dataset.smEdit,
        targetId: row.dataset.smEdit,
        sourceRow: row,
        targetRow: row
      };
      row.classList.add('sth-drag-source');
      try { handle.setPointerCapture?.(event.pointerId); } catch (_) {}
    }, true);

    document.addEventListener('pointermove', (event) => {
      if (!mobileDrag || event.pointerId !== mobileDrag.pointerId) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.sm-cue-row[data-sm-edit]');
      if (!target) return;

      if (mobileDrag.targetRow && mobileDrag.targetRow !== mobileDrag.sourceRow) {
        mobileDrag.targetRow.classList.remove('sth-drag-target');
      }
      mobileDrag.targetRow = target;
      mobileDrag.targetId = target.dataset.smEdit;
      if (target !== mobileDrag.sourceRow) target.classList.add('sth-drag-target');
    }, true);

    const finishDrag = (event) => {
      if (!mobileDrag || event.pointerId !== mobileDrag.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const sourceId = mobileDrag.sourceId;
      const targetId = mobileDrag.targetId;
      clearMobileDrag();
      if (sourceId && targetId && sourceId !== targetId) reorderMobileCue(sourceId, targetId);
    };

    document.addEventListener('pointerup', finishDrag, true);
    document.addEventListener('pointercancel', (event) => {
      if (mobileDrag && event.pointerId === mobileDrag.pointerId) clearMobileDrag();
    }, true);
  }

  function observeMobile() {
    const start = () => {
      const root = document.getElementById('studio-mobile-app');
      if (!root) {
        window.setTimeout(start, 120);
        return;
      }
      if (!mobileObserver) {
        mobileObserver = new MutationObserver(() => window.requestAnimationFrame(decorateMobile));
        mobileObserver.observe(root, { childList: true, subtree: true });
      }
      decorateMobile();
    };
    start();
  }

  function boot() {
    injectStyles();
    patchTimeline();
    bindMobileEvents();
    observeMobile();

    window.setTimeout(() => {
      patchTimeline();
      if (window.timelineEditor) enhanceDesktopToolbar(window.timelineEditor);
      decorateMobile();
    }, 250);

    window.addEventListener('resize', () => {
      if (window.timelineEditor) enhanceDesktopToolbar(window.timelineEditor);
      decorateMobile();
    });
  }

  window.ShowduinoTestingHardening = Object.freeze({
    undoMobile,
    redoMobile,
    reorderMobileCue,
    decorateMobile,
    enhanceDesktopToolbar
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
