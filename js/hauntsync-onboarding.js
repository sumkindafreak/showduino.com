/* HauntSync first-visit guide — reads only the signed-in owner's private profile. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  let request = 0;
  function status(message, error) {
    const el = byId('hs-onboarding-status');
    el.textContent = message;
    el.className = 'hs-inline-status' + (error ? ' error' : '');
  }
  function setStep(id, message, ready) {
    const el = byId(id);
    el.textContent = message;
    el.classList.toggle('ready', Boolean(ready));
  }
  async function update(user) {
    const seq = ++request;
    if (!user) {
      status('You can explore public HauntSync creations now. Create a Showduino ID to set up your own profile.');
      byId('hs-onboarding-join').textContent = 'Create your free Showduino ID';
      byId('hs-onboarding-join').href = 'account.html?next=welcome';
      byId('hs-onboarding-account-action').textContent = 'Sign up or sign in';
      setStep('hs-onboarding-account-state','Account needed',false);
      setStep('hs-onboarding-profile-state','Sign in to begin',false);
      setStep('hs-onboarding-share-state','Browsing is open to everyone',true);
      return;
    }
    byId('hs-onboarding-join').textContent = 'Open my HauntSync workspace';
    byId('hs-onboarding-join').href = 'hauntsync.html';
    byId('hs-onboarding-account-action').textContent = 'Manage my account';
    byId('hs-onboarding-account-action').href = 'account.html';
    setStep('hs-onboarding-account-state','Signed in',true);
    status('Your Showduino ID is ready. Set up your creator identity and make something new.');
    try {
      const [profile, publication] = await Promise.all([
        window.ShowduinoSupabase.getCreatorProfile(),
        window.ShowduinoSupabase.getOwnCreatorPublication()
      ]);
      if (seq !== request) return;
      const hasHandle = Boolean(profile?.username);
      setStep('hs-onboarding-profile-state',
        !hasHandle ? 'Choose a creator username next'
          : publication ? 'Creator page published as @'+publication.username
          : 'Private creator profile saved — publishing is optional', hasHandle);
      setStep('hs-onboarding-share-state','Open Studio, or publish a reviewed .shdo template',true);
    } catch (error) {
      if (seq !== request) return;
      status('Signed in, but profile status could not be loaded: '+(error?.message || 'service unavailable'),true);
      setStep('hs-onboarding-profile-state','Open the profile editor to continue',false);
    }
  }
  function init() {
    if (!window.ShowduinoSupabase?.enabled()) {
      update(null);
      status('Account services are temporarily unavailable. Studio and public browsing can still be used.',true);
      return;
    }
    window.ShowduinoSupabase.onAuthChanged(user => { void update(user); });
  }
  document.addEventListener('DOMContentLoaded',init);
})();