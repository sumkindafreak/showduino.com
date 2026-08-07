/* Showduino Studio 3 — mobile companion controls.
 * This does not replace the timeline engine. It gives the existing editor a
 * touch-first shell: off-canvas menu, library drawer, inspector drawer and a
 * large bottom transport bar.
 */
(function () {
  'use strict';

  const PHONE_QUERY = '(max-width: 600px)';
  let bar = null;

  function isPhone() {
    return window.matchMedia(PHONE_QUERY).matches;
  }

  function closeDrawers() {
    document.body.classList.remove('studio-menu-open', 'studio-library-open', 'studio-inspector-open');
    updateActiveButtons();
  }

  function toggleBodyClass(className) {
    const opening = !document.body.classList.contains(className);
    closeDrawers();
    if (opening) document.body.classList.add(className);
    updateActiveButtons();
  }

  function timeline() {
    return window.timelineEditor || null;
  }

  function playPause() {
    const editor = timeline();
    if (!editor) return;
    if (editor._playing && typeof editor.pause === 'function') editor.pause();
    else if (typeof editor.play === 'function') editor.play();
    updatePlayButton();
  }

  function updatePlayButton() {
    const button = bar?.querySelector('.mobile-play');
    if (!button) return;
    const playing = Boolean(timeline()?._playing);
    button.querySelector('.mobile-icon').textContent = playing ? 'Ⅱ' : '▶';
    button.querySelector('.mobile-label').textContent = playing ? 'Pause' : 'Play';
  }

  function updateActiveButtons() {
    if (!bar) return;
    const mappings = {
      '.mobile-menu': 'studio-menu-open',
      '.mobile-library': 'studio-library-open',
      '.mobile-inspector': 'studio-inspector-open'
    };
    Object.entries(mappings).forEach(([selector, className]) => {
      bar.querySelector(selector)?.classList.toggle('active', document.body.classList.contains(className));
    });
  }

  function button(className, icon, label, handler) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.innerHTML = `<span class="mobile-icon" aria-hidden="true">${icon}</span><span class="mobile-label">${label}</span>`;
    el.setAttribute('aria-label', label);
    el.addEventListener('click', handler);
    return el;
  }

  function buildMobileBar() {
    if (bar || !isPhone()) return;
    bar = document.createElement('nav');
    bar.className = 'studio-mobile-bar';
    bar.setAttribute('aria-label', 'Studio mobile controls');

    bar.appendChild(button('mobile-menu', '☰', 'Menu', () => toggleBodyClass('studio-menu-open')));
    bar.appendChild(button('mobile-library', '＋', 'Library', () => toggleBodyClass('studio-library-open')));
    bar.appendChild(button('mobile-play', '▶', 'Play', playPause));
    bar.appendChild(button('mobile-inspector', '⌁', 'Inspector', () => toggleBodyClass('studio-inspector-open')));
    bar.appendChild(button('mobile-save', '✓', 'Save', async () => {
      try {
        await window.ShowduinoProjects?.saveCurrentProject?.({ cloud: true });
        const save = bar.querySelector('.mobile-save .mobile-label');
        if (save) {
          save.textContent = 'Saved';
          window.setTimeout(() => { save.textContent = 'Save'; }, 1200);
        }
      } catch (error) {
        window.alert(error.message || 'This show could not be saved.');
      }
    }));

    document.body.appendChild(bar);
    updatePlayButton();
  }

  function destroyMobileBar() {
    if (!bar) return;
    bar.remove();
    bar = null;
    closeDrawers();
  }

  function syncForViewport() {
    if (isPhone()) buildMobileBar();
    else destroyMobileBar();
  }

  function interceptSidebarNavigation() {
    document.addEventListener('click', (event) => {
      const item = event.target.closest('.sidebar-nav li');
      if (item && isPhone()) {
        window.setTimeout(() => {
          document.body.classList.remove('studio-menu-open');
          updateActiveButtons();
        }, 0);
      }

      // Tapping the dark canvas outside a drawer closes it.
      if (isPhone() && event.target.classList.contains('workspace')) closeDrawers();
    });
  }

  function watchTimelineState() {
    window.setInterval(() => {
      if (isPhone()) updatePlayButton();
    }, 350);
  }

  function initialise() {
    document.documentElement.dataset.studioVersion = '3';
    syncForViewport();
    interceptSidebarNavigation();
    watchTimelineState();

    const media = window.matchMedia(PHONE_QUERY);
    if (typeof media.addEventListener === 'function') media.addEventListener('change', syncForViewport);
    else if (typeof media.addListener === 'function') media.addListener(syncForViewport);

    window.addEventListener('orientationchange', () => window.setTimeout(syncForViewport, 150));
  }

  window.ShowduinoMobileStudio = Object.freeze({
    closeDrawers,
    isPhone
  });

  document.addEventListener('DOMContentLoaded', initialise);
})();
