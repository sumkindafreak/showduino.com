/* global SHOWDUINO_CONFIG, supabase */
(function () {
  'use strict';

  const ACCOUNT_URL = 'https://show-duino.com/account.html';
  const CONFIRMATION_URL = `${ACCOUNT_URL}?confirmed=1`;
  let client = null;

  function config() {
    return window.SHOWDUINO_CONFIG || { features: {}, supabase: {} };
  }

  // W5-24: only the public website and local test servers may talk to the production
  // Supabase project. Cloudflare preview deployments (*.pages.dev) and any other copy of
  // the site run local-only, so an old or unreviewed build can never act on real accounts.
  const ACCOUNT_HOSTS = Object.freeze(['show-duino.com', 'www.show-duino.com', 'localhost', '127.0.0.1']);
  function hostAllowed() {
    const host = String(window.location?.hostname || '').toLowerCase();
    return ACCOUNT_HOSTS.includes(host);
  }

  function enabled() {
    const cfg = config();
    return Boolean(
      hostAllowed() &&
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

  async function upsertProfile(user, displayName) {
    if (!user) return null;
    // Do not overwrite a user's edited name whenever they sign in again.
    const { data: existing, error: readError } = await getClient()
      .from('profiles').select('id,display_name').eq('id', user.id).maybeSingle();
    if (readError) throw readError;
    if (existing) return existing;
    const name = String(displayName || user.user_metadata?.display_name || user.user_metadata?.full_name || 'Showduino Creator').trim().slice(0, 60) || 'Showduino Creator';
    const { error } = await getClient().from('profiles')
      .upsert({ id: user.id, display_name: name }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    const { data, error: finalError } = await getClient()
      .from('profiles').select('id,display_name').eq('id', user.id).maybeSingle();
    if (finalError) throw finalError;
    return data;
  }

  // captchaToken: Cloudflare Turnstile token when bot protection is on (js/site-captcha.js).
  const withCaptcha = (options, captchaToken) => (captchaToken ? { ...options, captchaToken } : options);

  async function register(email, password, displayName, captchaToken) {
    const { data, error } = await getClient().auth.signUp({
      email,
      password,
      options: withCaptcha({ emailRedirectTo: CONFIRMATION_URL, data: { display_name: displayName } }, captchaToken)
    });
    if (error) throw error;
    if (data.user && data.session) await upsertProfile(data.user, displayName);
    return data;
  }

  async function resendConfirmation(email, captchaToken) {
    const address = String(email || '').trim();
    if (!address) throw new Error('Enter the email address you used to sign up first.');
    const { data, error } = await getClient().auth.resend({
      type: 'signup',
      email: address,
      options: withCaptcha({ emailRedirectTo: CONFIRMATION_URL }, captchaToken)
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password, captchaToken) {
    const { data, error } = await getClient().auth.signInWithPassword(
      captchaToken ? { email, password, options: { captchaToken } } : { email, password });
    if (error) throw error;
    if (data.user) await upsertProfile(data.user);
    return data;
  }

  // Google OAuth uses the SAME Supabase user identity and private profile as email login.
  // The browser is sent to Google by Supabase Auth. Credentials stay exclusively in
  // the Google Cloud + Supabase provider settings, never in public website JavaScript.
  const GOOGLE_RETURN_URL = 'https://show-duino.com/welcome.html';

  async function signInWithGoogle() {
    const { data, error } = await getClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: GOOGLE_RETURN_URL }
    });
    if (error) throw error;
    return data;
  }

  async function requestPasswordReset(email, captchaToken) {
    const { data, error } = await getClient().auth.resetPasswordForEmail(email, withCaptcha({ redirectTo: ACCOUNT_URL }, captchaToken));
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
    let active = true;
    // Supabase holds its auth lock while notifying listeners. UI listeners may
    // read profiles/projects (and therefore auth again), so run them on a later
    // task and never return their promise to the SDK's locked callback.
    // The SDK supplies INITIAL_SESSION; a second getSession() can deliver stale
    // signed-in state after a newer SIGNED_OUT event.
    const { data } = c.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (!active) return;
        Promise.resolve().then(() => callback(session?.user || null, event))
          .catch(error => console.error('[Showduino auth] Account view update failed', error));
      }, 0);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
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
    const { data, error } = await getClient().from('profiles').select('id,display_name,avatar_url,created_at,updated_at').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  const CREATOR_FIELDS = 'id,display_name,username,bio,creator_focus,website_url,avatar_url,created_at,updated_at';

  async function getCreatorProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    await upsertProfile(user);
    const { data, error } = await getClient().from('profiles')
      .select(CREATOR_FIELDS).eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveCreatorProfile(values) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before editing your creator profile.');
    const displayName = String(values?.display_name || '').trim();
    const username = String(values?.username || '').trim().toLowerCase();
    const bio = String(values?.bio || '').trim();
    const creatorFocus = String(values?.creator_focus || '').trim();
    const website = String(values?.website_url || '').trim();
    if (!displayName || displayName.length > 60) throw new Error('Display name must be between 1 and 60 characters.');
    if (username && !/^[a-z0-9_-]{3,30}$/.test(username)) throw new Error('Username must be 3–30 letters, numbers, underscores or hyphens.');
    if (bio.length > 500) throw new Error('Bio must be 500 characters or fewer.');
    if (creatorFocus.length > 60) throw new Error('Specialism must be 60 characters or fewer.');
    if (website) {
      let url;
      try { url = new URL(website); } catch (_) { throw new Error('Enter a valid HTTPS website URL.'); }
      if (url.protocol !== 'https:' || url.username || url.password || website.length > 240) {
        throw new Error('Use an HTTPS website URL, without a username or password.');
      }
    }
    await upsertProfile(user);
    const { data, error } = await getClient().from('profiles').update({
      display_name: displayName,
      username: username || null,
      bio,
      creator_focus: creatorFocus,
      website_url: website || null,
      updated_at: new Date().toISOString()
    }).eq('id', user.id).select(CREATOR_FIELDS).single();
    if (error) {
      if (error.code === '23505') throw new Error('That username is already taken. Try another one.');
      throw error;
    }
    return data;
  }

  // Only public-facing avatar images are stored here; private projects stay in owner-scoped tables.
  const AVATAR_BUCKET = 'hauntsync-avatars';
  const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
  const AVATAR_TYPES = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });

  function ownedAvatarPath(publicUrl, uid) {
    if (!publicUrl || !uid) return null;
    const prefix = getClient().storage.from(AVATAR_BUCKET).getPublicUrl(uid + '/').data.publicUrl;
    if (!publicUrl.startsWith(prefix)) return null;
    const leaf = publicUrl.slice(prefix.length);
    return /^avatar-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(leaf) ? uid + '/' + leaf : null;
  }

  async function clearOwnedAvatar(publicUrl, uid) {
    const path = ownedAvatarPath(publicUrl, uid);
    if (!path) return;
    const { error } = await getClient().storage.from(AVATAR_BUCKET).remove([path]);
    if (error) console.warn('[HauntSync] Could not remove previous avatar.', error);
  }

  async function uploadCreatorAvatar(file) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before uploading a profile photo.');
    if (!file || !Object.hasOwn(AVATAR_TYPES, file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > AVATAR_MAX_BYTES) {
      throw new Error('Profile photos must be 2 MB or smaller.');
    }
    const uuid = window.crypto?.randomUUID?.();
    if (!uuid) throw new Error('Profile photo upload requires a secure HTTPS browser.');
    const previous = await getCreatorProfile();
    const path = user.id + '/avatar-' + uuid + '.' + AVATAR_TYPES[file.type];
    const store = getClient().storage.from(AVATAR_BUCKET);
    const { error: uploadError } = await store.upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });
    if (uploadError) {
      // W005: storage refuses uploads past the account limit or while suspended.
      if (/row-level security|violates/i.test(String(uploadError.message || ''))) {
        throw new Error('That photo was not accepted. Accounts keep up to 5 stored photos (10 uploads a day), and suspended accounts cannot upload.');
      }
      throw uploadError;
    }
    try {
      const url = store.getPublicUrl(path).data.publicUrl;
      const { data, error } = await getClient().from('profiles').update({
        avatar_url: url,
        updated_at: new Date().toISOString()
      }).eq('id', user.id).select(CREATOR_FIELDS).single();
      if (error) throw error;
      // The old file is removed only after the new profile change succeeds.
      if (previous?.avatar_url) await clearOwnedAvatar(previous.avatar_url, user.id);
      return data;
    } catch (error) {
      // Failed profile updates must not leave newly uploaded public files behind.
      await store.remove([path]).catch(() => {});
      throw error;
    }
  }

  async function removeCreatorAvatar() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before removing a profile photo.');
    const previous = await getCreatorProfile();
    if (!previous?.avatar_url) return previous;
    const { data, error } = await getClient().from('profiles').update({
      avatar_url: null,
      updated_at: new Date().toISOString()
    }).eq('id', user.id).select(CREATOR_FIELDS).single();
    if (error) throw error;
    await clearOwnedAvatar(previous.avatar_url, user.id);
    return data;
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  // A fixed fallback ID would make every such project collide on the shared primary key.
  function randomUuidV4() {
    const b = window.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function ensureProjectUuid(project) {
    project.project = project.project || {};
    if (!isUuid(project.project.id)) project.project.id = window.crypto?.randomUUID?.() || randomUuidV4();
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
    const { data, error } = await getClient().from('projects').select('id,name,format,format_version,created_at,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false });
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

  // Public creator identities are separately and explicitly published by the owner.
  // Never expose the private 'profiles', 'projects' or 'devices' tables to anonymous readers.
  const PUBLIC_CREATOR_FIELDS = 'creator_id,username,display_name,bio,creator_focus,website_url,avatar_url,published_at,updated_at';

  async function getOwnCreatorPublication() {
    const user = await getCurrentUser();
    if (!user) return null;
    const {data,error} = await getClient().from('creator_publications')
      .select(PUBLIC_CREATOR_FIELDS).eq('creator_id',user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function publishCreatorProfile() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before publishing your creator profile.');
    const profile = await getCreatorProfile();
    if (!profile?.username || !/^[a-z0-9_-]{3,30}$/.test(profile.username)) {
      throw new Error('Save a unique creator username before publishing.');
    }
    const payload = {
      creator_id:user.id,
      username:profile.username,
      display_name:profile.display_name,
      bio:profile.bio || '',
      creator_focus:profile.creator_focus || '',
      website_url:profile.website_url || null,
      avatar_url:profile.avatar_url || null,
      updated_at:new Date().toISOString()
    };
    const {data,error} = await getClient().from('creator_publications')
      .upsert(payload,{onConflict:'creator_id'}).select(PUBLIC_CREATOR_FIELDS).single();
    if (error) throw error;
    return data;
  }

  async function unpublishCreatorProfile() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before unpublishing your profile.');
    const {error} = await getClient().from('creator_publications')
      .delete().eq('creator_id',user.id);
    if (error) throw error;
  }

  async function listPublicCreators() {
    const {data,error} = await getClient().from('creator_publications')
      .select(PUBLIC_CREATOR_FIELDS).order('updated_at',{ascending:false}).limit(100);
    if (error) throw error;
    return data || [];
  }

  async function getPublicCreator(username) {
    const handle = String(username || '').toLowerCase();
    if (!/^[a-z0-9_-]{3,30}$/.test(handle)) throw new Error('Invalid creator username.');
    const {data,error} = await getClient().from('creator_publications')
      .select(PUBLIC_CREATOR_FIELDS).eq('username',handle).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function listPublicCreatorShows(creatorId) {
    if (!isUuid(creatorId)) throw new Error('Invalid creator identifier.');
    const {data,error} = await getClient().from('shared_shows')
      .select(PUBLIC_SHARE_FIELDS).eq('author_id',creatorId)
      .order('created_at',{ascending:false}).limit(30);
    if (error) throw error;
    return data || [];
  }

  // Community shows are intentionally PUBLIC copies; never link them to private cloud projects.
  const PUBLIC_SHARE_FIELDS = 'id,title,summary,category,license,author_label,author_id,created_at,is_featured';

  async function listSharedShows(category) {
    const allowed = new Set(['ambience','lighting','pixels','interactive','props','other']);
    let query = getClient().from('shared_shows').select(PUBLIC_SHARE_FIELDS).order('created_at', {ascending:false}).limit(50);
    if (category && allowed.has(category)) query = query.eq('category', category);
    const {data,error} = await query;
    if (error) throw error;
    return data || [];
  }

  async function loadSharedShow(id) {
    if (!isUuid(id)) throw new Error('Invalid community show ID.');
    const {data,error} = await getClient().from('shared_shows')
      .select(PUBLIC_SHARE_FIELDS+',document').eq('id',id).single();
    if (error) throw error;
    return data;
  }

  async function publishSharedShow(payload) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to share a show.');
    if (!window.HauntSyncShare) throw new Error('Show sharing is not ready yet.');
    window.HauntSyncShare.validate(payload?.document);
    const title = String(payload?.title || '').trim();
    const summary = String(payload?.summary || '').trim();
    const category = String(payload?.category || '');
    const license = String(payload?.license || '');
    if (title.length < 3 || title.length > 100 || summary.length > 500) throw new Error('Please check the title and description.');
    if (!['ambience','lighting','pixels','interactive','props','other'].includes(category)) throw new Error('Choose a valid show category.');
    if (!['cc-by-4.0','cc0-1.0'].includes(license)) throw new Error('Select a permitted sharing licence.');
    if (!payload.document.metadata?.communityTemplate || payload.document.assets?.length ||
        payload.document.devices?.some(d => d?.binding?.nodeId)) {
      throw new Error('The production must be sanitised as a community template before sharing.');
    }
    // W004: shared shows carry a public, accountable identity. The author name is set by the
    // database from the published creator profile; the browser never supplies it.
    const publication = await getOwnCreatorPublication();
    if (!publication) throw new Error('Publish your creator profile (HauntSync → Profile) before sharing a show.');
    const {data,error} = await getClient().from('shared_shows').insert({
      author_id:user.id, title, summary, category, license, document:payload.document
    }).select('id').single();
    if (error) throw error;
    return data;
  }

  async function removeSharedShow(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to unshare a show.');
    if (!isUuid(id)) throw new Error('Invalid community show ID.');
    const {data,error} = await getClient().from('shared_shows').delete()
      .eq('id',id).eq('author_id',user.id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('This share does not belong to your account or was already removed.');
    return true;
  }

  window.ShowduinoSupabase = Object.freeze({
    // W004: the community module (js/cloud/hauntsync-community.js) builds on the same client.
    client: getClient,
    enabled, register, resendConfirmation, signIn, signInWithGoogle, requestPasswordReset, updatePassword, signOut,
    onAuthChanged, getCurrentUser, getProfile, getCreatorProfile, saveCreatorProfile, uploadCreatorAvatar, removeCreatorAvatar, saveProject, listProjects, loadProject, deleteProject,
    getOwnCreatorPublication, publishCreatorProfile, unpublishCreatorProfile,
    listPublicCreators, getPublicCreator, listPublicCreatorShows,
    listSharedShows, loadSharedShow, publishSharedShow, removeSharedShow
  });
})();
