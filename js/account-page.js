/* global ShowduinoSupabase */
(function () {
  'use strict';

  const elements = {};
  const params = new URLSearchParams(window.location.search);
  const confirmationReturn = params.get('confirmed') === '1';
  let recoveryMode = false;

  function byId(id) { return document.getElementById(id); }
  function setStatus(message, type) { elements.status.textContent = message; elements.status.className = `status-banner${type ? ` ${type}` : ''}`; }
  function friendlyAuthMessage(error, fallback) {
    const message = String(error?.message || fallback || 'Something went wrong.');
    if (/invalid login credentials/i.test(message)) return 'That email address and password did not match. If you just signed up, make sure the confirmation email has been opened first.';
    if (/email not confirmed/i.test(message)) return 'Your Showduino ID is waiting for email confirmation. Open the confirmation email, or use “Resend confirmation”.';
    if (/expired|invalid.*link|token/i.test(message)) return 'That confirmation link has expired or has already been used. Enter your email and choose “Resend confirmation”.';
    return message;
  }
  function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
  function localProjects() { try { const stored = JSON.parse(localStorage.getItem('showduino_local_projects') || '[]'); return Array.isArray(stored) ? stored : []; } catch (_) { return []; } }

  async function renderProjects(user) {
    elements.projectList.innerHTML = '';
    let cloud = [];
    if (user) { try { cloud = await window.ShowduinoSupabase.listProjects(); } catch (error) { setStatus(`Signed in, but cloud projects could not be loaded: ${error.message}`, 'error'); } }
    const cloudIds = new Set(cloud.map((project) => project.id));
    const local = localProjects().filter((project) => !cloudIds.has(project.id));
    if (!cloud.length && !local.length) { elements.projectList.innerHTML = '<p class="muted">No shows yet. Open Studio and create your first Showduino production.</p>'; return; }
    cloud.forEach((project) => {
      const item = document.createElement('article'); item.className = 'project-item';
      item.innerHTML = `<div><strong>${escapeHtml(project.name || 'Untitled Show')}</strong><div class="muted">Updated ${escapeHtml(new Date(project.updated_at).toLocaleString())}</div></div><span class="badge">CLOUD</span>`;
      item.addEventListener('click', () => { sessionStorage.setItem('showduino_open_cloud_project', project.id); window.location.href = 'studio.html'; });
      item.tabIndex = 0; item.setAttribute('role','button'); item.addEventListener('keydown',(event)=>{ if(event.key==='Enter'||event.key===' ') item.click(); }); elements.projectList.appendChild(item);
    });
    local.forEach((project) => { const item=document.createElement('article'); item.className='project-item'; item.innerHTML=`<div><strong>${escapeHtml(project.name || 'Untitled Show')}</strong><div class="muted">Updated ${escapeHtml(project.updatedAt || 'on this device')}</div></div><span class="badge">THIS DEVICE</span>`; elements.projectList.appendChild(item); });
  }

  function showSignedOut() { if (recoveryMode) return; elements.authForms.hidden=false; elements.accountPanel.hidden=true; elements.recoveryPanel.hidden=true; }
  async function showSignedIn(user) {
    if (recoveryMode) return; elements.authForms.hidden=true; elements.accountPanel.hidden=false; elements.recoveryPanel.hidden=true;
    let displayName=user.user_metadata?.display_name || 'Showduino Creator'; try { const profile=await window.ShowduinoSupabase.getProfile(); if(profile?.display_name) displayName=profile.display_name; } catch (_) {}
    elements.accountName.textContent=displayName; elements.accountEmail.textContent=user.email || '';
    setStatus(confirmationReturn ? 'Email confirmed — welcome to Showduino. Your Showduino ID is ready.' : 'Signed in. Your cloud shows are ready.','success'); await renderProjects(user);
  }
  function showRecoveryMode() { recoveryMode=true; elements.authForms.hidden=true; elements.accountPanel.hidden=true; elements.recoveryPanel.hidden=false; setStatus('Password reset link accepted. Choose a new password below.','success'); }

  async function handleSignIn(event) { event.preventDefault(); setStatus('Signing in…'); try { await window.ShowduinoSupabase.signIn(elements.loginEmail.value.trim(),elements.loginPassword.value); } catch(error){ setStatus(friendlyAuthMessage(error,'Sign in failed.'),'error'); } }
  async function handleRegister(event) {
    event.preventDefault(); setStatus('Creating your Showduino account…');
    try {
      const email=elements.registerEmail.value.trim();
      const data=await window.ShowduinoSupabase.register(email,elements.registerPassword.value,elements.registerName.value.trim());
      sessionStorage.setItem('showduino_pending_confirmation_email',email); elements.registerPassword.value='';
      setStatus(data.session ? 'Account created and signed in.' : 'Showduino ID created. Check your email and tap “Confirm Email Address”. You will return here automatically.','success');
    } catch(error){ setStatus(friendlyAuthMessage(error,'Account creation failed.'),'error'); }
  }
  async function handleResendConfirmation() {
    const email=elements.registerEmail.value.trim() || elements.loginEmail.value.trim() || sessionStorage.getItem('showduino_pending_confirmation_email') || '';
    if(!email){ setStatus('Enter the email address you used to create your Showduino ID, then tap “Resend confirmation”.','error'); return; }
    setStatus('Sending a fresh Showduino confirmation email…');
    try { await window.ShowduinoSupabase.resendConfirmation(email); sessionStorage.setItem('showduino_pending_confirmation_email',email); setStatus('Fresh confirmation email sent. Open it and tap “Confirm Email Address”.','success'); }
    catch(error){ setStatus(friendlyAuthMessage(error,'The confirmation email could not be resent.'),'error'); }
  }
  async function handleForgotPassword() {
    const email=elements.loginEmail.value.trim(); if(!email){ setStatus('Enter your email address in the Sign in box first, then tap “Forgot password?”.','error'); elements.loginEmail.focus(); return; }
    setStatus('Sending password reset email…'); try { await window.ShowduinoSupabase.requestPasswordReset(email); setStatus('Password reset email sent. Open it and follow the link back to Showduino.','success'); } catch(error){ setStatus(friendlyAuthMessage(error,'Password reset email could not be sent.'),'error'); }
  }
  async function handleRecoverySubmit(event) {
    event.preventDefault(); const password=elements.recoveryPassword.value; const confirm=elements.recoveryPasswordConfirm.value;
    if(password!==confirm){ setStatus('The two passwords do not match.','error'); return; }
    setStatus('Saving your new password…');
    try { await window.ShowduinoSupabase.updatePassword(password); recoveryMode=false; elements.recoveryForm.reset(); history.replaceState(null,'','account.html'); const user=await window.ShowduinoSupabase.getCurrentUser(); if(user) await showSignedIn(user); else { showSignedOut(); setStatus('Password updated. Sign in with your new password.','success'); } }
    catch(error){ setStatus(friendlyAuthMessage(error,'Your password could not be updated.'),'error'); }
  }
  async function handleSignOut(){ try{ await window.ShowduinoSupabase.signOut(); setStatus('You have signed out.'); await renderProjects(null); } catch(error){ setStatus(friendlyAuthMessage(error,'Sign out failed.'),'error'); } }

  function initialise() {
    ['status','authForms','accountPanel','recoveryPanel','loginForm','registerForm','recoveryForm','loginEmail','loginPassword','registerName','registerEmail','registerPassword','recoveryPassword','recoveryPasswordConfirm','accountName','accountEmail','projectList','signOutButton','forgotPasswordButton','resendConfirmationButton'].forEach(()=>{});
    elements.status=byId('account-status'); elements.authForms=byId('auth-forms'); elements.accountPanel=byId('account-panel'); elements.recoveryPanel=byId('password-recovery-panel'); elements.loginForm=byId('login-form'); elements.registerForm=byId('register-form'); elements.recoveryForm=byId('password-recovery-form'); elements.loginEmail=byId('login-email'); elements.loginPassword=byId('login-password'); elements.registerName=byId('register-name'); elements.registerEmail=byId('register-email'); elements.registerPassword=byId('register-password'); elements.recoveryPassword=byId('recovery-password'); elements.recoveryPasswordConfirm=byId('recovery-password-confirm'); elements.accountName=byId('account-name'); elements.accountEmail=byId('account-email'); elements.projectList=byId('project-list'); elements.signOutButton=byId('sign-out-button'); elements.forgotPasswordButton=byId('forgot-password-button'); elements.resendConfirmationButton=byId('resend-confirmation-button');
    const pendingEmail=sessionStorage.getItem('showduino_pending_confirmation_email'); if(pendingEmail){ elements.registerEmail.value=pendingEmail; elements.loginEmail.value=pendingEmail; }
    elements.loginForm.addEventListener('submit',handleSignIn); elements.registerForm.addEventListener('submit',handleRegister); elements.recoveryForm.addEventListener('submit',handleRecoverySubmit); elements.signOutButton.addEventListener('click',handleSignOut); elements.forgotPasswordButton.addEventListener('click',handleForgotPassword); elements.resendConfirmationButton.addEventListener('click',handleResendConfirmation);
    if(!window.ShowduinoSupabase?.enabled()){ showSignedOut(); elements.authForms.querySelectorAll('input, button').forEach((element)=>{element.disabled=true;}); setStatus('Showduino account services could not start. Local Studio saving is still available.','error'); renderProjects(null); return; }
    setStatus(confirmationReturn ? 'Finishing your Showduino email confirmation…' : 'Checking your Showduino account…');
    window.ShowduinoSupabase.onAuthChanged(async(user,event)=>{
      if(event==='PASSWORD_RECOVERY'){ showRecoveryMode(); return; }
      if(recoveryMode) return;
      if(user){ sessionStorage.removeItem('showduino_pending_confirmation_email'); await showSignedIn(user); }
      else { showSignedOut(); setStatus(confirmationReturn ? 'Email confirmed. Sign in to finish opening your Showduino ID.' : 'Sign in or create a free Showduino account.', confirmationReturn ? 'success' : undefined); await renderProjects(null); }
    });
  }
  document.addEventListener('DOMContentLoaded',initialise);
})();
