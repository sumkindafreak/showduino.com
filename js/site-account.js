/* Shared website account controls. Uses the same auth service as account.html. */
(function () {
  'use strict';
  function init() {
    const header = document.querySelector('.site-header');
    if (!header || header.querySelector('.site-account-actions')) return;
    const group = document.createElement('div');
    group.className = 'site-account-actions';
    group.setAttribute('aria-label', 'Your Showduino account');
    const account = document.createElement('a');
    account.href = 'account.html';
    account.textContent = 'Account';
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.textContent = 'Log out';
    logout.hidden = true;
    const message = document.createElement('span');
    message.className = 'site-account-message';
    message.setAttribute('role', 'status');
    group.append(account, logout, message);
    header.append(group);
    let busy = false;
    function render(user) {
      account.textContent = user ? 'Account' : 'Sign in';
      logout.hidden = !user;
    }
    logout.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      logout.disabled = true;
      logout.textContent = 'Logging out…';
      message.textContent = '';
      try {
        await window.ShowduinoSupabase.signOut();
        render(null);
        // Leave private views only after sign-out succeeds. Local shows are retained.
        window.location.assign('account.html');
      } catch (error) {
        message.textContent = 'Could not log out. Please try again.';
        console.error('[Showduino account] Sign out failed', error);
      } finally {
        busy = false;
        logout.disabled = false;
        logout.textContent = 'Log out';
      }
    });
    try {
      if (window.ShowduinoSupabase?.enabled()) window.ShowduinoSupabase.onAuthChanged(render);
      else render(null);
    } catch (_) {
      message.textContent = 'Open Account to check your session.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
