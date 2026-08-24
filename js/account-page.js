/* global ShowduinoFirebase */
(function () {
  'use strict';

  const elements = {};
  const params = new URLSearchParams(window.location.search);
  const verificationReturn = params.get('verified') === '1';

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
  function friendlyAuthMessage(error, fallback) {
    const message = String(error?.message || fallback || 'Something went wrong.');
    if (/invalid-credential|invalid login credentials|wrong-password|user-not-found/i.test(message)) return 'That email address and password did not match.';
    if (/email-already-in-use/i.test(message)) return 'There is already a Showduino ID using that email address.';
    if (/weak-password/i.test(message)) return 'Use a stronger password with at least 8 characters.';
    if (/too-many-requests/i.test(message)) return 'Firebase has temporarily limited attempts. Try again in a little while.';
    if (/network-request-failed/i.test(message)) return 'The cloud could not be reached. Check your connection and try again.';
    return message;
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
      try {
        cloud = await window.ShowduinoFirebase.listProjects();
      } catch (error) {
        setStatus(`Signed in, but cloud projects could not be loaded: ${error.message}`, 'error');
      }
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
      const updated = project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'recently';
      item.innerHTML = `<div><strong>${escapeHtml(project.name || 'Untitled Show')}</strong><div class="muted">Updated ${escapeHtml(updated)}</div></div><span class="badge">FIREBASE</span>`;
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
    elements.recoveryPanel.hidden = true;
  }

  async function showSignedIn(user) {
    elements.authForms.hidden = true;
    elements.accountPanel.hidden = false;
    elements.recoveryPanel.hidden = true;
    let displayName = user.displayName || 'Showduino Creator';
    try {
      const profile = await window.ShowduinoFirebase.getProfile();
      if (profile?.displayName) displayName = profile.displayName;
    } catch (_) {}
    elements.accountName.textContent = displayName;
    elements.accountEmail.textContent = user.email || '';
    elements.verificationBadge.textContent = user.emailVerified ? 'EMAIL VERIFIED' : 'VERIFY EMAIL';
    setStatus(
      user.emailVerified
        ? 'Signed in. HauntSync, Studio and your Firebase cloud workspace are connected.'
        : 'Signed in. Check your inbox to verify your email; your HauntSync account is already usable.',
      user.emailVerified ? 'success' : undefined
    );
    await renderProjects(user);
  }

  async function handleSignIn(event) {
    event.preventDefault();
    setStatus('Signing in…');
    try {
      await window.ShowduinoFirebase.signIn(elements.loginEmail.value.trim(), elements.loginPassword.value);
    } catch (error) {
      setStatus(friendlyAuthMessage(error, 'Sign in failed.'), 'error');
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setStatus('Creating your Showduino ID…');
    try {
      await window.ShowduinoFirebase.register(
        elements.registerEmail.value.trim(),
        elements.registerPassword.value,
        elements.registerName.value.trim()
      );
      elements.registerPassword.value = '';
      setStatus('Showduino ID created. You are signed in and a verification email has been requested.', 'success');
    } catch (error) {
      setStatus(friendlyAuthMessage(error, 'Account creation failed.'), 'error');
    }
  }

  async function handleResendVerification() {
    setStatus('Requesting a fresh verification email…');
    try {
      await window.ShowduinoFirebase.resendVerification();
      setStatus('Verification email requested. Check your inbox and spam folder.', 'success');
    } catch (error) {
      setStatus(friendlyAuthMessage(error, 'Verification email could not be sent.'), 'error');
    }
  }

  async function handleForgotPassword() {
    const email = elements.loginEmail.value.trim();
    if (!email) {
      setStatus('Enter your email address in the Sign in box first.', 'error');
      elements.loginEmail.focus();
      return;
    }
    setStatus('Sending password reset email…');
    try {
      await window.ShowduinoFirebase.requestPasswordReset(email);
      setStatus('Password reset email requested. Follow the Firebase link in your inbox.', 'success');
    } catch (error) {
      setStatus(friendlyAuthMessage(error, 'Password reset email could not be sent.'), 'error');
    }
  }

  async function handleSignOut() {
    try {
      await window.ShowduinoFirebase.signOut();
      setStatus('You have signed out.');
      await renderProjects(null);
    } catch (error) {
      setStatus(friendlyAuthMessage(error, 'Sign out failed.'), 'error');
    }
  }

  function initialise() {
    elements.status = byId('account-status');
    elements.authForms = byId('auth-forms');
    elements.accountPanel = byId('account-panel');
    elements.recoveryPanel = byId('password-recovery-panel');
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
    elements.forgotPasswordButton = byId('forgot-password-button');
    elements.resendConfirmationButton = byId('resend-confirmation-button');
    elements.verificationBadge = byId('verification-badge');

    elements.loginForm.addEventListener('submit', handleSignIn);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.signOutButton.addEventListener('click', handleSignOut);
    elements.forgotPasswordButton.addEventListener('click', handleForgotPassword);
    elements.resendConfirmationButton.addEventListener('click', handleResendVerification);

    if (!window.ShowduinoFirebase?.enabled()) {
      showSignedOut();
      elements.authForms.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
      setStatus('Firebase account services could not start. Local Studio saving is still available.', 'error');
      renderProjects(null);
      return;
    }

    setStatus(verificationReturn ? 'Refreshing your verified Showduino ID…' : 'Checking your Showduino account…');
    window.ShowduinoFirebase.onAuthChanged(async (user) => {
      if (user) await showSignedIn(user);
      else {
        showSignedOut();
        setStatus('Sign in or create a free Showduino ID to join HauntSync and use cloud projects.');
        await renderProjects(null);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initialise);
})();
