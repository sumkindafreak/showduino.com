/* global ShowduinoSupabase */
(function () {
  'use strict';

  const PROJECT_INDEX_KEY = 'showduino_local_projects';
  const PROJECT_DATA_PREFIX = 'showduino_project_';
  const DEVICE_KEY = 'showduino_registered_devices';
  const elements = {};
  const replySubscriptions = new Map();
  const commentCache = new Map();
  let currentUser = null;
  let currentPosts = [];
  let postsUnsubscribe = null;

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
      const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return value;
    } catch (error) {
      console.warn(`[HauntSync] Could not read ${key}`, error);
      return fallback;
    }
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

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status-banner${type ? ` ${type}` : ''}`;
  }

  function formatDate(value) {
    if (!value) return 'just now';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString();
  }

  function categoryName(value) {
    const labels = {
      'build-log': 'Build log',
      'show-design': 'Show design',
      'code-control': 'Code & control',
      'props-fx': 'Props & FX',
      'lighting-audio': 'Lighting & audio',
      'help-wanted': 'Help wanted',
      showcase: 'Showcase',
      general: 'General'
    };
    return labels[value] || 'General';
  }

  async function renderProjects() {
    let cloud = [];
    if (currentUser) {
      try { cloud = await window.ShowduinoSupabase.listProjects(); }
      catch (error) { console.warn('[HauntSync] Could not load cloud projects', error); }
    }

    const cloudIds = new Set(cloud.map((project) => project.id));
    const local = localProjects().filter((project) => !cloudIds.has(project.id));
    const projects = [
      ...cloud.map((project) => ({ ...project, source: 'supabase', updatedAt: project.updated_at })),
      ...local.map((project) => ({ ...project, source: 'local' }))
    ];

    elements.projectCount.textContent = String(projects.length);
    elements.projectList.innerHTML = '';
    if (!projects.length) {
      elements.projectList.innerHTML = '<div class="empty-state">No shows yet. Build one in Studio and it will appear here.</div>';
      return;
    }

    projects.slice(0, 10).forEach((project) => {
      const item = document.createElement('article');
      item.className = 'workspace-item';
      const source = project.source === 'supabase' ? 'SUPABASE' : 'LOCAL';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(project.name || 'Untitled Show')}</strong>
          <span class="muted">Updated ${escapeHtml(formatDate(project.updatedAt || project.updated_at))}</span>
        </div>
        <div class="section-actions">
          <span class="badge">${source}</span>
          <button class="btn secondary" type="button" data-open-project="${escapeHtml(project.id)}" data-project-source="${project.source}">Open</button>
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

  function openProject(id, source) {
    if (source === 'supabase') sessionStorage.setItem('showduino_open_cloud_project', id);
    else sessionStorage.setItem('showduino_open_local_project', id);
    window.location.href = 'studio.html';
  }

  async function renderDevices() {
    let cloud = [];
    if (currentUser) {
      try { cloud = await window.ShowduinoSupabase.listDevices(); }
      catch (error) { console.warn('[HauntSync] Could not load cloud devices', error); }
    }

    const cloudIds = new Set(cloud.map((device) => device.id));
    const local = localDevices().filter((device) => !cloudIds.has(device.id));
    const devices = [
      ...cloud.map((device) => ({ ...device, type: device.device_type, source: 'supabase' })),
      ...local.map((device) => ({ ...device, source: 'local' }))
    ];

    elements.deviceCount.textContent = String(devices.length);
    elements.deviceList.innerHTML = '';
    if (!devices.length) {
      elements.deviceList.innerHTML = '<div class="empty-state">No hardware registered yet.</div>';
      return;
    }

    devices.slice(0, 10).forEach((device) => {
      const item = document.createElement('article');
      item.className = 'workspace-item';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(device.name || 'Showduino device')}</strong>
          <span class="muted">${escapeHtml(device.type || device.device_type || 'Device')} · ${escapeHtml(device.identifier || '')}</span>
        </div>
        <div class="section-actions">
          <span class="badge">${device.source === 'supabase' ? 'SUPABASE' : 'LOCAL'}</span>
          <button class="btn secondary" type="button" data-remove-device="${escapeHtml(device.id)}">Remove</button>
        </div>`;
      elements.deviceList.appendChild(item);
    });
  }

  async function addDevice(event) {
    event.preventDefault();
    const device = {
      id: window.crypto?.randomUUID?.() || '',
      name: elements.deviceName.value.trim(),
      type: elements.deviceType.value,
      identifier: elements.deviceIdentifier.value.trim(),
      createdAt: new Date().toISOString()
    };
    if (!device.id) {
      setStatus('This browser cannot create a secure device identifier.', 'error');
      return;
    }
    if (!device.name || !device.identifier) return;

    const devices = localDevices().filter((item) => item.id !== device.id);
    devices.unshift(device);
    writeDevices(devices);

    if (currentUser) {
      try { await window.ShowduinoSupabase.saveDevice(device); }
      catch (error) {
        setStatus(`Device saved locally, but Supabase sync failed: ${error.message}`, 'error');
        await renderDevices();
        return;
      }
    }

    elements.deviceForm.reset();
    await renderDevices();
    setStatus(`Registered ${device.name}.`, 'success');
  }

  async function removeDevice(deviceId) {
    writeDevices(localDevices().filter((device) => device.id !== deviceId));
    if (currentUser) {
      try { await window.ShowduinoSupabase.deleteDevice(deviceId); }
      catch (error) { console.warn('[HauntSync] Cloud device removal failed', error); }
    }
    await renderDevices();
    setStatus('Device removed.', 'success');
  }

  function renderComments(postId, comments) {
    commentCache.set(postId, comments);
    const container = document.querySelector(`[data-replies-for="${postId}"]`);
    if (!container) return;
    const list = container.querySelector('.reply-list');
    list.innerHTML = '';
    if (!comments.length) {
      list.innerHTML = '<div class="muted">No replies yet.</div>';
      return;
    }
    comments.forEach((comment) => {
      const ownReply = currentUser && comment.author_id === currentUser.id;
      const reply = document.createElement('div');
      reply.className = 'reply';
      reply.innerHTML = `
        <div class="reply-meta"><strong>${escapeHtml(comment.author_name || 'Creator')}</strong> · ${escapeHtml(formatDate(comment.created_at))}</div>
        <div>${escapeHtml(comment.content)}</div>
        ${ownReply ? `<div class="post-actions"><button class="btn secondary" type="button" data-delete-comment="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(postId)}">Delete reply</button></div>` : ''}`;
      list.appendChild(reply);
    });
  }

  function openReplies(postId) {
    const container = document.querySelector(`[data-replies-for="${postId}"]`);
    if (!container) return;
    container.hidden = !container.hidden;
    if (container.hidden) return;

    if (!replySubscriptions.has(postId)) {
      const unsubscribe = window.ShowduinoSupabase.subscribeComments(postId, (comments) => renderComments(postId, comments));
      replySubscriptions.set(postId, unsubscribe);
    } else if (commentCache.has(postId)) {
      renderComments(postId, commentCache.get(postId));
    }
  }

  function renderCommunity(posts) {
    currentPosts = posts;
    elements.communityCount.textContent = String(posts.length);
    elements.communityFeed.innerHTML = '';

    if (!posts.length) {
      elements.communityFeed.innerHTML = '<div class="card empty-state"><h3>No posts here yet.</h3><p>Someone has to be the first person to show everybody what they are building.</p></div>';
      return;
    }

    posts.forEach((post) => {
      const ownPost = currentUser && post.author_id === currentUser.id;
      const repliesOpen = replySubscriptions.has(post.id);
      const card = document.createElement('article');
      card.className = 'post-card';
      card.innerHTML = `
        <div class="post-meta">
          <span class="badge">${escapeHtml(categoryName(post.category))}</span>
          <strong>${escapeHtml(post.author_name || 'Showduino Creator')}</strong>
          ${post.author_haunt ? `<span>${escapeHtml(post.author_haunt)}</span>` : ''}
          <span>${escapeHtml(formatDate(post.created_at))}</span>
        </div>
        <h3>${escapeHtml(post.title || 'Untitled post')}</h3>
        <div class="post-body">${escapeHtml(post.content || '')}</div>
        <div class="post-actions">
          <button class="btn secondary" type="button" data-toggle-replies="${escapeHtml(post.id)}">Replies</button>
          ${ownPost ? `<button class="btn secondary" type="button" data-delete-post="${escapeHtml(post.id)}">Delete post</button>` : ''}
        </div>
        <div class="replies" data-replies-for="${escapeHtml(post.id)}" ${repliesOpen ? '' : 'hidden'}>
          <div class="reply-list"><div class="muted">Loading replies…</div></div>
          ${currentUser ? `<form class="reply-form" data-reply-form="${escapeHtml(post.id)}"><textarea class="form-control" rows="2" maxlength="2500" placeholder="Reply to this post…" required></textarea><div><button class="btn secondary" type="submit">Reply</button></div></form>` : '<a class="btn secondary" href="account.html">Sign in to reply</a>'}
        </div>`;
      elements.communityFeed.appendChild(card);
      if (repliesOpen && commentCache.has(post.id)) renderComments(post.id, commentCache.get(post.id));
    });
  }

  function restartPostSubscription() {
    if (postsUnsubscribe) postsUnsubscribe();
    const category = elements.categoryFilter.value;
    postsUnsubscribe = window.ShowduinoSupabase.subscribePosts((posts) => renderCommunity(posts), { category, limit: 50 });
  }

  async function createCommunityPost(event) {
    event.preventDefault();
    setStatus('Posting to HauntSync…');
    try {
      await window.ShowduinoSupabase.createPost({
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

    const deletePost = event.target.closest('[data-delete-post]');
    if (deletePost && window.confirm('Delete this HauntSync post?')) {
      try { await window.ShowduinoSupabase.deletePost(deletePost.dataset.deletePost); }
      catch (error) { setStatus(error.message, 'error'); }
      return;
    }

    const deleteComment = event.target.closest('[data-delete-comment]');
    if (deleteComment && window.confirm('Delete this reply?')) {
      try { await window.ShowduinoSupabase.deleteComment(deleteComment.dataset.deleteComment); }
      catch (error) { setStatus(error.message, 'error'); }
    }
  }

  async function handleCommunitySubmit(event) {
    const form = event.target.closest('[data-reply-form]');
    if (!form) return;
    event.preventDefault();
    const textarea = form.querySelector('textarea');
    try {
      await window.ShowduinoSupabase.addComment(form.dataset.replyForm, textarea.value);
      textarea.value = '';
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function updateAccountUi(user) {
    currentUser = user;
    if (user) {
      let displayName = user.user_metadata?.display_name || 'Showduino Creator';
      let hauntName = '';
      try {
        const profile = await window.ShowduinoSupabase.getProfile();
        if (profile?.display_name) displayName = profile.display_name;
        if (profile?.haunt_name) hauntName = profile.haunt_name;
      } catch (error) {
        console.warn('[HauntSync] Profile lookup failed', error);
      }
      elements.accountName.textContent = displayName;
      elements.accountEmail.textContent = hauntName || user.email || 'Signed in';
      elements.accountLink.textContent = 'Manage account';
      elements.communityAccountLink.textContent = 'Your Showduino ID';
      elements.postForm.hidden = false;
      setStatus('HauntSync is connected to Supabase. Community and cloud workspace are live.', 'success');
    } else {
      elements.accountName.textContent = 'Guest creator';
      elements.accountEmail.textContent = 'Read the community now. Sign in when you want to post, reply or sync your Showduino workspace.';
      elements.accountLink.textContent = 'Sign in / Join';
      elements.communityAccountLink.textContent = 'Join HauntSync';
      elements.postForm.hidden = true;
      setStatus('HauntSync is live. Sign in when you want to join the conversation.');
    }
    renderCommunity(currentPosts);
    await Promise.all([renderProjects(), renderDevices()]);
  }

  function handleProjectActions(event) {
    const openButton = event.target.closest('[data-open-project]');
    if (openButton) {
      openProject(openButton.dataset.openProject, openButton.dataset.projectSource);
      return;
    }
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
    elements.categoryFilter = byId('community-category-filter');
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
    elements.categoryFilter.addEventListener('change', restartPostSubscription);
    elements.projectList.addEventListener('click', handleProjectActions);
    elements.deviceList.addEventListener('click', handleDeviceActions);
    elements.deviceForm.addEventListener('submit', addDevice);

    renderProjects();
    renderDevices();

    if (!window.ShowduinoSupabase?.enabled?.()) {
      setStatus('Supabase is not configured. Local projects and devices still work.', 'error');
      elements.communityFeed.innerHTML = '<div class="card empty-state">HauntSync community services are temporarily unavailable.</div>';
      return;
    }

    restartPostSubscription();
    window.ShowduinoSupabase.onAuthChanged(updateAccountUi);

    window.addEventListener('storage', () => {
      renderProjects();
      renderDevices();
    });
  }

  window.addEventListener('beforeunload', () => {
    if (postsUnsubscribe) postsUnsubscribe();
    replySubscriptions.forEach((unsubscribe) => unsubscribe());
    replySubscriptions.clear();
  });

  document.addEventListener('DOMContentLoaded', initialise);
})();
