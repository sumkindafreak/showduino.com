(function () {
  'use strict';

  const providerPattern = /\b(?:supabase|superbase)\b/gi;

  function redactText(value) {
    return String(value || '').replace(providerPattern, 'database');
  }

  function redactNode(node) {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (providerPattern.test(node.nodeValue || '')) {
        providerPattern.lastIndex = 0;
        node.nodeValue = redactText(node.nodeValue);
      } else {
        providerPattern.lastIndex = 0;
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    ['title', 'aria-label', 'placeholder', 'content'].forEach((attribute) => {
      if (!node.hasAttribute(attribute)) return;
      const value = node.getAttribute(attribute);
      providerPattern.lastIndex = 0;
      if (providerPattern.test(value || '')) node.setAttribute(attribute, redactText(value));
      providerPattern.lastIndex = 0;
    });

    node.childNodes.forEach(redactNode);
  }

  function run() {
    redactNode(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') redactNode(mutation.target);
        mutation.addedNodes.forEach(redactNode);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
