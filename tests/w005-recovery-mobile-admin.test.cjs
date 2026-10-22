// W005: exercise actual account-page.js recovery UI with a lightweight DOM fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/account-page.js', 'utf8');

async function openAccount(search, hash, registerError) {
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
        onAuthChanged(callback) { void callback(null, 'INITIAL_SESSION'); return () => {}; },
        requestPasswordReset: async () => ({}),
        register: async () => { if (scope.__registerError) throw new Error(scope.__registerError); return { user: { id: 'x' }, session: null }; },
        resendConfirmation: async () => ({})
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
