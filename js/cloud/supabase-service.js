/* global SHOWDUINO_CONFIG, supabase */
(function () {
  'use strict';

  const CONFIRMATION_REDIRECT = 'https://show-duino.com/account.html?confirmed=1';
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
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return client;
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
      options: {
        emailRedirectTo: CONFIRMATION_REDIRECT,
        data: { display_name: displayName }
      }
    });
    if (error) throw error;
    if (data.user && data.session) await upsertProfile(data.user, displayName);
    return data;
  }

  async function resendConfirmation(email) {
    const address = String(email || '').trim();
    if (!address) throw new Error('Enter the email address you used to sign up first.');
    const { data, error } = await getClient().auth.resend({
      type: 'signup',
      email: address,
      options: { emailRedirectTo: CONFIRMATION_REDIRECT }
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

  async function signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw error;
  }

  function onAuthChanged(callback) {
    if (!enabled()) {
      callback(null);
      return () => {};
    }
    const c = getClient();
    c.auth.getSession().then(({ data }) => callback(data.session?.user || null));
    const { data } = c.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
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
    const { data, error } = await getClient().from('profiles').select('id,display_name,created_at,updated_at').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function ensureProjectUuid(project) {
    project.project = project.project || {};
    if (!isUuid(project.project.id)) {
      project.project.id = window.crypto?.randomUUID?.() || '00000000-0000-4000-8000-000000000000';
    }
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
    const { data, error } = await getClient()
      .from('projects')
      .select('project_data')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (error) throw error;
    return data.project_data;
  }

  async function deleteProject(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to delete cloud shows.');
    const { error } = await getClient().from('projects').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
  }

  window.ShowduinoSupabase = Object.freeze({
    enabled,
    register,
    resendConfirmation,
    signIn,
    signOut,
    onAuthChanged,
    getCurrentUser,
    getProfile,
    saveProject,
    listProjects,
    loadProject,
    deleteProject
  });
})();
