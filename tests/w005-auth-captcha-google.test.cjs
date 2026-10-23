// W005 (W5-05, W5-08): Google sign-in stays hidden unless explicitly enabled, and every
// email/password request carries the Turnstile token when bot protection is configured.
// Runs the real js/cloud/supabase-service.js and js/account-page.js in a VM with fakes;
// no network, no credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function serviceWith(calls) {
  const auth = {
    signUp: async (a) => { calls.push(['signUp', a]); return { data: { user: null, session: null }, error: null }; },
    signInWithPassword: async (a) => { calls.push(['signInWithPassword', a]); return { data: { user: null }, error: null }; },
    resetPasswordForEmail: async (email, o) => { calls.push(['resetPasswordForEmail', email, o]); return { data: {}, error: null }; },
    resend: async (a) => { calls.push(['resend', a]); return { data: {}, error: null }; },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  };
  const window = {
    // Account services run only on the production host (PR #84 gates on hostname).
    location: { hostname: 'show-duino.com' },
    SHOWDUINO_CONFIG: { features: { supabase: true, authentication: true }, supabase: { url: 'https://example.invalid', publishableKey: 'sb_publishable_test' } },
    supabase: { createClient: () => ({ auth, from: () => ({}) }) },
    crypto: require('node:crypto').webcrypto
  };
  vm.runInNewContext(fs.readFileSync('js/cloud/supabase-service.js', 'utf8'), { window, console, URL, setTimeout });
  return window.ShowduinoSupabase;
}

function accountPage(config, captcha) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, textContent: '', className: '', hidden: false, disabled: false, value: '', listeners: {},
      addEventListener(n, cb) { this.listeners[n] = cb; }, querySelectorAll() { return []; }, replaceChildren() {}, focus() {}, reset() {}, appendChild() {} });
    return nodes.get(id);
  };
  const calls = [];
  let initialise;
  const window = {
    location: { search: '', hash: '' }, history: { replaceState() {} },
    SHOWDUINO_CONFIG: config, ShowduinoCaptcha: captcha,
    ShowduinoSupabase: {
      enabled: () => true,
      onAuthChanged(cb) { void cb(null, 'INITIAL_SESSION'); return () => {}; },
      signIn: async (...a) => { calls.push(['signIn', a]); return {}; },
      register: async (...a) => { calls.push(['register', a]); return { session: null }; },
      requestPasswordReset: async (...a) => { calls.push(['requestPasswordReset', a]); return {}; },
      resendConfirmation: async (...a) => { calls.push(['resendConfirmation', a]); return {}; }
    }
  };
  const fetched = [];
  const scope = { window, document: { getElementById: node, addEventListener(e, cb) { if (e === 'DOMContentLoaded') initialise = cb; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, localStorage: { getItem: () => '[]' },
    URLSearchParams, URL, console, history: window.history, fetch: async (u) => { fetched.push(String(u)); return { ok: true, json: async () => ({ external: { google: true } }) }; } };
  vm.runInNewContext(fs.readFileSync('js/account-page.js', 'utf8'), scope);
  initialise();
  return { node, calls, fetched };
}

(async () => {
  // 1. Service layer passes the token through to supabase-js, and omits it when off.
  const calls = [];
  const svc = serviceWith(calls);
  await svc.register('a@example.test', 'long-enough-password', 'A', 'tok-1');
  await svc.signIn('a@example.test', 'long-enough-password', 'tok-2');
  await svc.requestPasswordReset('a@example.test', 'tok-3');
  await svc.resendConfirmation('a@example.test', 'tok-4');
  await svc.signIn('a@example.test', 'long-enough-password');
  assert.equal(calls[0][1].options.captchaToken, 'tok-1', 'sign-up token');
  assert.equal(calls[0][1].options.emailRedirectTo, 'https://show-duino.com/account.html?confirmed=1', 'sign-up redirect unchanged');
  assert.equal(calls[1][1].options.captchaToken, 'tok-2', 'sign-in token');
  assert.equal(calls[2][2].captchaToken, 'tok-3', 'reset token');
  assert.equal(calls[2][2].redirectTo, 'https://show-duino.com/account.html', 'reset redirect unchanged');
  assert.equal(calls[3][1].options.captchaToken, 'tok-4', 'resend token');
  assert.equal(calls[4][1].options, undefined, 'no captcha field when protection is off');

  // 2. Google is hidden by default and never probed; shown only when the flag is on.
  const off = accountPage({ features: {}, supabase: { url: 'https://example.invalid', publishableKey: 'k' } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(off.node('google-auth-panel').hidden, true, 'Google panel hidden by default');
  assert.equal(off.fetched.length, 0, 'provider settings not fetched while Google is off');
  const on = accountPage({ features: { googleSignIn: true }, supabase: { url: 'https://example.invalid', publishableKey: 'k' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(on.node('google-auth-panel').hidden, false, 'Google panel shown when enabled');
  assert.equal(on.node('google-signin-button').disabled, false, 'button enabled once the provider reports google:true');

  // 3. The page asks for a token per request and resets the widget afterwards.
  let issued = 0, resets = 0;
  const captcha = { enabled: () => true, prepare() {}, token: async () => `turnstile-${++issued}`, reset() { resets++; } };
  const page = accountPage({ features: {}, supabase: { url: 'https://example.invalid', publishableKey: 'k' } }, captcha);
  page.node('login-email').value = 'a@example.test'; page.node('login-password').value = 'x'.repeat(12);
  await page.node('login-form').listeners.submit({ preventDefault() {} });
  await page.node('forgot-password-button').listeners.click();
  page.node('register-email').value = 'b@example.test'; page.node('register-password').value = 'y'.repeat(14); page.node('register-name').value = 'B';
  await page.node('register-form').listeners.submit({ preventDefault() {} });
  await page.node('resend-confirmation-button').listeners.click();
  assert.deepEqual(page.calls.map((c) => [c[0], c[1].at(-1)]), [
    ['signIn', 'turnstile-1'], ['requestPasswordReset', 'turnstile-2'], ['register', 'turnstile-3'], ['resendConfirmation', 'turnstile-4']]);
  assert.equal(resets, 4, 'widget reset after every request');

  // 4. Config ships with Google off and no site key; welcome copy no longer offers Google.
  const config = fs.readFileSync('config/runtime-config.js', 'utf8');
  assert.match(config, /googleSignIn: false/);
  assert.match(config, /siteKey: ''/);
  assert.doesNotMatch(fs.readFileSync('welcome.html', 'utf8'), /Continue with Google/);
  assert.match(fs.readFileSync('account.html', 'utf8'), /id="google-auth-panel"[^>]*hidden/);
  console.log('PASS: Google hidden until enabled; Turnstile token on sign-up, sign-in, reset and resend; reset after use.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
