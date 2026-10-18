/* HauntSync community data layer (W004).
 *
 * Every read and write goes through Supabase Row Level Security and, for the owner, through
 * database functions that check public.is_owner() themselves. Nothing in this file decides who
 * may do what: hiding a button is a convenience, never the access control.
 *
 * Exposes window.HauntSyncCommunity. Depends on js/cloud/supabase-service.js.
 */
(function () {
  'use strict';

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const IMAGE_PATH = /^[0-9a-f-]{36}\/post-[0-9a-f-]{36}\.(jpg|png|webp)$/;
  const POST_FIELDS = 'id,author_id,author_name,title,content,category,kind,image_path,shared_show_id,status,is_featured,moderation_reason,created_at,updated_at,edited_at';
  const COMMENT_FIELDS = 'id,post_id,author_id,author_name,content,parent_id,status,moderation_reason,created_at,edited_at';
  const CREATOR_FIELDS = 'creator_id,username,display_name,bio,creator_focus,website_url,avatar_url,published_at,updated_at';
  const SHOW_FIELDS = 'id,title,summary,category,license,author_label,author_id,created_at,status,is_featured,moderation_reason';
  const KINDS = ['discussion', 'build_log', 'showcase', 'question'];
  const REPORT_REASONS = ['spam', 'harassment', 'hateful', 'sexual', 'violence', 'dangerous', 'impersonation', 'copyright', 'unsafe_show', 'other'];
  const IMAGE_BUCKET = 'community-images';
  const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

  const sb = () => window.ShowduinoSupabase;
  const db = () => sb().client();
  const isUuid = (value) => UUID.test(String(value || ''));

  function check(result) {
    if (result.error) throw friendlyError(result.error);
    return result.data;
  }

  // Database messages written for people are passed on; everything else is generic.
  function friendlyError(error) {
    const message = String(error?.message || error || '');
    const code = String(error?.code || '');
    if (code === '42501' && /row-level security/i.test(message)) {
      return new Error('You cannot do that. If you have not published your creator profile yet, publish it first. Restricted and suspended accounts cannot post.');
    }
    if (code === '23505') return new Error('You have already done that.');
    if (/JWT|not authenticated|Auth session missing/i.test(message)) return new Error('Please sign in again.');
    if (/^(You |That |Post images|A reply|Only the Showduino owner|The Showduino owner|Nothing was changed|Comments cannot|Unknown|Report not found|Member not found|Status must|Resolution must)/.test(message)) {
      return new Error(message);
    }
    return new Error('Something went wrong talking to HauntSync. Please try again.');
  }

  // Text from the URL or a search box, made safe for PostgREST filter syntax.
  function searchTerm(value) {
    return String(value || '').replace(/[^\p{L}\p{N} _'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  /* ── identity ─────────────────────────────────────────────────────────── */

  let founderPromise = null;
  function founderId() {
    if (!founderPromise) founderPromise = db().rpc('community_founder_id').then(check).catch(() => null);
    return founderPromise;
  }

  async function status() {
    if (!sb()?.enabled()) return { signed_in: false, role: 'visitor', unavailable: true };
    return check(await db().rpc('my_community_status'));
  }

  async function currentUserId() {
    const user = await sb().getCurrentUser();
    return user?.id || null;
  }

  async function creatorsById(ids) {
    const unique = [...new Set(ids.filter(isUuid))];
    if (!unique.length) return new Map();
    const rows = check(await db().from('creator_publications').select(CREATOR_FIELDS).in('creator_id', unique));
    return new Map((rows || []).map((row) => [row.creator_id, row]));
  }

  async function creatorStats(creatorId) {
    if (!isUuid(creatorId)) return null;
    return check(await db().rpc('creator_public_stats', { p_creator: creatorId }));
  }

  /* ── categories ───────────────────────────────────────────────────────── */

  async function categories() {
    return check(await db().from('community_categories').select('slug,name,description,sort_order,is_active').order('sort_order')) || [];
  }

  /* ── posts ────────────────────────────────────────────────────────────── */

  async function decoratePosts(posts) {
    const list = posts || [];
    const [creators, founder] = await Promise.all([creatorsById(list.map((p) => p.author_id)), founderId()]);
    const counts = new Map();
    if (list.length) {
      const rows = check(await db().from('community_comments').select('post_id').in('post_id', list.map((p) => p.id)));
      (rows || []).forEach((row) => counts.set(row.post_id, (counts.get(row.post_id) || 0) + 1));
    }
    return list.map((post) => ({
      ...post,
      author: creators.get(post.author_id) || null,
      is_founder: Boolean(founder && post.author_id === founder),
      comment_count: counts.get(post.id) || 0,
      image_url: imageUrl(post.image_path)
    }));
  }

  async function listPosts(options) {
    const opts = options || {};
    let query = db().from('community_posts').select(POST_FIELDS).order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(opts.limit) || 20, 1), 50));
    if (!opts.includeHidden) query = query.eq('status', 'visible');
    if (opts.category && /^[a-z0-9-]{2,32}$/.test(opts.category)) query = query.eq('category', opts.category);
    if (opts.kind && KINDS.includes(opts.kind)) query = query.eq('kind', opts.kind);
    if (opts.featured) query = query.eq('is_featured', true);
    if (opts.authorId) {
      if (!isUuid(opts.authorId)) return [];
      query = query.eq('author_id', opts.authorId);
    }
    if (opts.before) query = query.lt('created_at', String(opts.before));
    const term = searchTerm(opts.search);
    if (term) query = query.or(`title.ilike.*${term}*,content.ilike.*${term}*`);
    if (opts.following) {
      const me = await currentUserId();
      if (!me) return [];
      const follows = check(await db().from('creator_follows').select('followee_id').eq('follower_id', me));
      const ids = (follows || []).map((f) => f.followee_id);
      if (!ids.length) return [];
      query = query.in('author_id', ids);
    }
    return decoratePosts(check(await query));
  }

  async function getPost(id) {
    if (!isUuid(id)) throw new Error('That post link is not valid.');
    const rows = check(await db().from('community_posts').select(POST_FIELDS).eq('id', id).limit(1));
    if (!rows?.length) return null;
    return (await decoratePosts(rows))[0];
  }

  function cleanPostInput(input) {
    const title = String(input?.title || '').trim();
    const content = String(input?.content || '').trim();
    if (title.length < 1 || title.length > 120) throw new Error('Give your post a title of up to 120 characters.');
    if (content.length < 1 || content.length > 5000) throw new Error('Write something (up to 5000 characters).');
    const category = String(input?.category || 'general');
    if (!/^[a-z0-9-]{2,32}$/.test(category)) throw new Error('Choose a category.');
    const kind = KINDS.includes(input?.kind) ? input.kind : 'discussion';
    const sharedShowId = input?.sharedShowId && isUuid(input.sharedShowId) ? input.sharedShowId : null;
    return { title, content, category, kind, shared_show_id: sharedShowId };
  }

  async function createPost(input) {
    const me = await currentUserId();
    if (!me) throw new Error('Sign in to post.');
    const row = cleanPostInput(input);
    if (input?.imageFile) row.image_path = await uploadPostImage(input.imageFile);
    const data = check(await db().from('community_posts').insert({ author_id: me, ...row }).select('id').single());
    return data.id;
  }

  async function updatePost(id, input) {
    if (!isUuid(id)) throw new Error('That post link is not valid.');
    const row = cleanPostInput(input);
    if (input?.removeImage) row.image_path = null;
    if (input?.imageFile) row.image_path = await uploadPostImage(input.imageFile);
    const data = check(await db().from('community_posts').update(row).eq('id', id).select('id'));
    if (!data?.length) throw new Error('This post is not yours, or it was removed.');
    return true;
  }

  async function deletePost(id) {
    if (!isUuid(id)) throw new Error('That post link is not valid.');
    const data = check(await db().from('community_posts').delete().eq('id', id).select('id'));
    if (!data?.length) throw new Error('This post is not yours, or it was already removed.');
    return true;
  }

  /* ── images ───────────────────────────────────────────────────────────── */

  function imageUrl(path) {
    if (!path || !IMAGE_PATH.test(path)) return null;
    return db().storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function sniffImage(file) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const is = (bytes, offset = 0) => bytes.every((b, i) => head[offset + i] === b);
    if (is([0xff, 0xd8, 0xff])) return { ext: 'jpg', type: 'image/jpeg' };
    if (is([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', type: 'image/png' };
    if (is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8)) return { ext: 'webp', type: 'image/webp' };
    return null;
  }

  async function uploadPostImage(file) {
    if (!file || typeof file.slice !== 'function') throw new Error('Choose an image file.');
    if (file.size > IMAGE_MAX_BYTES) throw new Error('Images must be 3 MB or smaller.');
    const kind = await sniffImage(file);
    if (!kind) throw new Error('Images must be JPEG, PNG or WebP.');
    const me = await currentUserId();
    if (!me) throw new Error('Sign in to upload images.');
    const id = (window.crypto?.randomUUID?.() || '').toLowerCase();
    if (!isUuid(id)) throw new Error('This browser cannot create a safe file name.');
    const path = `${me}/post-${id}.${kind.ext}`;
    check(await db().storage.from(IMAGE_BUCKET).upload(path, file, { contentType: kind.type, upsert: false, cacheControl: '3600' }));
    return path;
  }

  /* ── comments ─────────────────────────────────────────────────────────── */

  async function listComments(postId) {
    if (!isUuid(postId)) return [];
    const rows = check(await db().from('community_comments').select(COMMENT_FIELDS).eq('post_id', postId).order('created_at', { ascending: true }).limit(500)) || [];
    const [creators, founder] = await Promise.all([creatorsById(rows.map((c) => c.author_id)), founderId()]);
    return rows.map((c) => ({ ...c, author: creators.get(c.author_id) || null, is_founder: Boolean(founder && c.author_id === founder) }));
  }

  async function addComment(postId, content, parentId) {
    const me = await currentUserId();
    if (!me) throw new Error('Sign in to comment.');
    if (!isUuid(postId)) throw new Error('That post link is not valid.');
    const text = String(content || '').trim();
    if (text.length < 1 || text.length > 2500) throw new Error('Comments can be up to 2500 characters.');
    const row = { post_id: postId, author_id: me, content: text };
    if (parentId) {
      if (!isUuid(parentId)) throw new Error('That reply link is not valid.');
      row.parent_id = parentId;
    }
    return check(await db().from('community_comments').insert(row).select('id').single()).id;
  }

  async function updateComment(id, content) {
    if (!isUuid(id)) throw new Error('That comment link is not valid.');
    const text = String(content || '').trim();
    if (text.length < 1 || text.length > 2500) throw new Error('Comments can be up to 2500 characters.');
    const data = check(await db().from('community_comments').update({ content: text }).eq('id', id).select('id'));
    if (!data?.length) throw new Error('This comment is not yours, or it was removed.');
    return true;
  }

  async function deleteComment(id) {
    if (!isUuid(id)) throw new Error('That comment link is not valid.');
    const data = check(await db().from('community_comments').delete().eq('id', id).select('id'));
    if (!data?.length) throw new Error('This comment is not yours, or it was already removed.');
    return true;
  }

  /* ── following ────────────────────────────────────────────────────────── */

  async function isFollowing(creatorId) {
    const me = await currentUserId();
    if (!me || !isUuid(creatorId)) return false;
    const rows = check(await db().from('creator_follows').select('followee_id').eq('follower_id', me).eq('followee_id', creatorId).limit(1));
    return Boolean(rows?.length);
  }

  async function follow(creatorId) {
    const me = await currentUserId();
    if (!me) throw new Error('Sign in to follow creators.');
    if (!isUuid(creatorId) || creatorId === me) throw new Error('You cannot follow this account.');
    check(await db().from('creator_follows').insert({ follower_id: me, followee_id: creatorId }));
    return true;
  }

  async function unfollow(creatorId) {
    const me = await currentUserId();
    if (!me || !isUuid(creatorId)) return false;
    check(await db().from('creator_follows').delete().eq('follower_id', me).eq('followee_id', creatorId));
    return true;
  }

  /* ── reports ──────────────────────────────────────────────────────────── */

  async function report(targetType, targetId, reason, details) {
    const me = await currentUserId();
    if (!me) throw new Error('Sign in to report content.');
    if (!['post', 'comment', 'shared_show', 'creator'].includes(targetType) || !isUuid(targetId)) throw new Error('This item cannot be reported.');
    if (!REPORT_REASONS.includes(reason)) throw new Error('Choose a reason.');
    check(await db().from('content_reports').insert({
      reporter_id: me, target_type: targetType, target_id: targetId, reason, details: String(details || '').trim().slice(0, 1000)
    }));
    return true;
  }

  /* ── owner administration (the database refuses every call from anyone else) ── */

  const admin = Object.freeze({
    stats: async () => check(await db().rpc('admin_stats')),
    members: async (search, offset) => check(await db().rpc('admin_list_members', { p_search: searchTerm(search), p_limit: 50, p_offset: Number(offset) || 0 })) || [],
    setMemberStatus: async (userId, statusValue, reason) => check(await db().rpc('admin_set_member_status', { p_user_id: userId, p_status: statusValue, p_reason: String(reason || '').slice(0, 500) })),
    moderate: async (targetType, targetId, action, reason) => check(await db().rpc('admin_moderate', { p_target_type: targetType, p_target_id: targetId, p_action: action, p_reason: String(reason || '').slice(0, 500) })),
    resolveReport: async (reportId, resolution, note) => check(await db().rpc('admin_resolve_report', { p_report_id: reportId, p_resolution: resolution, p_note: String(note || '').slice(0, 1000) })),
    saveCategory: async (cat) => check(await db().rpc('admin_save_category', {
      p_slug: String(cat.slug || ''), p_name: String(cat.name || ''), p_description: String(cat.description || ''),
      p_sort_order: Number(cat.sort_order) || 100, p_is_active: cat.is_active !== false
    })),
    clearAvatar: async (userId, reason) => check(await db().rpc('admin_clear_avatar', { p_user_id: userId, p_reason: String(reason || '').slice(0, 500) })),
    removeImage: async (path) => {
      if (!IMAGE_PATH.test(String(path || ''))) throw new Error('Not a community image.');
      check(await db().storage.from(IMAGE_BUCKET).remove([path]));
      return true;
    },
    reports: async (statusFilter) => {
      let query = db().from('content_reports').select('id,reporter_id,target_type,target_id,reason,details,status,created_at,resolved_at,resolution_note').order('created_at', { ascending: false }).limit(100);
      if (['open', 'actioned', 'dismissed'].includes(statusFilter)) query = query.eq('status', statusFilter);
      const rows = check(await query) || [];
      const ids = (type) => rows.filter((r) => r.target_type === type).map((r) => r.target_id);
      const [posts, comments, shows, people] = await Promise.all([
        ids('post').length ? db().from('community_posts').select('id,author_id,author_name,title,content,status,image_path').in('id', ids('post')).then(check) : [],
        ids('comment').length ? db().from('community_comments').select('id,post_id,author_id,author_name,content,status').in('id', ids('comment')).then(check) : [],
        ids('shared_show').length ? db().from('shared_shows').select('id,author_id,author_label,title,summary,status').in('id', ids('shared_show')).then(check) : [],
        creatorsById(rows.map((r) => r.reporter_id).concat(ids('creator')))
      ]);
      const index = new Map([...(posts || []).map((x) => ['post:' + x.id, x]), ...(comments || []).map((x) => ['comment:' + x.id, x]), ...(shows || []).map((x) => ['shared_show:' + x.id, x])]);
      return rows.map((r) => ({
        ...r,
        target: r.target_type === 'creator' ? people.get(r.target_id) || null : index.get(r.target_type + ':' + r.target_id) || null,
        reporter: people.get(r.reporter_id) || null
      }));
    },
    log: async () => check(await db().from('moderation_log').select('id,actor_id,action,target_type,target_id,reason,details,created_at').order('created_at', { ascending: false }).limit(200)) || [],
    allCategories: async () => check(await db().from('community_categories').select('slug,name,description,sort_order,is_active').order('sort_order')) || [],
    sharedShows: async () => check(await db().from('shared_shows').select(SHOW_FIELDS).order('created_at', { ascending: false }).limit(100)) || [],
    content: async (statusFilter) => {
      let query = db().from('community_posts').select(POST_FIELDS).order('created_at', { ascending: false }).limit(100);
      if (['visible', 'hidden', 'removed'].includes(statusFilter)) query = query.eq('status', statusFilter);
      return decoratePosts(check(await query));
    }
  });

  window.HauntSyncCommunity = Object.freeze({
    KINDS, REPORT_REASONS, IMAGE_MAX_BYTES,
    isUuid, searchTerm, status, founderId, categories, creatorsById, creatorStats,
    listPosts, getPost, createPost, updatePost, deletePost, imageUrl, uploadPostImage, sniffImage,
    listComments, addComment, updateComment, deleteComment,
    isFollowing, follow, unfollow, report, admin
  });
})();
