// Mobile helper for Showduino Studio
// Handles off-canvas sidebar, touch interactions, and responsive behaviour

(function () {
  'use strict';

  // ── Sidebar drawer ──────────────────────────────────────────────

  function isMobile() {
    return window.innerWidth < 768;
  }

  function openSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerBtn');
    if (!sidebar) return;
    sidebar.classList.add('sidebar-open');
    if (overlay) {
      overlay.classList.add('active');
      overlay.setAttribute('aria-hidden', 'false');
    }
    if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden'; // prevent background scroll
  }

  function closeSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerBtn');
    if (!sidebar) return;
    sidebar.classList.remove('sidebar-open');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  // ── Initialisation ──────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    const hamburger = document.getElementById('hamburgerBtn');
    const closeBtn  = document.getElementById('sidebarCloseBtn');
    const overlay   = document.getElementById('sidebarOverlay');
    const navItems  = document.querySelectorAll('.sidebar-nav li');

    // Hamburger opens sidebar
    if (hamburger) {
      hamburger.addEventListener('click', function (e) {
        e.stopPropagation();
        openSidebar();
      });
    }

    // Close button in sidebar header
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeSidebar();
      });
    }

    // Overlay click closes sidebar
    if (overlay) {
      overlay.addEventListener('click', function () {
        closeSidebar();
      });
    }

    // Close sidebar when a nav item is clicked on mobile
    navItems.forEach(function (item) {
      item.addEventListener('click', function () {
        if (isMobile()) {
          closeSidebar();
        }
      });
    });

    // Keyboard: Escape key closes sidebar
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeSidebar();
      }
    });

    // On resize: if viewport grows to desktop size, reset sidebar state
    window.addEventListener('resize', function () {
      if (!isMobile()) {
        closeSidebar(); // clean up any mobile-only classes
        document.body.style.overflow = '';
      }
    });
  });

  // ── Inspector bottom-sheet toggle ──────────────────────────────
  // This is called by timeline.js when a clip is selected/deselected.

  window.mobileInspector = {
    open: function () {
      if (!isMobile()) return;
      var insp = document.querySelector('.tl-inspector');
      if (insp) insp.classList.add('inspector-open');
    },
    close: function () {
      var insp = document.querySelector('.tl-inspector');
      if (insp) insp.classList.remove('inspector-open');
    },
    isOpen: function () {
      var insp = document.querySelector('.tl-inspector');
      return insp ? insp.classList.contains('inspector-open') : false;
    }
  };

  // ── Expose helpers ──────────────────────────────────────────────
  window.openSidebar  = openSidebar;
  window.closeSidebar = closeSidebar;
}());
