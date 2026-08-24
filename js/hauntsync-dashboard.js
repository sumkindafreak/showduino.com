/* global ShowduinoFirebase */
(function () {
  'use strict';

  const PROJECT_INDEX_KEY = 'showduino_local_projects';
  const PROJECT_DATA_PREFIX = 'showduino_project_';
  const DEVICE_KEY = 'showduino_registered_devices';
  const elements = {};
  const replySubscriptions = new Map();
  let currentUser = null;
  let currentPosts = [];

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return parsed;
    } catch (error) {
      console.warn(`[HauntSync] Could not read ${key}`, error);
      return fallback;
    }
  }

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status-banner${type ? ` ${type}` : ''}`;
  }

  function formatDate(value) {
    if (!value) return 'just now';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString();
  }

  function localProjects() {
    const value = readJson(PROJECT_INDEX_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function localDevices() {
    const value = readJson(DEVICE_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function writeDevices(devices) {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(devices));
  }

  async function renderProjects() {
    let cloud = [];
    if (currentUser) {
      try { cloud = await window.ShowduinoFirebase.listProjects(); }
      catch (error) { console.warn('[HauntSync] Cloud projects unavailable', error); }
    }

    const cloudIds = new Set(cloud.map((project) => project.id));
    const local = localProjects().filter((project) => !cloudIds.has(project.id));
    const projects = [
      ...cloud.map((project) => ({ ...project, source: 'firebase' })),
      ...local.map((project) => ({ ...project, source: 'local' }))
    ];

    elements.projectCount.textContent = String(projects.length);
    elements.projectList.innerHTML = '';
    if (!projects.length) {
      elements.projectList.innerHTML = '<div class="empty-state">No shows yet. Build one in Studio and it will appear here.</div>';
      return;
    }

    projects.slice(0, 8).forEach((project) => {
      const item = document.createElement('article');
      item.className = 'workspace-item';
      const badge = project.source === 'firebase' ? 'FIREBASE' : 'LOCAL';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(project.name || 'Untitled Show')}</strong>
          <span class="muted">${escapeHtml(formatDate(project.updatedAt))}</span>
        </div>
        <div class="button-row">
          <span class="badge">${badge}</span>
          <button class="btn secondary" type="button" data-open-project="${escapeHtml(project.id)}" data-source="${project.source}">Open</button>
          ${project.source === 'local' ? `<button class="btn secondary" type="button" data-export-project="${escapeHtml(project.id)}">Export</button>` : ''}
        </div>`;
      elements.projectList.appendChild(item);
    });
  }

  function exportProject(projectId) {
    const raw = localStorage.getItem(`${PROJECT_DATA_PREFIX}${projectId}`);
    if (!raw) {
      setStatus('That local project could not be found.', 'error');
      return;
    }
    const project = JSON.parse(raw);
    const name = project.project?.name || 'showduino-project';
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-z0-9-_]+/gi, '_')}.shdo`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${name}.`, 'success');
  }

  function openProject(projectId, source) {
    if (source === 'firebase') sessionStorage.setItem('showduino_open_cloud_project', projectId);
    else sessionStorage.setItem('showduino_open_local_project', projectId);
    window.location.href = 'studio.html';
  }

  async function renderDevices() {
    let cloud = [];
    if (currentUser) {
      try { cloud = await window.ShowduinoFirebase.listDevices(); }
      catch (error) { console.warn('[HauntSync] Cloud devices unavailable', error); }
    }
    const cloudIds = new Set(cloud.map((device) => device.id));
    const local = localDevices().filter((device) => !cloudIds.has(device.id));
    const devices = [...cloud.map((device) => ({ ...device, source: 'firebase' })), ...local.map((device) => ({ ...device, source: 'local' }))];

    elements.deviceCount.textContent = String(devices.length);
    elements.deviceList.innerHTML = '';
    if (!devices.length) {
      elements.deviceList.innerHTML = '<div class="empty-state">No hardware registered yet.</div>';
      return;
    }

    devices.slice(0, 8).forEach((device) => {
      const item = document.createElement('article');
      item.className = 'workspace-item';
      item.innerHTML = `
        <div><strong>${escapeHtml(device.name || 'Showduino device')}</strong><span class="muted">${escapeHtml(device.type || 'Device')} · ${escapeHtml(device.identifier || '')}</span></div>
        <div class="button-row"><span class="badge">${device.source === 'firebase' ? 'FIREBASE' : 'LOCAL'}</span><button class="btn secondary" type="button" data-remove-device="${escapeHtml(device.id)}">Remove</button></div>`;
      elements.deviceList.appendChild(item);
    });
  }

  async function addDevice(event) {
    event.preventDefault();
    const device = {
      id: window.crypto?.randomUUID?.() || `device_${Date.now()}`,
      name: elements.deviceName.value.trim(),
      type: elements.deviceType.value,
      identifier: elements.deviceIdentifier.value.trim(),
      createdAt: new Date().toISOString()
    };
    if (!device.name || !device.identifier) return;

    const devices = localDevices();
    devices.unshift(device);
    writeDevices(devices);
    if (currentUser) {
      try { await window.ShowduinoFirebase.saveDevice(device); }
      catch (error) { setStatus(`Saved locally, but Firebase device sync failed: ${error.message}`, 'error'); }
    }
    elements.deviceForm.reset();
    await renderDevices();
    setStatus(`Registered ${device.name}.`, 'success');
  }

  async function removeDevice(deviceId) {
    writeDevices(localDevices().filter((device) => device.id !== deviceId));
    if (currentUser) {
      try { await window.ShowduinoFirebase.deleteDevice(deviceId); }
      catch (error) { console.warn('[HauntSync] Firebase device removal', error); }
    }
    await renderDevices();
    setStatus('Device removed.', 'success');
  }

  function renderComments(postId, comments) {
    const container = document.querySelector(`[data-replies-for="${CSS.escape(postId)}"]`);
    if (!container) return;
    const list = container.querySelector('.reply-list');
    list.innerHTML = '';
    if (!comments.length) list.innerHTML = '<div class="muted">No replies yet.</div>';
    comments.forEach((comment) => {
      const reply = document.createElement('div');
      reply.className = 'reply';
      reply.innerHTML = `<div class="reply-meta"><strong>${escapeHtml(comment.authorName || 'Creator')}</strong> · ${escapeHtml(formatDate(comment.createdAt))}</div><div>${escapeHtml(comment.content)}</div>`;
      list.appendChild(reply);
    });
  }

  function openReplies(postId) {
    const container = document.querySelector(`[data-replies-for="${CSS.escape(postId)}"]`);
    if (!container) return;
    const isHidden = container.hidden;
    container.hidden = !isHidden;
    if (!isHidden || replySubscriptions.has(postId)) return;
    const unsubscribe = window.ShowduinoFirebase.listenComments(postId, (comments) => renderComments(postId, comments));
    replySubscriptions.set(postId, unsubscribe);
  }

  function renderCommunity(posts) {
    currentPosts = posts;
    elements.communityCount.textContent = String(posts.length);
    elements.communityFeed.innerHTML = '';
    if (!posts.length) {
      elements.communityFeed.innerHTML = '<div class="card empty-state"><h3>Be the first post in the new HauntSync feed.</h3><p>The Firebase community is ready for build logs, show ideas, questions and practical FX nonsense.</p></div>';
      return;
    }

    posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'post-card';
      const ownPost = currentUser && post.authorId === currentUser.uid;
      card.innerHTML = `
        <div class="post-meta"><span class="badge">${escapeHtml(post.category || 'General')}</span><strong>${escapeHtml(post.authorName || 'Showduino Creator')}</strong><span>${escapeHtml(formatDate(post.createdAt))}</span></div>
        <h3>${escapeHtml(post.title || 'Untitled post')}</h3>
        <div class="post-body">${escapeHtml(post.content || '')}</div>
        <div class="post-actions">
          <button class="btn secondary" type="button" data-toggle-replies="${escapeHtml(post.id)}">Replies</button>
          ${ownPost ? `<button class="btn secondary" type="button" data-delete-post="${escapeHtml(post.id)}">Delete</button>` : ''}
        </div>
        <div class="replies" data-replies-for="${escapeHtml(post.id)}" hidden>
          <div class="reply-list"><div class="muted">Loading replies…</div></div>
          ${currentUser ? `<form class="reply-form" data-reply-form="${escapeHtml(post.id)}"><textarea class="form-control" rows="2" maxlength="2500" placeholder="Reply to this post…" required></textarea><div><button class="btn secondary" type="submit">Reply</button></div></form>` : '<a class="btn secondary" href="account.html">Sign in to reply</a>'}
        </div>`;
      elements.communityFeed.appendChild(card);
    });
  }

  async function createCommunityPost(event) {
    event.preventDefault();
    setStatus('Posting to HauntSync…');
    try {
      await window.ShowduinoFirebase.createPost({
        title: elements.postTitle.value,
        category: elements.postCategory.value,
        content: elements.postContent.value
      });
      elements.postForm.reset();
      setStatus('Posted to HauntSync.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function handleCommunityClick(event) {
    const replyButton = event.target.closest('[data-toggle-replies]');
    if (replyButton) {
      openReplies(replyButton.dataset.toggleReplies);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-post]');
    if (deleteButton && window.confirm('Delete this HauntSync post?')) {
      try { await window.ShowduinoFirebase.deletePost(deleteButton.dataset.deletePost); }
      catch (error) { setStatus(error.message, 'error'); }
    }
  }

  async function handleCommunitySubmit(event) {
    const form = event.target.closest('[data-reply-form]');
    if (!form) return;
    event.preventDefault();
    const textarea = form.querySelector('textarea');
    try {
      await window.ShowduinoFirebase.addComment(form.dataset.replyForm, textarea.value);
      textarea.value = '';
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function updateAccountUi(user) {
    currentUser = user;
    if (user) {
      let displayName = user.displayName || 'Showduino Creator';
      try {
        const profile = await window.ShowduinoFirebase.getProfile();
        if (profile?.displayName) displayName = profile.displayName;
      } catch (_) {}
      elements.accountName.textContent = displayName;
      elements.accountEmail.textContent = user.email || 'Signed in';
      elements.accountLink.textContent = 'Manage account';
      elements.communityAccountLink.textContent = 'Your Showduino ID';
      elements.postForm.hidden = false;
      setStatus('HauntSync is connected to Firebase. Community, projects and devices are live.', 'success');
    } else {
      elements.accountName.textContent = 'Guest creator';
      elements.accountEmail.textContent = 'Read the community now. Sign in to post, reply and sync your Showduino workspace.';
      elements.accountLink.textContent = 'Sign in / Join';
      elements.communityAccountLink.textContent = 'Sign in to post';
      elements.postForm.hidden = true;
      setStatus('HauntSync community is live. Sign in when you want to post or sync a project.');
    }
    renderCommunity(currentPosts);
    await Promise.all([renderProjects(), renderDevices()]);
  }

  function handleProjectActions(event) {
    const openButton = event.target.closest('[data-open-project]');
    if (openButton) openProject(openButton.dataset.openProject, openButton.dataset.source);
    const exportButton = event.target.closest('[data-export-project]');
    if (exportButton) exportProject(exportButton.dataset.exportProject);
  }

  async function handleDeviceActions(event) {
    const removeButton = event.target.closest('[data-remove-device]');
    if (removeButton) await removeDevice(removeButton.dataset.removeDevice);
  }

  function initialise() {
    elements.status = byId('hauntsync-status');
    elements.communityFeed = byId('community-feed');
    elements.communityCount = byId('community-count');
    elements.projectList = byId('project-list');
    elements.deviceList = byId('device-list');
    elements.projectCount = byId('project-count');
    elements.deviceCount = byId('device-count');
    elements.accountName = byId('account-name');
    elements.accountEmail = byId('account-email');
    elements.accountLink = byId('account-link');
    elements.communityAccountLink = byId('community-account-link');
    elements.postForm = byId('community-post-form');
    elements.postTitle = byId('community-post-title');
    elements.postCategory = byId('community-post-category');
    elements.postContent = byId('community-post-content');
    elements.deviceForm = byId('device-form');
    elements.deviceName = byId('device-name');
    elements.deviceType = byId('device-type');
    elements.deviceIdentifier = byId('device-identifier');

    elements.postForm.addEventListener('submit', createCommunityPost);
    elements.communityFeed.addEventListener('click', handleCommunityClick);
    elements.communityFeed.addEventListener('submit', handleCommunitySubmit);
    elements.projectList.addEventListener('click', handleProjectActions);
    elements.deviceList.addEventListener('click', handleDeviceActions);
    elements.deviceForm.addEventListener('submit', addDevice);

    renderProjects();
    renderDevices();

    if (!window.ShowduinoFirebase?.enabled?.()) {
      setStatus('Firebase is not configured. Local projects and devices still work.', 'error');
      return;
    }

    window.ShowduinoFirebase.listenPosts((posts) => renderCommunity(posts));
    window.ShowduinoFirebase.onAuthChanged(updateAccountUi);

    window.addEventListener('storage', () => {
      renderProjects();
      renderDevices();
    });
  }

  window.addEventListener('beforeunload', () => {
    replySubscriptions.forEach((unsubscribe) => unsubscribe());
    replySubscriptions.clear();
  });
  document.addEventListener('DOMContentLoaded', initialise);
})();
