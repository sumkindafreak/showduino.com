// Showduino Studio mobile interaction layer.
// Keeps the existing desktop editor intact while exposing phone-friendly controls.
(function () {
  'use strict';

  const MOBILE_BREAKPOINT = 768;
  const TRACK_TYPES = [
    { type: 'audio', icon: '🎵', label: 'Audio', detail: 'Music, ambience and sound cues' },
    { type: 'fx', icon: '✨', label: 'FX', detail: 'Reusable effects and compound actions' },
    { type: 'lighting', icon: '💡', label: 'Lighting', detail: 'Lighting scenes and fades' },
    { type: 'pixel', icon: '🌈', label: 'Pixel', detail: 'Addressable pixel effects' },
    { type: 'relay', icon: '⚡', label: 'Relay', detail: 'Timed relay and output actions' },
    { type: 'dmx', icon: '🎛', label: 'DMX', detail: 'DMX fixtures and channel scenes' },
    { type: 'prop', icon: '⚙️', label: 'Prop', detail: 'Show prop actions' },
    { type: 'trigger', icon: '🎯', label: 'Trigger', detail: 'External and logical triggers' }
  ];

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function getSidebar() {
    return document.getElementById('studio-sidebar');
  }

  function getOverlay() {
    return document.getElementById('mobile-sidebar-overlay');
  }

  function setSidebar(open) {
    const sidebar = getSidebar();
    const overlay = getOverlay();
    const menuButton = document.getElementById('mobile-menu-button');
    if (!sidebar) return;

    sidebar.classList.toggle('sidebar-open', open);
    sidebar.setAttribute('aria-hidden', open ? 'false' : String(isMobile()));
    overlay?.classList.toggle('active', open);
    overlay?.setAttribute('aria-hidden', open ? 'false' : 'true');
    menuButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('mobile-drawer-open', open);
  }

  function closeInspector() {
    document.querySelector('.tl-inspector')?.classList.remove('inspector-open');
    document.getElementById('mobile-inspector')?.classList.remove('active');
  }

  function openInspector() {
    const inspector = document.querySelector('.tl-inspector');
    if (!inspector) return;
    closeLibrary();
    closeTrackPicker();
    inspector.classList.add('inspector-open');
    document.getElementById('mobile-inspector')?.classList.add('active');
  }

  function closeLibrary() {
    const library = document.querySelector('.daw-library.mobile-library-open');
    if (!library) return;
    library.classList.remove('mobile-library-open');
    library.removeAttribute('style');
    document.getElementById('mobile-library')?.classList.remove('active');
  }

  function toggleLibrary() {
    const library = document.querySelector('.daw-library');
    if (!library) return;

    const opening = !library.classList.contains('mobile-library-open');
    closeInspector();
    closeTrackPicker();

    if (!opening) {
      closeLibrary();
      return;
    }

    library.classList.add('mobile-library-open');
    document.getElementById('mobile-library')?.classList.add('active');
    library.style.setProperty('display', 'block', 'important');
    library.style.position = 'fixed';
    library.style.left = '8px';
    library.style.right = '8px';
    library.style.bottom = '72px';
    library.style.zIndex = '1300';
    library.style.maxHeight = '68dvh';
    library.style.overflow = 'auto';
    library.style.border = '1px solid var(--daw-border, #394550)';
    library.style.borderRadius = '14px';
    library.style.boxShadow = '0 18px 45px rgba(0,0,0,.65)';
  }

  function ensureTrackPicker() {
    let sheet = document.getElementById('mobile-track-picker');
    if (sheet) return sheet;

    sheet = document.createElement('section');
    sheet.id = 'mobile-track-picker';
    sheet.className = 'mobile-track-picker';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.setAttribute('aria-label', 'Add track');

    sheet.innerHTML = `
      <div class="mobile-sheet-handle" aria-hidden="true"></div>
      <div class="mobile-sheet-heading">
        <div>
          <strong>Add a track</strong>
          <span>Choose what this timeline lane controls</span>
        </div>
        <button type="button" class="mobile-sheet-close" aria-label="Close track picker">✕</button>
      </div>
      <div class="mobile-track-grid">
        ${TRACK_TYPES.map((item) => `
          <button type="button" class="mobile-track-option" data-track-type="${item.type}">
            <span class="mobile-track-icon">${item.icon}</span>
            <span><strong>${item.label}</strong><small>${item.detail}</small></span>
          </button>
        `).join('')}
      </div>`;

    document.body.appendChild(sheet);
    sheet.querySelector('.mobile-sheet-close')?.addEventListener('click', closeTrackPicker);
    sheet.querySelectorAll('[data-track-type]').forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.dataset.trackType;
        if (window.timelineEditor && typeof window.timelineEditor.addTrack === 'function') {
          window.timelineEditor.addTrack(type);
          closeTrackPicker();
          announce(`${button.querySelector('strong')?.textContent || type} track added`);
        }
      });
    });
    return sheet;
  }

  function openTrackPicker() {
    closeInspector();
    closeLibrary();
    const sheet = ensureTrackPicker();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.getElementById('mobile-add-track')?.classList.add('active');
    sheet.querySelector('[data-track-type]')?.focus({ preventScroll: true });
  }

  function closeTrackPicker() {
    const sheet = document.getElementById('mobile-track-picker');
    sheet?.classList.remove('open');
    sheet?.setAttribute('aria-hidden', 'true');
    document.getElementById('mobile-add-track')?.classList.remove('active');
  }

  function openMore() {
    const toolbar = document.querySelector('.timeline-editor .tl-toolbar');
    if (!toolbar) return;
    closeInspector();
    closeLibrary();
    closeTrackPicker();
    toolbar.scrollTo({ left: toolbar.scrollWidth, behavior: 'smooth' });
  }

  function announce(message) {
    let region = document.getElementById('mobile-studio-announcer');
    if (!region) {
      region = document.createElement('div');
      region.id = 'mobile-studio-announcer';
      region.className = 'sr-only';
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    region.textContent = '';
    window.setTimeout(() => { region.textContent = message; }, 20);
  }

  function coordinateTimelineScroll() {
    const canvasScroll = document.querySelector('.tl-canvas-scroll');
    const trackList = document.querySelector('.tl-track-list');
    if (!canvasScroll || !trackList || canvasScroll.dataset.mobileSyncBound === 'true') return;

    canvasScroll.dataset.mobileSyncBound = 'true';
    let syncing = false;
    canvasScroll.addEventListener('scroll', () => {
      if (!isMobile() || syncing) return;
      syncing = true;
      trackList.scrollTop = canvasScroll.scrollTop;
      syncing = false;
    }, { passive: true });

    trackList.addEventListener('scroll', () => {
      if (!isMobile() || syncing) return;
      syncing = true;
      canvasScroll.scrollTop = trackList.scrollTop;
      syncing = false;
    }, { passive: true });
  }

  function observeTimeline() {
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;
    const observer = new MutationObserver(() => coordinateTimelineScroll());
    observer.observe(workspace, { childList: true, subtree: true });
    coordinateTimelineScroll();
  }

  function bindMobileControls() {
    document.getElementById('mobile-menu-button')?.addEventListener('click', () => setSidebar(true));
    document.getElementById('mobile-sidebar-close')?.addEventListener('click', () => setSidebar(false));
    getOverlay()?.addEventListener('click', () => setSidebar(false));

    document.querySelectorAll('.sidebar-nav li').forEach((item) => {
      item.addEventListener('click', () => {
        if (isMobile()) setSidebar(false);
      });
    });

    document.getElementById('mobile-add-track')?.addEventListener('click', openTrackPicker);
    document.getElementById('mobile-library')?.addEventListener('click', toggleLibrary);
    document.getElementById('mobile-inspector')?.addEventListener('click', () => {
      const inspector = document.querySelector('.tl-inspector');
      if (!inspector) return;
      inspector.classList.contains('inspector-open') ? closeInspector() : openInspector();
    });
    document.getElementById('mobile-more')?.addEventListener('click', openMore);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      setSidebar(false);
      closeInspector();
      closeLibrary();
      closeTrackPicker();
    });

    document.addEventListener('click', (event) => {
      if (!isMobile()) return;
      const clip = event.target.closest?.('.tl-clip');
      if (clip) window.setTimeout(openInspector, 0);
    });

    window.addEventListener('resize', () => {
      if (!isMobile()) {
        setSidebar(false);
        closeInspector();
        closeLibrary();
        closeTrackPicker();
      }
      coordinateTimelineScroll();
    });

    observeTimeline();
  }

  document.addEventListener('DOMContentLoaded', bindMobileControls);

  window.ShowduinoMobile = {
    openSidebar: () => setSidebar(true),
    closeSidebar: () => setSidebar(false),
    openInspector,
    closeInspector,
    openTrackPicker,
    closeTrackPicker,
    closeLibrary
  };
}());
