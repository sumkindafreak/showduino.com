/* Showduino bot protection for account forms (W005, W5-08).
 *
 * Cloudflare Turnstile is used only when SHOWDUINO_CONFIG.captcha.siteKey is set.
 * The site key is public; the secret key lives only in Supabase Auth settings.
 *
 * Order of enabling (otherwise sign-in breaks):
 *   1. Create a Turnstile widget for show-duino.com and put its SITE key in config.
 *   2. Deploy the website.
 *   3. In Supabase Auth -> Bot and abuse protection, enable CAPTCHA with the SECRET key.
 *
 * token() resolves to a single-use token, or undefined when protection is off; reset() after use. */
(function () {
  'use strict';

  const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const TOKEN_TIMEOUT_MS = 120000;
  let scriptPromise = null;
  let widgetId = null;
  let pending = null;
  let lastToken = '';

  function siteKey() {
    const captcha = window.SHOWDUINO_CONFIG?.captcha;
    if (!captcha || captcha.provider !== 'turnstile') return '';
    const key = String(captcha.siteKey || '').trim();
    return /^[0-9A-Za-z_-]{10,100}$/.test(key) ? key : '';
  }

  function enabled() { return Boolean(siteKey()); }

  function loadScript() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('The security check could not start.')));
      script.onerror = () => { scriptPromise = null; reject(new Error('The security check could not load. Check your connection and try again.')); };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  function settle(token) {
    lastToken = token || '';
    if (pending && token) {
      const { resolve, timer } = pending;
      pending = null;
      clearTimeout(timer);
      resolve(token);
    }
  }

  async function ensureWidget() {
    const turnstile = await loadScript();
    const container = document.getElementById('auth-captcha');
    if (!container) throw new Error('The security check is missing from this page.');
    container.hidden = false;
    if (widgetId === null) {
      widgetId = turnstile.render(container, {
        sitekey: siteKey(),
        action: 'showduino-auth',
        theme: 'dark',
        callback: settle,
        'expired-callback': () => { lastToken = ''; },
        'error-callback': () => { lastToken = ''; }
      });
    }
    return turnstile;
  }

  // Resolves to the current token, waiting for the person to finish the check if needed.
  // Tokens are single use: call reset() after the request that used it has finished.
  async function token() {
    if (!enabled()) return undefined;
    const turnstile = await ensureWidget();
    const ready = lastToken || (typeof turnstile.getResponse === 'function' ? turnstile.getResponse(widgetId) : '');
    if (ready) return ready;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = null; reject(new Error('Please complete the security check, then try again.')); }, TOKEN_TIMEOUT_MS);
      pending = { resolve, timer };
    });
  }

  function reset() {
    lastToken = '';
    if (widgetId === null || !window.turnstile) return;
    try { window.turnstile.reset(widgetId); } catch (_) { /* the next call simply waits for a new token */ }
  }

  // Show the widget early on pages that use it, so most people have a token before submitting.
  function prepare() { if (enabled()) ensureWidget().catch(() => {}); }

  window.ShowduinoCaptcha = Object.freeze({ enabled, token, reset, prepare });
})();
