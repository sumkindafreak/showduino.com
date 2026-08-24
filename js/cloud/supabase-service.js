/* global SHOWDUINO_CONFIG, supabase */
(function () {
  'use strict';

  const ACCOUNT_URL = 'https://show-duino.com/account.html';
  const CONFIRMATION_URL = `${ACCOUNT_URL}?confirmed=1`;
  let client = null;

  function config() {
    return window.SHOWDUINO_CONFIG || { features: {}, supabase: {} };
  }

  function enabled() {
    const cfg = config();
    return Boolean(
      cfg.features?.supabase &&
      cfg.features?.authentication &&
      cfg.supabase?.url &&
      cfg.supabase?.publishableKey &&
      window.supabase?.createClient
    );
  }

  function getClient() {
    if (!enabled()) throw new Error('Showduino cloud services are not configured.');
    if (!client) {
      const cfg = config().supabase;
      client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function createUuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    throw new Error('This browser cannot create secure project identifiers.');
  }

  async function upsertProfile(user, displayName) {
    if (!user) return null;
    const name = (displayName || user.user_metadata?.display_name || 'Showduino Creator').trim().slice(0, 60);
    const { data, error } = await getClient()
      .from('profiles')
      .upsert({ id: user.id, display_name: name, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function register(email, password, displayName) {
    const { data, error } = await getClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: CONFIRMATION_URL, data: { display_name: displayName } }
    });
    if (error) throw error;
    if (data.user && data.session) await upsertProfile(data.user, displayName);
    return data;
  }

  async function resendConfirmation(email) {
    const address = String(email || '').trim();
    if (!address) throw new Error('Enter the email address you used to sign up first.');
    const { data, error } = await getClient().auth.resend({
      type: 'signup', email: address, options: { emailRedirectTo: CONFIRMATION_URL }
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await upsertProfile(data.user);
    return data;
  }

  async function requestPasswordReset(email) {
    const { data, error } = await getClient().auth.resetPasswordForEmail(email, { redirectTo: ACCOUNT_URL });
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const { data, error } = await getClient().auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw error;
  }

  function onAuthChanged(callback) {
    if (!enabled()) {
      callback(null, 'DISABLED');
      return () => {};
    }
    const c = getClient();
    c.auth.getSession().then(({ data }) => callback(data.session?.user || null, 'INITIAL_SESSION'));
    const { data } = c.auth.onAuthStateChange((event, session) => callback(session?.user || null, event));
    return () => data.subscription.unsubscribe();
  }

  async function getCurrentUser() {
    if (!enabled()) return null;
    const { data, error } = await getClient().auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  async function getProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await getClient()
      .from('profiles')
      .select('id,display_name,haunt_name,bio,avatar_url,created_at,updated_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function updateProfile(values) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before updating your profile.');
    const payload = {
      id: user.id,
      display_name: String(values?.displayName || 'Showduino Creator').trim().slice(0, 60),
      haunt_name: String(values?.hauntName || '').trim().slice(0, 100) || null,
      bio: String(values?.bio || '').trim().slice(0, 500) || null,
      avatar_url: String(values?.avatarUrl || '').trim() || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await getClient().from('profiles').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  }

  function ensureProjectUuid(project) {
    project.project = project.project || {};
    if (!isUuid(project.project.id)) project.project.id = createUuid();
    return project.project.id;
  }

  async function saveProject(project) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to save this show to the cloud.');
    const id = ensureProjectUuid(project);
    const now = new Date().toISOString();
    project.project.updatedAt = now;
    const payload = {
      id,
      user_id: user.id,
      name: project.project.name || 'Untitled Show',
      format: project.package?.format || 'showduino-production',
      format_version: project.package?.version || 1,
      project_data: project,
      updated_at: now
    };
    const { data, error } = await getClient().from('projects').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  }

  async function listProjects() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await getClient()
      .from('projects')
      .select('id,name,format,format_version,created_at,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function loadProject(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to load cloud shows.');
    const { data, error } = await getClient().from('projects').select('project_data').eq('id', id).eq('user_id', user.id).single();
    if (error) throw error;
    return data.project_data;
  }

  async function deleteProject(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to delete cloud shows.');
    const { error } = await getClient().from('projects').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
  }

  async function saveDevice(device) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to sync a device.');
    const id = isUuid(device?.id) ? device.id : createUuid();
    const payload = {
      id,
      user_id: user.id,
      name: String(device?.name || '').trim().slice(0, 60),
      device_type: String(device?.type || device?.device_type || 'Other').trim().slice(0, 60),
      identifier: String(device?.identifier || '').trim().slice(0, 120),
      notes: String(device?.notes || '').trim().slice(0, 500) || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await getClient().from('devices').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  }

  async function listDevices() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await getClient()
      .from('devices')
      .select('id,name,device_type,identifier,notes,created_at,updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function deleteDevice(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to remove a cloud device.');
    const { error } = await getClient().from('devices').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
  }

  async function authorSnapshot() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to post in HauntSync.');
    const profile = await getProfile();
    return {
      user,
      name: profile?.display_name || user.user_metadata?.display_name || 'Showduino Creator',
      haunt: profile?.haunt_name || null
    };
  }

  async function listPosts(options) {
    const settings = { limit: 50, category: '', ...(options || {}) };
    let query = getClient()
      .from('community_posts')
      .select('id,author_id,author_name,author_haunt,title,content,category,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(settings.limit) || 50, 1), 100));
    if (settings.category) query = query.eq('category', settings.category);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function createPost(values) {
    const author = await authorSnapshot();
    const payload = {
      author_id: author.user.id,
      author_name: author.name.slice(0, 60),
      author_haunt: author.haunt,
      title: String(values?.title || '').trim().slice(0, 120),
      content: String(values?.content || '').trim().slice(0, 5000),
      category: String(values?.category || 'general')
    };
    if (!payload.title || !payload.content) throw new Error('Give your HauntSync post a title and some content.');
    const { data, error } = await getClient().from('community_posts').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function deletePost(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before deleting a post.');
    const { error } = await getClient().from('community_posts').delete().eq('id', id).eq('author_id', user.id);
    if (error) throw error;
  }

  async function listComments(postId) {
    const { data, error } = await getClient()
      .from('community_comments')
      .select('id,post_id,author_id,author_name,content,created_at,updated_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function addComment(postId, content) {
    const author = await authorSnapshot();
    const text = String(content || '').trim().slice(0, 2500);
    if (!text) throw new Error('Write something before posting a reply.');
    const { data, error } = await getClient().from('community_comments').insert({
      post_id: postId,
      author_id: author.user.id,
      author_name: author.name.slice(0, 60),
      content: text
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteComment(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before deleting a reply.');
    const { error } = await getClient().from('community_comments').delete().eq('id', id).eq('author_id', user.id);
    if (error) throw error;
  }

  function realtimeRefresh(table, callback, loader, filter) {
    const c = getClient();
    let stopped = false;
    let timer = null;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (stopped) return;
        try { callback(await loader()); }
        catch (error) { console.error(`[Showduino Supabase] ${table} refresh failed`, error); }
      }, 80);
    };
    refresh();
    const channelName = `${table}-${Math.random().toString(36).slice(2)}`;
    const change = { event: '*', schema: 'public', table };
    if (filter) change.filter = filter;
    const channel = c.channel(channelName).on('postgres_changes', change, refresh).subscribe();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      c.removeChannel(channel);
    };
  }

  function subscribePosts(callback, options) {
    const settings = { ...(options || {}) };
    return realtimeRefresh('community_posts', callback, () => listPosts(settings));
  }

  function subscribeComments(postId, callback) {
    return realtimeRefresh('community_comments', callback, () => listComments(postId), `post_id=eq.${postId}`);
  }

  window.ShowduinoSupabase = Object.freeze({
    enabled,
    register,
    resendConfirmation,
    signIn,
    requestPasswordReset,
    updatePassword,
    signOut,
    onAuthChanged,
    getCurrentUser,
    getProfile,
    updateProfile,
    saveProject,
    listProjects,
    loadProject,
    deleteProject,
    saveDevice,
    listDevices,
    deleteDevice,
    listPosts,
    createPost,
    deletePost,
    listComments,
    addComment,
    deleteComment,
    subscribePosts,
    subscribeComments
  });
})();
