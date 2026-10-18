/* Showduino public site — mobile menu button.
 * Adapted from old PR #12 (nav.js) for the current shared header
 * (.site-header > .site-nav). Progressive enhancement: without JavaScript the
 * menu stays the existing scrollable row. No inline scripts or handlers. */
(function () {
  'use strict';
  function init() {
    var header = document.querySelector('.site-header');
    var nav = header && header.querySelector('.site-nav');
    if (!nav || header.querySelector('.site-nav-toggle')) return;
    if (!nav.id) nav.id = 'site-nav';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'site-nav-toggle';
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    var bars = document.createElement('span');
    bars.className = 'site-nav-toggle-bars';
    bars.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'site-nav-toggle-label';
    label.textContent = 'Menu';
    toggle.append(bars, label);
    nav.parentNode.insertBefore(toggle, nav);
    document.documentElement.classList.add('has-site-nav-toggle');

    function setOpen(open, returnFocus) {
      header.classList.toggle('site-nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      label.textContent = open ? 'Close' : 'Menu';
      if (!open && returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true', false); });
    nav.addEventListener('click', function (event) { if (event.target.closest('a')) setOpen(false, false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('site-nav-open')) setOpen(false, true);
    });
    document.addEventListener('click', function (event) {
      if (header.classList.contains('site-nav-open') && !header.contains(event.target)) setOpen(false, false);
    });
    var wide = window.matchMedia('(min-width: 761px)');
    var onWide = function () { if (wide.matches) setOpen(false, false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
