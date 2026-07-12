/* global SHOWDUINO_CONFIG, ShowduinoFirebase */
(function () {
  'use strict';

  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status-banner${type ? ` ${type}` : ''}`;
  }

  function integrationsEnabled() {
    const config = window.SHOWDUINO_CONFIG || { features: {} };
    return Boolean(config.features.firebase && config.features.authentication);
  }

  function renderOfflineProjects() {
    const stored = JSON.parse(localStorage.getItem('showduino_local_projects') || '[]');
    elements.projectList.innerHTML = '';

    if (!stored.length) {
      elements.projectList.innerHTML = '<p class="muted">No local projects yet. Create one in Showduino Studio and it will appear here once account integration is connected.</p>';
      return;
    }

    stored.forEach((project) => {
      const item = document.createElement('article');
      item.className = 'project-item';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(project.name || 'Untitled show')}</strong>
          <div class="muted">Updated ${escapeHtml(project.updatedAt || 'locally')}</div>
        </div>
        <span class="badge">LOCAL</span>
      `;
      elements.projectList.appendChild(item);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showSignedOut() {
    elements.authForms.hidden = false;
    elements.accountPanel.hidden = true;
    elements.signOutButton.hidden = true;
  }

  function showSignedIn(user) {
    elements.authForms.hidden = true;
    elements.accountPanel.hidden = false;
    elements.signOutButton.hidden = false;
    elements.accountName.textContent = user.displayName || 'Showduino Creator';
    elements.accountEmail.textContent = user.email || 'No email available';
    setStatus('You are signed in and ready to use cloud features.', 'success');
  }

  async function handleSignIn(event) {
    event.preventDefault();
    setStatus('Signing in…');
    try {
      await window.ShowduinoFirebase.signIn(elements.loginEmail.value.trim(), elements.loginPassword.value);
    } catch (error) {
      setStatus(error.message || 'Sign in failed.', 'error');
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setStatus('Creating your account…');
    try {
      await window.ShowduinoFirebase.register(
        elements.registerEmail.value.trim(),
        elements.registerPassword.value,
        elements.registerName.value.trim()
      );
    } catch (error) {
      setStatus(error.message || 'Account creation failed.', 'error');
    }
  }

  async function handleSignOut() {
    try {
      await window.ShowduinoFirebase.signOut();
      setStatus('You have signed out.');
    } catch (error) {
      setStatus(error.message || 'Sign out failed.', 'error');
    }
  }

  function initialise() {
    elements.status = byId('account-status');
    elements.authForms = byId('auth-forms');
    elements.accountPanel = byId('account-panel');
    elements.signOutButton = byId('sign-out-button');
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

    renderOfflineProjects();
    elements.loginForm.addEventListener('submit', handleSignIn);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.signOutButton.addEventListener('click', handleSignOut);

    if (!integrationsEnabled() || !window.ShowduinoFirebase) {
      showSignedOut();
      elements.authForms.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
      setStatus('Account registration is prepared but currently disabled while the website is being completed. Local Studio features remain available.');
      return;
    }

    setStatus('Checking your account…');
    window.ShowduinoFirebase.onAuthChanged((user) => {
      if (user) showSignedIn(user);
      else {
        showSignedOut();
        setStatus('Sign in or create a Showduino account.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initialise);
})();
