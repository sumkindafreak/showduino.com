/* HauntSync profile editor: authenticated, private Supabase records only. */
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const els = {};
  let latestLoad = 0;
  let busy = false;

  function initials(name) {
    return String(name || 'Creator').trim().split(/\s+/).filter(Boolean)
      .slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'HS';
  }

  function status(message, kind) {
    els.status.textContent = message;
    els.status.className = 'hs-inline-status' + (kind ? ' ' + kind : '');
  }

  function render(profile) {
    const name = profile?.display_name || 'Showduino Creator';
    els.avatar.textContent = initials(name);
    els.name.textContent = name;
    els.usernameLabel.textContent = profile?.username ? '@' + profile.username : 'Choose your creator username';
    els.bioPreview.textContent = profile?.bio || 'Tell fellow creators what you build, design or operate.';
    els.focusLabel.textContent = profile?.creator_focus || 'Creative technology';
    els.nameInput.value = profile?.display_name || '';
    els.usernameInput.value = profile?.username || '';
    els.bioInput.value = profile?.bio || '';
    els.focusInput.value = profile?.creator_focus || '';
    els.websiteInput.value = profile?.website_url || '';
  }

  async function loadProfile(user) {
    const seq = ++latestLoad;
    els.section.hidden = !user;
    if (!user) return;
    if (busy) return;
    status('Loading your creator profile…');
    try {
      const profile = await window.ShowduinoSupabase.getCreatorProfile();
      if (seq !== latestLoad) return;
      render(profile);
      status('Your profile is private to your account for now. Public profiles are coming later.', 'success');
    } catch (error) {
      if (seq !== latestLoad) return;
      status('Profile editing is unavailable. The HauntSync database migration may still need applying. ' +
        (error?.message || ''), 'error');
      // Never claim that a failed cloud save created a profile.
    }
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const values = {
      display_name: els.nameInput.value.trim(),
      username: els.usernameInput.value.trim().toLowerCase(),
      bio: els.bioInput.value.trim(),
      creator_focus: els.focusInput.value.trim(),
      website_url: els.websiteInput.value.trim()
    };
    if (values.website_url && !values.website_url.startsWith('https://')) {
      status('Please use an HTTPS website URL.', 'error');
      return;
    }
    busy = true;
    els.saveButton.disabled = true;
    status('Saving your profile securely…');
    try {
      const profile = await window.ShowduinoSupabase.saveCreatorProfile(values);
      render(profile);
      status('Creator profile saved to your Showduino account.', 'success');
    } catch (error) {
      status(error?.message || 'Could not save your profile. Your changes are still in the form.', 'error');
    } finally {
      busy = false;
      els.saveButton.disabled = false;
    }
  }

  function init() {
    els.section = byId('creator-profile');
    if (!els.section) return;
    els.status = byId('hs-profile-status');
    els.avatar = byId('hs-profile-avatar');
    els.name = byId('hs-profile-name');
    els.usernameLabel = byId('hs-profile-username');
    els.bioPreview = byId('hs-profile-bio-preview');
    els.focusLabel = byId('hs-profile-focus-label');
    els.nameInput = byId('hs-profile-display');
    els.usernameInput = byId('hs-profile-handle');
    els.bioInput = byId('hs-profile-bio');
    els.focusInput = byId('hs-profile-focus');
    els.websiteInput = byId('hs-profile-website');
    els.saveButton = byId('hs-profile-save');
    byId('hs-profile-form').addEventListener('submit', save);

    if (!window.ShowduinoSupabase?.enabled()) {
      els.section.hidden = true;
      return;
    }
    window.ShowduinoSupabase.onAuthChanged((user) => {
      if (!user) { ++latestLoad; els.section.hidden = true; return; }
      loadProfile(user);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
