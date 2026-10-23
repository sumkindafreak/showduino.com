// W005: exercise actual account-page.js recovery UI with a lightweight DOM fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/account-page.js', 'utf8');

async function openAccount(search, hash, registerError, emailError, authEvents) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        textContent: '', className: '', hidden: false, disabled: false, value: '',
        listeners: {}, innerHTML: '',
        addEventListener(name, callback) { this.listeners[name] = callback; },
        querySelectorAll() { return []; },
        replaceChildren() { this.innerHTML = ''; },
        focus() {},
        reset() {}
      });
    }
    return nodes.get(id);
  };
  let initialise;
  const scope = {
    window: {
      location: { search, hash },
      // No credentials or actual requests are used in this test.
      SHOWDUINO_CONFIG: {},
      ShowduinoSupabase: {
        enabled: () => true,
        onAuthChanged(callback) { for (const [user, event] of scope.__authEvents) void callback(user, event); return () => {}; },
        requestPasswordReset: async () => { if (scope.__emailError) throw scope.__emailError; return {}; },
        register: async () => {
          if (scope.__registerError instanceof Error) throw scope.__registerError;
          if (scope.__registerError) throw new Error(scope.__registerError);
          return { user: { id: 'x' }, session: null };
        },
        resendConfirmation: async () => { if (scope.__emailError) throw scope.__emailError; return {}; }
      },
      history: { replaceState(state, title, url) { scope.__replaced = url; } }
    },
    document: {
      getElementById: node,
      addEventListener(event, callback) {
        if (event === 'DOMContentLoaded') initialise = callback;
      }
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => '[]' },
    URLSearchParams,
    console
  };
  scope.__registerError = registerError || '';
  scope.__emailError = emailError || null;
  scope.__authEvents = authEvents || [[null, 'INITIAL_SESSION']];
  vm.runInNewContext(source, scope, { filename: 'js/account-page.js' });
  assert.equal(typeof initialise, 'function');
  initialise();
  await Promise.resolve();
  node.scope = scope;
  return node;
}

