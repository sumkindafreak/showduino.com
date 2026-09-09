/* Showduino Studio — creator bootstrap loaded after the existing application. */
(function () {
  'use strict';

  const PUBLIC_HOST = 'show-duino.com';
  const WRONG_PUBLIC_HOST = 'showduino.com';

  function correctPublicLink(anchor) {
    if (!anchor || !anchor.getAttribute) return;
    const href = anchor.getAttribute('href');
    if (!href || !/^https?:\/\//i.test(href)) return;

    try {
      const url = new URL(href, window.location.href);
      if (url.hostname !== WRONG_PUBLIC_HOST && !url.hostname.endsWith(`.${WRONG_PUBLIC_HOST}`)) return;
      const prefix = url.hostname.slice(0, -(WRONG_PUBLIC_HOST.length));
      url.hostname = `${prefix}${PUBLIC_HOST}`;
      anchor.setAttribute('href', url.toString());
      if (String(anchor.textContent || '').trim() === WRONG_PUBLIC_HOST) {
        anchor.textContent = PUBLIC_HOST;
      }
    } catch (_) {
      // Invalid/non-navigation hrefs are ignored.
    }
  }

  function enforcePublicDomain(root) {
    if (!root) return;
    if (root.matches?.('a[href]')) correctPublicLink(root);
    root.querySelectorAll?.('a[href]').forEach(correctPublicLink);
  }

  function installPublicDomainGuard() {
    enforcePublicDomain(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node?.nodeType === 1) enforcePublicDomain(node);
        });
        if (mutation.type === 'attributes' && mutation.target?.nodeType === 1) {
          enforcePublicDomain(mutation.target);
        }
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
    window.ShowduinoPublicDomain = Object.freeze({
      host: PUBLIC_HOST,
      origin: `https://${PUBLIC_HOST}`,
      enforce: enforcePublicDomain
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    installPublicDomainGuard();
    const project = window.state?.project;
    if (project && window.ShowduinoPackage) {
      window.ShowduinoPackage.ensurePackageMetadata(project);
    }
  });
})();
