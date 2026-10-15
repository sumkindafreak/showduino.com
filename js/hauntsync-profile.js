/* HauntSync creator profile editor — owner-scoped Supabase fields and public avatar upload. */
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const els = {};
  let latestLoad = 0;
  let busy = false;
  let persistedProfile = null;

  function initials(name) {
    return String(name || 'Creator').trim().split(/\s+/).filter(Boolean)
      .slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'HS';
  }

  function status(message, kind) {
    els.status.textContent = message;
    els.status.className = 'hs-inline-status' + (kind ? ' ' + kind : '');
  }

  function setBusy(value) {
    busy = value;
    els.saveButton.disabled = value;
    els.photoInput.disabled = value;
    els.removePhoto.disabled = value || !persistedProfile?.avatar_url;
  }

  function displayAvatar(url, name) {
    els.initials.textContent = initials(name);
    els.photo.hidden = !url;
    els.initials.hidden = !!url;
    if (url) {
      els.photo.src = url;
    } else {
      els.photo.removeAttribute('src');
    }
  }

  function render(profile, syncForm = true) {
    persistedProfile = profile;
    const name = profile?.display_name || 'Showduino Creator';
    displayAvatar(profile?.avatar_url || '', name);
    els.removePhoto.disabled = busy || !profile?.avatar_url;
    els.name.textContent = name;
    els.usernameLabel.textContent = profile?.username ? '@' + profile.username : 'Choose your creator username';
    els.bioPreview.textContent = profile?.bio || 'Tell fellow creators what you build, design or operate.';
    els.focusLabel.textContent = profile?.creator_focus || 'Creative technology';
    if (!syncForm) return; // Photo saves must not discard other unsaved text edits.
    els.nameInput.value = profile?.display_name || '';
    els.usernameInput.value = profile?.username || '';
    els.bioInput.value = profile?.bio || '';
    els.focusInput.value = profile?.creator_focus || '';
    els.websiteInput.value = profile?.website_url || '';
  }

  async function loadProfile(user) {
    const seq = ++latestLoad;
    els.section.hidden = !user;
    els.gate.hidden = !!user;
    if (!user) { persistedProfile = null; return; }
    if (busy) return;
    status('Loading your creator profile…');
    try {
      const profile = await window.ShowduinoSupabase.getCreatorProfile();
      if (seq !== latestLoad) return;
      render(profile);
      status('Your creator profile is private for now. Uploaded profile photos are visible to anyone with their URL.', 'success');
    } catch (error) {
      if (seq !== latestLoad) return;
      status('Profile editing could not be loaded: ' + (error?.message || 'account service unavailable'), 'error');
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
    const seq = latestLoad;
    setBusy(true);
    status('Saving your profile securely…');
    try {
      const profile = await window.ShowduinoSupabase.saveCreatorProfile(values);
      if (seq !== latestLoad) return;
      render(profile);
      status('Creator profile saved to your Showduino account.', 'success');
    } catch (error) {
      if (seq === latestLoad) status(error?.message || 'Could not save your profile. Your edits remain in the form.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto() {
    const file = els.photoInput.files?.[0];
    if (!file || busy) return;
    const seq = latestLoad;
    const oldProfile = persistedProfile;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type) || file.size < 1 || file.size > 2 * 1024 * 1024) {
      els.photoInput.value = '';
      status('Choose a JPG, PNG or WebP photo, maximum 2 MB.', 'error');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setBusy(true);
    displayAvatar(previewUrl, oldProfile?.display_name || 'Showduino Creator');
    status('Uploading and saving your new profile photo…');
    try {
      const profile = await window.ShowduinoSupabase.uploadCreatorAvatar(file);
      if (seq !== latestLoad) return;
      render(profile, false);
      status('Profile photo saved. You can replace or remove it at any time.', 'success');
    } catch (error) {
      if (seq === latestLoad) {
        render(oldProfile, false);
        status(error?.message || 'Photo upload failed; your old picture is unchanged.', 'error');
      }
    } finally {
      URL.revokeObjectURL(previewUrl);
      els.photoInput.value = '';
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (busy || !persistedProfile?.avatar_url) return;
    const seq = latestLoad;
    setBusy(true);
    status('Removing your profile photo…');
    try {
      const profile = await window.ShowduinoSupabase.removeCreatorAvatar();
      if (seq !== latestLoad) return;
      render(profile, false);
      status('Profile photo removed. Your initials are showing again.', 'success');
    } catch (error) {
      if (seq === latestLoad) status(error?.message || 'Could not remove the photo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function init() {
    els.section = byId('creator-profile');
    if (!els.section) return;
    els.gate = byId('hs-profile-signed-out');
    els.status = byId('hs-profile-status');
    els.name = byId('hs-profile-name');
    els.usernameLabel = byId('hs-profile-username');
    els.bioPreview = byId('hs-profile-bio-preview');
    els.focusLabel = byId('hs-profile-focus-label');
    els.initials = byId('hs-profile-initials');
    els.photo = byId('hs-profile-photo');
    els.photoInput = byId('hs-profile-file');
    els.removePhoto = byId('hs-profile-photo-remove');
    els.nameInput = byId('hs-profile-display');
    els.usernameInput = byId('hs-profile-handle');
    els.bioInput = byId('hs-profile-bio');
    els.focusInput = byId('hs-profile-focus');
    els.websiteInput = byId('hs-profile-website');
    els.saveButton = byId('hs-profile-save');
    byId('hs-profile-form').addEventListener('submit', save);
    els.photoInput.addEventListener('change', choosePhoto);
    els.removePhoto.addEventListener('click', removePhoto);
    els.photo.addEventListener('error', () => { els.photo.hidden = true; els.initials.hidden = false; });

    if (!window.ShowduinoSupabase?.enabled()) {
      els.section.hidden = true;
      els.gate.hidden = false;
      return;
    }
    window.ShowduinoSupabase.onAuthChanged((user) => {
      if (!user) {
        ++latestLoad;
        persistedProfile = null;
        els.section.hidden = true;
        els.gate.hidden = false;
        return;
      }
      loadProfile(user);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
