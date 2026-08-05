// Showduino Studio mobile interaction layer.
// Keeps the existing desktop editor intact while exposing phone-friendly drawers.
(function () {
  'use strict';

  const MOBILE_BREAKPOINT = 768;

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
    const inspector = document.querySelector('.tl-inspector');
    inspector?.classList.remove('inspector-open');
  }

  function openInspector() {
    const inspector = document.querySelector('.tl-inspector');
    if (!inspector) return;
    inspector.classList.add('inspector-open');
  }

  function toggleLibrary() {
    const library = document.querySelector('.daw-library');
    if (!library) return;

    // On mobile the library is temporarily promoted to an overlay panel.
    const isOpen = library.classList.toggle('mobile-library-open');
    if (isOpen) {
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
    } else {
      library.removeAttribute('style');
    }
  }

  function addTrack() {
    // Reuse the existing first visible Add Track control rather than duplicate editor logic.
    const button = Array.from(document.querySelectorAll('.timeline-editor button')).find((candidate) =>
      /add\s*track/i.test(candidate.textContent || '')
    );
    button?.click();
  }

  function openMore() {
    // The toolbar remains horizontally scrollable. Move it to the end to reveal secondary tools.
    const toolbar = document.querySelector('.timeline-editor .tl-toolbar');
    if (!toolbar) return;
    toolbar.scrollTo({ left: toolbar.scrollWidth, behavior: 'smooth' });
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

    document.getElementById('mobile-add-track')?.addEventListener('click', addTrack);
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
    });

    document.addEventListener('click', (event) => {
      if (!isMobile()) return;
      const clip = event.target.closest?.('.tl-clip');
      if (clip) {
        window.setTimeout(openInspector, 0);
      }
    });

    window.addEventListener('resize', () => {
      if (!isMobile()) {
        setSidebar(false);
        closeInspector();
        const library = document.querySelector('.daw-library.mobile-library-open');
        if (library) {
          library.classList.remove('mobile-library-open');
          library.removeAttribute('style');
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', bindMobileControls);

  window.ShowduinoMobile = {
    openSidebar: () => setSidebar(true),
    closeSidebar: () => setSidebar(false),
    openInspector,
    closeInspector
  };
}());
