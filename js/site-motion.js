(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animeApi = window.anime || null;

  function markVisible(element) {
    if (!element) return;
    element.classList.add('is-visible');
  }

  function buildPixelPreviews() {
    document.querySelectorAll('[data-pixel-preview]').forEach((strip) => {
      if (strip.children.length) return;
      const mode = strip.dataset.pixelPreview;
      const count = Number(strip.dataset.pixelCount || 30);

      for (let index = 0; index < count; index += 1) {
        const pixel = document.createElement('span');
        pixel.className = 'pixel';

        if (mode === 'show' && index % 10 === 0) pixel.classList.add('marker');
        if (mode === 'emergency') pixel.classList.add('emergency');

        strip.appendChild(pixel);
      }
    });
  }

  function revealWithoutAnimation() {
    document.querySelectorAll('.reveal').forEach(markVisible);
  }

  function animateHero() {
    if (!animeApi?.animate || reducedMotion) return;
    const { animate, stagger } = animeApi;

    const heroItems = document.querySelectorAll('.hero-copy > *');
    if (heroItems.length) {
      animate(heroItems, {
        opacity: [0, 1],
        y: [24, 0],
        delay: stagger(90),
        duration: 700,
        ease: 'out(3)'
      });
    }

    const consoleElement = document.querySelector('.hero-console');
    if (consoleElement) {
      animate(consoleElement, {
        opacity: [0, 1],
        scale: [.965, 1],
        y: [18, 0],
        duration: 850,
        delay: 260,
        ease: 'out(4)'
      });
    }

    const consoleRows = document.querySelectorAll('.console-row');
    if (consoleRows.length) {
      animate(consoleRows, {
        opacity: [0, 1],
        x: [14, 0],
        delay: stagger(85, { start: 520 }),
        duration: 520,
        ease: 'out(3)'
      });
    }
  }

  function animateArchitecture() {
    if (!animeApi?.animate || reducedMotion) return;
    const { animate, stagger } = animeApi;
    const nodes = document.querySelectorAll('.architecture-node');
    if (!nodes.length) return;

    animate(nodes, {
      opacity: [0, 1],
      y: [20, 0],
      delay: stagger(110),
      duration: 650,
      ease: 'out(3)'
    });
  }

  function animatePixelPreviews() {
    if (!animeApi?.animate || reducedMotion) return;
    const { animate, stagger } = animeApi;

    document.querySelectorAll('[data-pixel-preview="show"] .pixel').forEach((pixel, index) => {
      if (index % 10 === 0) return;
      pixel.style.opacity = '.42';
    });

    const showPixels = document.querySelectorAll('[data-pixel-preview="show"] .pixel');
    if (showPixels.length) {
      animate(showPixels, {
        scale: [1, 1.18, 1],
        opacity: [.42, 1, .42],
        delay: stagger(45),
        duration: 780,
        loop: true,
        ease: 'inOut(2)'
      });
    }

    const emergencyPixels = document.querySelectorAll('[data-pixel-preview="emergency"] .pixel');
    if (emergencyPixels.length) {
      animate(emergencyPixels, {
        opacity: [.7, 1],
        scale: [.94, 1.04],
        duration: 700,
        alternate: true,
        loop: true,
        ease: 'inOut(2)'
      });
    }
  }

  function installScrollReveal() {
    const revealItems = [...document.querySelectorAll('.reveal')];
    if (!revealItems.length) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealItems.forEach(markVisible);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        markVisible(element);

        if (animeApi?.animate) {
          animeApi.animate(element, {
            opacity: [0, 1],
            y: [18, 0],
            duration: 620,
            ease: 'out(3)'
          });
        }
        observer.unobserve(element);
      });
    }, { threshold: .14, rootMargin: '0px 0px -30px 0px' });

    revealItems.forEach((element) => observer.observe(element));
  }

  function addConsoleShimmer() {
    if (!animeApi?.animate || reducedMotion) return;
    const consoles = document.querySelectorAll('.hero-console, .system-console');
    if (!consoles.length) return;

    consoles.forEach((consoleElement) => {
      consoleElement.addEventListener('pointerenter', () => {
        animeApi.animate(consoleElement, {
          scale: [1, 1.008],
          duration: 280,
          ease: 'out(2)'
        });
      });
      consoleElement.addEventListener('pointerleave', () => {
        animeApi.animate(consoleElement, {
          scale: [1.008, 1],
          duration: 320,
          ease: 'out(2)'
        });
      });
    });
  }

  function boot() {
    buildPixelPreviews();

    if (reducedMotion) {
      revealWithoutAnimation();
      return;
    }

    animateHero();
    animateArchitecture();
    animatePixelPreviews();
    installScrollReveal();
    addConsoleShimmer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
