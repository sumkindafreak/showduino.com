/* Explicit account deletion: sign-in never requests or cancels deletion. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('account-deletion');
    if (!panel || !window.ShowduinoSupabase?.enabled()) return;
    const status = document.getElementById('deletion-status');
    const request = document.getElementById('deletion-request');
    const cancel = document.getElementById('deletion-cancel');
    const dialog = document.getElementById('deletion-dialog');
    const form = document.getElementById('deletion-form');
    const input = document.getElementById('deletion-confirmation');
    const submit = document.getElementById('deletion-submit');
    let revision = 0, signedIn = false, busy = false;
    const rpc = async (action, confirmation = '') => {
      const client = window.ShowduinoSupabase.client();
      const {data, error} = action === 'status'
        ? await client.rpc('get_account_deletion_status', {}, {get: true})
        : await client.rpc('manage_account_deletion', {p_action: action, p_confirmation: confirmation});
      if (error) throw error;
      return data;
    };
    function render(data) {
      const scheduled = !!data?.delete_after;
      const elapsed = scheduled && Date.parse(data.delete_after) <= Date.now();
      request.hidden = scheduled;
      request.disabled = busy || !!data?.owner_protected;
      cancel.hidden = !scheduled;
      cancel.disabled = busy || elapsed || data?.status === 'processing';
      status.textContent = data?.owner_protected
        ? 'This is the protected owner account. Contact Showduino support to close the service.'
        : scheduled
          ? `Deletion scheduled for ${new Date(data.delete_after).toLocaleString()}. ${elapsed || data.status === 'processing' ? 'The grace period has ended. Deletion is queued or in progress.' : 'Your account stays fully usable until then. Signing in does not cancel deletion; use Cancel deletion if you change your mind.'}`
          : 'No deletion is scheduled for your account.';
    }
    async function load() {
      const seq = ++revision;
      request.disabled = cancel.disabled = true;
      try { const data = await rpc('status'); if (seq === revision && signedIn) render(data); }
      catch (_) { if (seq === revision && signedIn) status.textContent = 'Deletion controls could not be loaded. Try again later or contact showduino38@gmail.com.'; }
    }
    request.addEventListener('click', () => {
      if (busy || !signedIn) return;
      input.value = ''; dialog.showModal(); input.focus();
    });
    document.getElementById('deletion-dialog-cancel').addEventListener('click', () => dialog.close());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !signedIn || input.value !== 'DELETE') return;
      busy = true; submit.disabled = true;
      const seq = revision;
      try {
        const data = await rpc('request', 'DELETE');
        if (seq === revision && signedIn) { dialog.close(); busy = false; render(data); }
      } catch (_) { if (seq === revision && signedIn) status.textContent = 'Deletion could not be scheduled. Nothing was confirmed. Close this dialog and try again, or contact support.'; }
      finally { busy = false; submit.disabled = false; }
    });
    cancel.addEventListener('click', async () => {
      if (busy || !signedIn) return;
      busy = true; cancel.disabled = true;
      const seq = revision;
      try {
        const data = await rpc('cancel', 'CANCEL');
        if (seq === revision && signedIn) { busy = false; render(data); status.textContent = 'Deletion cancelled. Your account will stay open.'; }
      } catch (_) { if (seq === revision && signedIn) { status.textContent = 'Cancellation was not confirmed. Refresh to check your deletion status, or contact support.'; } }
      finally { busy = false; if (signedIn) await load(); }
    });
    window.ShowduinoSupabase.onAuthChanged(user => {
      signedIn = !!user; ++revision; panel.hidden = !user;
      dialog.close();
      if (user) setTimeout(load, 0); // Keep work outside Supabase's auth event lock.
    });
    // Refresh a long-open countdown without changing the request or cancelling anything.
    setInterval(() => { if (signedIn && !busy && document.visibilityState === 'visible') load(); }, 60000);
  });
})();