(async () => {
  const normal = await openAccount('', '');
  normal('login-email').value = 'nonexistent@example.test';
  await normal('forgot-password-button').listeners.click();
  assert.match(normal('account-status').textContent, /If a Showduino account exists/i);
  assert.doesNotMatch(normal('account-status').textContent, /email sent/i);

  const expired = await openAccount('', '#error=access_denied&error_code=otp_expired');
  assert.match(expired('account-status').textContent, /expired or was already used/i);
  assert.match(expired('account-status').className, /error/);
  assert.equal(expired.scope.__replaced, 'account.html', 'error removed from the address bar');

  // Registration and resend never reveal whether an address already has an account.
  for (const registerError of ['', 'User already registered']) {
    const reg = await openAccount('', '', registerError);
    reg('register-email').value = 'someone@example.test';
    reg('register-password').value = 'a-long-test-passphrase';
    reg('register-name').value = 'Tester';
    await reg('register-form').listeners.submit({ preventDefault() {} });
    assert.match(reg('account-status').textContent, /If you already have one/i, `neutral sign-up copy (${registerError || 'new address'})`);
    assert.doesNotMatch(reg('account-status').textContent, /already registered/i);
  }
  const resend = await openAccount('', '');
  resend('register-email').value = 'someone@example.test';
  await resend('resend-confirmation-button').listeners.click();
  assert.match(resend('account-status').textContent, /If that address has an unconfirmed Showduino ID/i);

  // Supabase rate-limits or fails a send only for addresses that have an account, so
  // every server answer must read exactly like success (no account enumeration).
  const apiError = (status, message) => Object.assign(new Error(message), { status });
  const serverAnswers = [
    apiError(429, 'For security purposes, you can only request this after 52 seconds.'),
    apiError(500, 'Error sending recovery email'),
    apiError(400, 'Email address not authorized')
  ];
  const baseline = await openAccount('', '');
  baseline('login-email').value = 'someone@example.test';
  await baseline('forgot-password-button').listeners.click();
  const resetSuccess = baseline('account-status').textContent;
  for (const error of serverAnswers) {
    const page = await openAccount('', '', '', error);
    page('login-email').value = 'someone@example.test';
    await page('forgot-password-button').listeners.click();
    assert.equal(page('account-status').textContent, resetSuccess, `reset: "${error.message}" reads like success`);
    assert.doesNotMatch(page('account-status').className, /error/);
    const again = await openAccount('', '', '', error);
    again('register-email').value = 'someone@example.test';
    await again('resend-confirmation-button').listeners.click();
    assert.match(again('account-status').textContent, /If that address has an unconfirmed Showduino ID/i, `resend: "${error.message}" reads like success`);
  }
  // A failed security check or a malformed address is the same for every address: shown.
  for (const [error, pattern] of [[Object.assign(apiError(400, 'captcha protection: request disallowed (captcha-verification-failed)'), { code: 'captcha_failed' }), /security check did not pass/i],
                                  [Object.assign(apiError(400, 'Unable to validate email address: invalid format'), { code: 'email_address_invalid' }), /Check the email address/i]]) {
    const page = await openAccount('', '', '', error);
    page('login-email').value = 'someone@example.test';
    await page('forgot-password-button').listeners.click();
    assert.match(page('account-status').textContent, pattern, `reset shows "${error.message}"`);
    assert.match(page('account-status').className, /error/);
    const reg = await openAccount('', '', error);
    reg('register-email').value = 'someone@example.test'; reg('register-password').value = 'a-long-test-passphrase'; reg('register-name').value = 'Tester';
    await reg('register-form').listeners.submit({ preventDefault() {} });
    assert.match(reg('account-status').textContent, pattern, `sign-up shows "${error.message}"`);
  }
  const offline = await openAccount('', '', '', new TypeError('Failed to fetch'));
  offline('login-email').value = 'someone@example.test';
  await offline('forgot-password-button').listeners.click();
  assert.match(offline('account-status').textContent, /could not be reached/i, 'a request that never reached the server is reported');
  for (const error of [apiError(429, 'For security purposes, you can only request this after 30 seconds.'), apiError(500, 'Error sending confirmation email')]) {
    const reg = await openAccount('', '', error);
    reg('register-email').value = 'someone@example.test';
    reg('register-password').value = 'a-long-test-passphrase';
    reg('register-name').value = 'Tester';
    await reg('register-form').listeners.submit({ preventDefault() {} });
    assert.match(reg('account-status').textContent, /If you already have one/i, `sign-up: "${error.message}" reads like success`);
  }
  const weak = await openAccount('', '', apiError(422, 'Password should be at least 12 characters.'));
  weak('register-email').value = 'someone@example.test';
  weak('register-password').value = 'a-long-test-passphrase';
  weak('register-name').value = 'Tester';
  await weak('register-form').listeners.submit({ preventDefault() {} });
  assert.match(weak('account-status').textContent, /at least 12 characters/, 'password rules are still shown');

  // Recovery links: valid, expired, already used, malformed.
  const valid = await openAccount('', '#access_token=a.b.c&type=recovery', '', null, [[{ id: 'u', email: 'u@example.test' }, 'PASSWORD_RECOVERY']]);
  assert.equal(valid('password-recovery-panel').hidden, false, 'valid link opens the new-password form');
  assert.match(valid('account-status').textContent, /Password reset link accepted/);
  const used = await openAccount('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  assert.match(used('account-status').textContent, /expired or was already used/i, 'already-used link (Supabase reports otp_expired)');
  assert.equal(used('password-recovery-panel').hidden, true);
  const malformed = await openAccount('', '#access_token=not-a-token&type=recovery');
  assert.match(malformed('account-status').textContent, /could not be used/i, 'malformed recovery link explained');
  assert.match(malformed('account-status').className, /error/);
  assert.equal(malformed('password-recovery-panel').hidden, true, 'no password form without a recovery session');
  assert.equal(malformed.scope.__replaced, 'account.html', 'malformed token removed from the address bar');

  const rejected = await openAccount('?error=access_denied&error_code=access_denied&error_description=%3Cscript%3E', '');
  assert.match(rejected('account-status').textContent, /could not be used/i);
  assert.doesNotMatch(rejected('account-status').textContent, /script/i);

  const html = fs.readFileSync('admin.html', 'utf8');
  const admin = fs.readFileSync('js/hauntsync-admin.js', 'utf8');
  const css = fs.readFileSync('css/hauntsync-community.css', 'utf8');
  assert.match(html, /id="hs-reason-dialog"/);
  assert.match(admin, /dialog\.showModal\(\)/);
  assert.doesNotMatch(admin, /\bprompt\(/);
  assert.match(admin, /\['Member', 'Joined', 'Status', 'Activity', 'Actions'\]/);
  assert.match(css, /max-width: 599px/);
  assert.match(css, /content: attr\(data-label\)/);
  console.log('PASS: W005 reset copy, expired link, safe error wording and mobile admin contract.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
