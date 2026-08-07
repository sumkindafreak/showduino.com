/* global ShowduinoSupabase */
(function () {
  'use strict';

  const elements = {};

  function byId(id) { return document.getElementById(id); }

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status-banner${type ? ` ${type}` : ''}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function localProjects() {
    try {
      const stored = JSON.parse(localStorage.getItem('showduino_local_projects') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch (_) {
      return [];
    }
  }

  async function renderProjects(user) {
    elements.projectList.innerHTML = '';
    let cloud = [];
    if (user) {
      try { cloud = await window.ShowduinoSupabase.listProjects(); }
      catch (error) { setStatus(`Signed in, but cloud projects could not be loaded: ${error.message}`, 'error'); }
    }

    const cloudIds = new Set(cloud.map((project) => project.id));
    const local = localProjects().filter((project) => !cloudIds.has(project.id));

    if (!cloud.length && !local.length) {
      elements.projectList.innerHTML = '<p class="muted">No shows yet. Open Studio and create your first Showduino production.</p>';
      return;
    }

    cloud.forEach((project) => {
      const item = document.createElement('article');
      item.className = 'project-item';
      item.innerHTML = `<div><strong>${escapeHtml(project.name || 'Untitled Show')}</strong><div class="muted">Updated ${escapeHtml(new Date(project.updated_at).toLocaleString())}</div></div><span class="badge">CLOUD</span>`;
      item.addEventListener('click', () => {
        sessionStorage.setItem('showduino_open_cloud_project', project.id);
        window.location.href = 'studio.html';
      });
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') item.click();
      });
      elements.projectList.appendChild(item);
    });

    local.forEach((project) => {
      const item = document.createElement('article');
      item.className = 'project-item';
      item.innerHTML = `<div><strong>${escapeHtml(project.name || 'Untitled Show')}</strong><div class="muted">Updated ${escapeHtml(project.updatedAt || 'on this device')}</div></div><span class="badge">THIS DEVICE</span>`;
      elements.projectList.appendChild(item);
    });
  }

  function showSignedOut() {
    elements.authForms.hidden = false;
    elements.accountPanel.hidden = true;
  }

  async function showSignedIn(user) {
    elements.authForms.hidden = true;
    elements.accountPanel.hidden = false;
    let displayName = user.user_metadata?.display_name || 'Showduino Creator';
    try {
      const profile = await window.ShowduinoSupabase.getProfile();
      if (profile?.display_name) displayName = profile.display_name;
    } catch (_) {}
    elements.accountName.textContent = displayName;
    elements.accountEmail.textContent = user.email || '';
    setStatus('Signed in. Your cloud shows are ready.', 'success');
    await renderProjects(user);
  }

  async function handleSignIn(event) {
    event.preventDefault();
    setStatus('Signing in…');
    try {
      await window.ShowduinoSupabase.signIn(elements.loginEmail.value.trim(), elements.loginPassword.value);
    } catch (error) {
      setStatus(error.message || 'Sign in failed.', 'error');
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setStatus('Creating your Showduino account…');
    try {
      const data = await window.ShowduinoSupabase.register(
        elements.registerEmail.value.trim(),
        elements.registerPassword.value,
        elements.registerName.value.trim()
      );
      elements.registerForm.reset();
      if (!data.session) {
        setStatus('Account created. Check your email for the confirmation link, then return here to sign in.', 'success');
      } else {
        setStatus('Account created and signed in.', 'success');
      }
    } catch (error) {
      setStatus(error.message || 'Account creation failed.', 'error');
    }
  }

  async function handleSignOut() {
    try {
      await window.ShowduinoSupabase.signOut();
      setStatus('You have signed out.');
      await renderProjects(null);
    } catch (error) {
      setStatus(error.message || 'Sign out failed.', 'error');
    }
  }

  function initialise() {
    elements.status = byId('account-status');
    elements.authForms = byId('auth-forms');
    elements.accountPanel = byId('account-panel');
    elements.loginForm = byId('login-form');
    elements.registerForm = byId('register-form');
    elements.loginEmail = byId('login-email');
    elements.loginPassword = byId('login-password');
    elements.registerName = byId('register-name');
    elements.registerEmail = byId('register-email');
    elements.registerPassword = byId('register-password');
    elements.accountName = byId('account-name');
    elements.accountEmail = byId('account-email');
    elements.projectList = byId('project-list');
    elements.signOutButton = byId('sign-out-button');

    elements.loginForm.addEventListener('submit', handleSignIn);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.signOutButton.addEventListener('click', handleSignOut);

    if (!window.ShowduinoSupabase?.enabled()) {
      showSignedOut();
      elements.authForms.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
      setStatus('Showduino account services could not start. Local Studio saving is still available.', 'error');
      renderProjects(null);
      return;
    }

    setStatus('Checking your Showduino account…');
    window.ShowduinoSupabase.onAuthChanged(async (user) => {
      if (user) await showSignedIn(user);
      else {
        showSignedOut();
        setStatus('Sign in or create a free Showduino account.');
        await renderProjects(null);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initialise);
})();
