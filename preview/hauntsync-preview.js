/* global SHOWDUINO_CONFIG, supabase */
(function () {
  'use strict';

  const elements = {};
  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let realtimeChannel = null;
  const openReplies = new Set();

  const categories = {
    general: 'General',
    'build-log': 'Build log',
    'show-design': 'Show design',
    'code-control': 'Code & control',
    'props-fx': 'Props & FX',
    'lighting-audio': 'Lighting & audio',
    'help-wanted': 'Help wanted',
    showcase: 'Showcase'
  };

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value) {
    if (!value) return 'just now';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString();
  }

  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status-banner${type ? ` ${type}` : ''}`;
  }

  function setRealtimeState(state) {
    elements.realtimeDot.className = `preview-dot${state === 'live' ? ' live' : state === 'error' ? ' error' : ''}`;
    elements.realtimeText.textContent = state === 'live' ? 'Realtime connected' : state === 'error' ? 'Realtime error' : 'Connecting Realtime…';
  }

  function config() {
    const cfg = window.SHOWDUINO_CONFIG;
    if (!cfg?.features?.supabase || !cfg?.supabase?.url || !cfg?.supabase?.publishableKey) {
      throw new Error('Supabase is not configured in config/runtime-config.js.');
    }
    return cfg.supabase;
  }

  function getClient() {
    if (client) return client;
    if (!window.supabase?.createClient) throw new Error('Supabase browser client did not load.');
    const cfg = config();
    client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  async function ensureProfile(user) {
    if (!user) return null;
    const db = getClient();
    const { data, error } = await db
      .from('profiles')
      .select('id,display_name,haunt_name,bio,created_at,updated_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;

    const displayName = String(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Showduino Creator').slice(0, 60);
    const { data: created, error: createError } = await db
      .from('profiles')
      .upsert({ id: user.id, display_name: displayName }, { onConflict: 'id' })
      .select('id,display_name,haunt_name,bio,created_at,updated_at')
      .single();
    if (createError) throw createError;
    return created;
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!currentUser) return;
    const displayName = elements.profileName.value.trim().slice(0, 60);
    const hauntName = elements.profileHaunt.value.trim().slice(0, 100) || null;
    const bio = elements.profileBio.value.trim().slice(0, 500) || null;
    if (!displayName) {
      setStatus('Display name cannot be empty.', 'error');
      return;
    }

    setStatus('Saving HauntSync identity…');
    const db = getClient();
    const { error: authError } = await db.auth.updateUser({ data: { display_name: displayName } });
    if (authError) throw authError;
    const { data, error } = await db
      .from('profiles')
      .upsert({ id: currentUser.id, display_name: displayName, haunt_name: hauntName, bio }, { onConflict: 'id' })
      .select('id,display_name,haunt_name,bio,created_at,updated_at')
      .single();
    if (error) throw error;
    currentProfile = data;
    renderAuth();
    setStatus('HauntSync identity saved.', 'success');
  }

  async function signIn(event) {
    event.preventDefault();
    setStatus('Signing in…');
    const { error } = await getClient().auth.signInWithPassword({
      email: elements.loginEmail.value.trim(),
      password: elements.loginPassword.value
    });
    if (error) {
      setStatus(error.message, 'error');
      return;
    }
    elements.loginPassword.value = '';
  }

  async function signOut() {
    setStatus('Signing out…');
    const { error } = await getClient().auth.signOut();
    if (error) setStatus(error.message, 'error');
  }

  function renderAuth() {
    const signedIn = Boolean(currentUser);
    elements.loginPanel.hidden = signedIn;
    elements.profilePanel.hidden = !signedIn;
    elements.composer.hidden = !signedIn;
    elements.deviceForm.hidden = !signedIn;

    if (!signedIn) {
      elements.identityName.textContent = 'Guest creator';
      elements.identityDetail.textContent = 'Public community is readable. Sign in to post, reply, sync devices and view cloud projects.';
      return;
    }

    const name = currentProfile?.display_name || currentUser.user_metadata?.display_name || 'Showduino Creator';
    const haunt = currentProfile?.haunt_name || '';
    elements.identityName.textContent = name;
    elements.identityDetail.textContent = haunt || currentUser.email || 'Signed in';
    elements.profileName.value = name;
    elements.profileHaunt.value = haunt;
    elements.profileBio.value = currentProfile?.bio || '';
    elements.profileEmail.textContent = currentUser.email || '';
  }

  async function refreshAuth(user) {
    currentUser = user || null;
    currentProfile = null;
    if (currentUser) {
      try { currentProfile = await ensureProfile(currentUser); }
      catch (error) { setStatus(`Signed in, but profile could not load: ${error.message}`, 'error'); }
    }
    renderAuth();
    await Promise.all([refreshProjects(), refreshDevices(), refreshPosts()]);
    setStatus(currentUser ? 'Signed in. HauntSync preview is connected to production Supabase.' : 'Preview connected. Sign in when you want to write to Supabase.', 'success');
  }

  async function refreshPosts() {
    const category = elements.categoryFilter.value;
    let query = getClient()
      .from('community_posts')
      .select('id,author_id,author_name,author_haunt,title,content,category,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) {
      elements.feed.innerHTML = `<div class="preview-empty">Could not load community posts: ${escapeHtml(error.message)}</div>`;
      return;
    }
    const posts = data || [];
    elements.postCount.textContent = String(posts.length);
    renderPosts(posts);
  }

  function renderPosts(posts) {
    elements.feed.innerHTML = '';
    if (!posts.length) {
      elements.feed.innerHTML = '<div class="preview-empty">No posts yet. This is a very good opportunity to create HauntSync post #1.</div>';
      return;
    }

    posts.forEach((post) => {
      const own = currentUser && post.author_id === currentUser.id;
      const article = document.createElement('article');
      article.className = 'preview-post';
      article.innerHTML = `
        <div class="preview-meta">
          <span class="badge">${escapeHtml(categories[post.category] || 'General')}</span>
          <strong>${escapeHtml(post.author_name || 'Showduino Creator')}</strong>
          ${post.author_haunt ? `<span>${escapeHtml(post.author_haunt)}</span>` : ''}
          <span>${escapeHtml(formatDate(post.created_at))}</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <div class="preview-post-body">${escapeHtml(post.content)}</div>
        <div class="preview-post-actions">
          <button class="btn secondary" type="button" data-replies="${post.id}">Replies</button>
          ${own ? `<button class="btn secondary preview-danger" type="button" data-delete-post="${post.id}">Delete post</button>` : ''}
        </div>
        <div id="replies-${post.id}" class="preview-replies" hidden>
          <div class="preview-reply-list"><div class="muted">Loading replies…</div></div>
          ${currentUser ? `<form data-reply-form="${post.id}"><div class="form-group"><textarea class="form-control" rows="2" maxlength="2500" placeholder="Reply…" required></textarea></div><button class="btn secondary" type="submit">Post reply</button></form>` : '<a class="btn secondary" href="#account">Sign in to reply</a>'}
        </div>`;
      elements.feed.appendChild(article);
      if (openReplies.has(post.id)) {
        const box = byId(`replies-${post.id}`);
        if (box) box.hidden = false;
        refreshReplies(post.id);
      }
    });
  }

  async function createPost(event) {
    event.preventDefault();
    if (!currentUser) return;
    const title = elements.postTitle.value.trim().slice(0, 120);
    const content = elements.postContent.value.trim().slice(0, 5000);
    if (!title || !content) return;
    const authorName = currentProfile?.display_name || currentUser.user_metadata?.display_name || 'Showduino Creator';
    const authorHaunt = currentProfile?.haunt_name || null;
    setStatus('Writing post to Supabase…');
    const { error } = await getClient().from('community_posts').insert({
      author_id: currentUser.id,
      author_name: authorName,
      author_haunt: authorHaunt,
      title,
      content,
      category: elements.postCategory.value
    });
    if (error) {
      setStatus(error.message, 'error');
      return;
    }
    elements.postForm.reset();
    setStatus('Post created in production Supabase.', 'success');
    await refreshPosts();
  }

  async function deletePost(id) {
    if (!currentUser || !window.confirm('Delete this test/community post?')) return;
    const { error } = await getClient().from('community_posts').delete().eq('id', id).eq('author_id', currentUser.id);
    if (error) setStatus(error.message, 'error');
    else setStatus('Post deleted.', 'success');
  }

  async function refreshReplies(postId) {
    const box = byId(`replies-${postId}`);
    if (!box || box.hidden) return;
    const list = box.querySelector('.preview-reply-list');
    const { data, error } = await getClient()
      .from('community_comments')
      .select('id,post_id,author_id,author_name,content,created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) {
      list.innerHTML = `<div class="muted">Could not load replies: ${escapeHtml(error.message)}</div>`;
      return;
    }
    const comments = data || [];
    list.innerHTML = comments.length ? '' : '<div class="muted">No replies yet.</div>';
    comments.forEach((comment) => {
      const own = currentUser && comment.author_id === currentUser.id;
      const reply = document.createElement('div');
      reply.className = 'preview-reply';
      reply.innerHTML = `<div class="preview-reply-meta"><strong>${escapeHtml(comment.author_name || 'Creator')}</strong> · ${escapeHtml(formatDate(comment.created_at))}</div><div>${escapeHtml(comment.content)}</div>${own ? `<div class="preview-post-actions"><button class="btn secondary preview-danger" type="button" data-delete-comment="${comment.id}" data-post="${postId}">Delete reply</button></div>` : ''}`;
      list.appendChild(reply);
    });
  }

  async function addReply(form) {
    if (!currentUser) return;
    const postId = form.dataset.replyForm;
    const textarea = form.querySelector('textarea');
    const content = textarea.value.trim().slice(0, 2500);
    if (!content) return;
    const authorName = currentProfile?.display_name || currentUser.user_metadata?.display_name || 'Showduino Creator';
    const { error } = await getClient().from('community_comments').insert({
      post_id: postId,
      author_id: currentUser.id,
      author_name: authorName,
      content
    });
    if (error) {
      setStatus(error.message, 'error');
      return;
    }
    textarea.value = '';
    setStatus('Reply written to Supabase.', 'success');
    await refreshReplies(postId);
  }

  async function deleteComment(id, postId) {
    if (!currentUser || !window.confirm('Delete this reply?')) return;
    const { error } = await getClient().from('community_comments').delete().eq('id', id).eq('author_id', currentUser.id);
    if (error) setStatus(error.message, 'error');
    else await refreshReplies(postId);
  }

  async function refreshProjects() {
    elements.projectList.innerHTML = '';
    if (!currentUser) {
      elements.projectCount.textContent = '0';
      elements.projectList.innerHTML = '<div class="preview-empty">Sign in to query your private cloud projects.</div>';
      return;
    }
    const { data, error } = await getClient()
      .from('projects')
      .select('id,name,format,format_version,created_at,updated_at')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending: false });
    if (error) {
      elements.projectList.innerHTML = `<div class="preview-empty">${escapeHtml(error.message)}</div>`;
      return;
    }
    const projects = data || [];
    elements.projectCount.textContent = String(projects.length);
    if (!projects.length) {
      elements.projectList.innerHTML = '<div class="preview-empty">No Supabase projects yet. Save a show from Studio, then hit Refresh.</div>';
      return;
    }
    projects.forEach((project) => {
      const item = document.createElement('div');
      item.className = 'preview-list-item';
      item.innerHTML = `<div><strong>${escapeHtml(project.name || 'Untitled Show')}</strong><span class="muted">Updated ${escapeHtml(formatDate(project.updated_at))}</span></div><button class="btn secondary" type="button" data-open-cloud="${project.id}">Open in Studio</button>`;
      elements.projectList.appendChild(item);
    });
  }

  function openCloudProject(id) {
    sessionStorage.setItem('showduino_open_cloud_project', id);
    window.location.href = '../studio.html';
  }

  async function refreshDevices() {
    elements.deviceList.innerHTML = '';
    if (!currentUser) {
      elements.deviceCount.textContent = '0';
      elements.deviceList.innerHTML = '<div class="preview-empty">Sign in to query your private device inventory.</div>';
      return;
    }
    const { data, error } = await getClient()
      .from('devices')
      .select('id,name,device_type,identifier,notes,created_at,updated_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      elements.deviceList.innerHTML = `<div class="preview-empty">${escapeHtml(error.message)}</div>`;
      return;
    }
    const devices = data || [];
    elements.deviceCount.textContent = String(devices.length);
    if (!devices.length) {
      elements.deviceList.innerHTML = '<div class="preview-empty">No Supabase devices registered yet.</div>';
      return;
    }
    devices.forEach((device) => {
      const item = document.createElement('div');
      item.className = 'preview-list-item';
      item.innerHTML = `<div><strong>${escapeHtml(device.name)}</strong><span class="muted">${escapeHtml(device.device_type)} · ${escapeHtml(device.identifier)}</span></div><button class="btn secondary preview-danger" type="button" data-delete-device="${device.id}">Remove</button>`;
      elements.deviceList.appendChild(item);
    });
  }

  async function addDevice(event) {
    event.preventDefault();
    if (!currentUser) return;
    if (!window.crypto?.randomUUID) {
      setStatus('This browser cannot create a secure device ID.', 'error');
      return;
    }
    const payload = {
      id: window.crypto.randomUUID(),
      user_id: currentUser.id,
      name: elements.deviceName.value.trim().slice(0, 60),
      device_type: elements.deviceType.value,
      identifier: elements.deviceIdentifier.value.trim().slice(0, 120)
    };
    if (!payload.name || !payload.identifier) return;
    const { error } = await getClient().from('devices').insert(payload);
    if (error) {
      setStatus(error.message, 'error');
      return;
    }
    elements.deviceForm.reset();
    setStatus('Device written to your private Supabase inventory.', 'success');
    await refreshDevices();
  }

  async function deleteDevice(id) {
    if (!currentUser || !window.confirm('Remove this test device?')) return;
    const { error } = await getClient().from('devices').delete().eq('id', id).eq('user_id', currentUser.id);
    if (error) setStatus(error.message, 'error');
    else await refreshDevices();
  }

  async function refreshAll() {
    setStatus('Refreshing production Supabase data…');
    await Promise.all([refreshPosts(), refreshProjects(), refreshDevices()]);
    openReplies.forEach((postId) => refreshReplies(postId));
    setStatus('Preview refreshed.', 'success');
  }

  function startRealtime() {
    if (realtimeChannel) getClient().removeChannel(realtimeChannel);
    setRealtimeState('connecting');
    realtimeChannel = getClient()
      .channel('hauntsync-preview-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, () => refreshPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_comments' }, () => openReplies.forEach((postId) => refreshReplies(postId)))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeState('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeState('error');
      });
  }

  function bindEvents() {
    elements.loginForm.addEventListener('submit', (event) => signIn(event).catch((error) => setStatus(error.message, 'error')));
    elements.signOutButton.addEventListener('click', () => signOut().catch((error) => setStatus(error.message, 'error')));
    elements.profileForm.addEventListener('submit', (event) => saveProfile(event).catch((error) => setStatus(error.message, 'error')));
    elements.postForm.addEventListener('submit', createPost);
    elements.deviceForm.addEventListener('submit', addDevice);
    elements.refreshButton.addEventListener('click', refreshAll);
    elements.categoryFilter.addEventListener('change', refreshPosts);

    elements.feed.addEventListener('click', async (event) => {
      const replyButton = event.target.closest('[data-replies]');
      if (replyButton) {
        const postId = replyButton.dataset.replies;
        const box = byId(`replies-${postId}`);
        if (!box) return;
        box.hidden = !box.hidden;
        if (!box.hidden) {
          openReplies.add(postId);
          await refreshReplies(postId);
        } else {
          openReplies.delete(postId);
        }
        return;
      }
      const postButton = event.target.closest('[data-delete-post]');
      if (postButton) await deletePost(postButton.dataset.deletePost);
      const commentButton = event.target.closest('[data-delete-comment]');
      if (commentButton) await deleteComment(commentButton.dataset.deleteComment, commentButton.dataset.post);
    });

    elements.feed.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-reply-form]');
      if (!form) return;
      event.preventDefault();
      await addReply(form);
    });

    elements.projectList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-cloud]');
      if (button) openCloudProject(button.dataset.openCloud);
    });

    elements.deviceList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-delete-device]');
      if (button) await deleteDevice(button.dataset.deleteDevice);
    });
  }

  async function initialise() {
    ['status','realtimeDot','realtimeText','identityName','identityDetail','loginPanel','loginForm','loginEmail','loginPassword','profilePanel','profileForm','profileName','profileHaunt','profileBio','profileEmail','signOutButton','composer','postForm','postTitle','postCategory','postContent','categoryFilter','feed','postCount','projectList','projectCount','deviceList','deviceCount','deviceForm','deviceName','deviceType','deviceIdentifier','refreshButton'].forEach((name) => {
      elements[name] = byId(name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`));
    });

    bindEvents();
    getClient();
    startRealtime();

    const { data } = await getClient().auth.getSession();
    await refreshAuth(data.session?.user || null);
    getClient().auth.onAuthStateChange(async (_event, session) => {
      if ((session?.user?.id || null) === (currentUser?.id || null) && session?.user) return;
      await refreshAuth(session?.user || null);
    });
  }

  document.addEventListener('DOMContentLoaded', () => initialise().catch((error) => {
    const status = byId('status');
    if (status) {
      status.textContent = `Preview failed to start: ${error.message}`;
      status.className = 'status-banner error';
    }
    console.error('[HauntSync Preview]', error);
  }));
})();
