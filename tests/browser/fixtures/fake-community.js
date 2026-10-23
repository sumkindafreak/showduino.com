/* TEST FIXTURE. Replaces js/cloud/supabase-service.js + js/cloud/hauntsync-community.js in
 * browser tests so the HauntSync pages can be exercised without a network. The scenario comes
 * from window.__HS_SCENARIO (set by the test with addInitScript):
 *   { role: 'visitor' | 'member' | 'unpublished' | 'restricted' | 'owner' }
 * Like the real database, admin.* refuses anyone but the owner. The real data layer is tested
 * against PostgREST + PostgreSQL in tests/api/community-api.test.cjs. */
(function () {
  'use strict';
  const S = window.__HS_SCENARIO || { role: 'visitor' };
  const FOUNDER = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea';
  const ME = { member: '00000000-0000-4000-8000-0000000000a1', unpublished: '00000000-0000-4000-8000-0000000000c1', restricted: '00000000-0000-4000-8000-0000000000b1', owner: FOUNDER }[S.role] || null;
  const HOSTILE = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
  const calls = window.__HS_CALLS = [];
  const now = Date.now();
  const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

  const creators = new Map([
    [FOUNDER, { creator_id: FOUNDER, username: 'showduino_admin', display_name: 'Showduino Founder', bio: 'Founder', creator_focus: 'Show control', avatar_url: null }],
    ['00000000-0000-4000-8000-0000000000a1', { creator_id: '00000000-0000-4000-8000-0000000000a1', username: 'alice', display_name: 'Alice', bio: '', creator_focus: 'Fog', avatar_url: null }],
    ['00000000-0000-4000-8000-0000000000b1', { creator_id: '00000000-0000-4000-8000-0000000000b1', username: 'bob', display_name: 'Bob', bio: '', creator_focus: '', avatar_url: null }],
    ['00000000-0000-4000-8000-0000000000e1', { creator_id: '00000000-0000-4000-8000-0000000000e1', username: 'mallory', display_name: 'Mallory ' + HOSTILE, bio: HOSTILE, creator_focus: HOSTILE, avatar_url: 'javascript:alert(1)' }]
  ]);
  const categories = [
    { slug: 'show-control', name: 'Show control', description: '', sort_order: 10, is_active: true },
    { slug: 'effects', name: 'Effects', description: '', sort_order: 50, is_active: true },
    { slug: 'general', name: 'General discussion', description: '', sort_order: 90, is_active: true }
  ];
  const posts = [
    { id: '20000000-0000-4000-8000-0000000000f1', author_id: FOUNDER, author_name: 'Showduino Founder', title: 'Welcome to HauntSync', content: 'Say hello!', category: 'general', kind: 'discussion', image_path: null, status: 'visible', is_featured: true, moderation_reason: '', created_at: iso(300), edited_at: null },
    { id: '20000000-0000-4000-8000-0000000000e1', author_id: '00000000-0000-4000-8000-0000000000e1', author_name: 'Mallory', title: 'Free fog ' + HOSTILE, content: 'Line one\n' + HOSTILE + '\n<script>window.__xss=99</script>', category: 'effects', kind: 'showcase', image_path: null, status: 'visible', is_featured: false, moderation_reason: '', created_at: iso(60), edited_at: null },
    { id: '20000000-0000-4000-8000-0000000000a1', author_id: '00000000-0000-4000-8000-0000000000a1', author_name: 'Alice', title: 'Fog chiller build', content: 'Day one of my fog chiller.', category: 'effects', kind: 'build_log', image_path: '00000000-0000-4000-8000-0000000000a1/post-00000000-0000-4000-8000-0000000000aa.png', status: 'visible', is_featured: false, moderation_reason: '', created_at: iso(30), edited_at: null }
  ];
  const comments = [
    { id: '30000000-0000-4000-8000-0000000000b1', post_id: '20000000-0000-4000-8000-0000000000a1', author_id: '00000000-0000-4000-8000-0000000000b1', author_name: 'Bob', content: 'Nice ' + HOSTILE, parent_id: null, status: 'visible', moderation_reason: '', created_at: iso(20), edited_at: null }
  ];
  const reports = [
    { id: '40000000-0000-4000-8000-000000000001', reporter_id: '00000000-0000-4000-8000-0000000000a1', target_type: 'post', target_id: '20000000-0000-4000-8000-0000000000e1', reason: 'spam', details: 'Advert ' + HOSTILE, status: 'open', created_at: iso(10), resolution_note: '' }
  ];
  // Keep changes across page loads in this tab, like a real backend would.
  const KEY = '__hs_fake_' + S.role;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved) { posts.splice(0, posts.length, ...saved.posts); comments.splice(0, comments.length, ...saved.comments); reports.splice(0, reports.length, ...saved.reports); }
  } catch (_) {}
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ posts, comments, reports })); } catch (_) {} };
  const follows = new Set();
  const decorate = (p) => ({ ...p, author: creators.get(p.author_id) || null, is_founder: p.author_id === FOUNDER, comment_count: comments.filter((c) => c.post_id === p.id).length, image_url: null });
  const visible = (p) => p.status === 'visible' || p.author_id === ME || S.role === 'owner';
  const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
  const canParticipate = ['member', 'owner'].includes(S.role);
  function denyUnlessOwner(name) {
    calls.push('admin.' + name);
    if (S.role !== 'owner') throw new Error('Only the Showduino owner can do this.');
  }
  const status = async () => (ME ? {
    signed_in: true, role: S.role === 'owner' ? 'owner' : 'member',
    status: S.role === 'restricted' ? 'restricted' : 'active', status_reason: S.role === 'restricted' ? 'Cool-off ' + HOSTILE : '',
    published: S.role !== 'unpublished', username: creators.get(ME)?.username || null, can_participate: canParticipate
  } : { signed_in: false, role: 'visitor' });

  window.ShowduinoSupabase = Object.freeze({
    enabled: () => true,
    client: () => ({}),
    getCurrentUser: async () => (ME ? { id: ME, email: 'me@example.test', user_metadata: {} } : null),
    onAuthChanged: () => {},
    listPublicCreators: async () => [...creators.values()],
    getPublicCreator: async (u) => [...creators.values()].find((c) => c.username === u) || null,
    listPublicCreatorShows: async () => [],
    listSharedShows: async () => [],
    getProfile: async () => null
  });

  window.HauntSyncCommunity = Object.freeze({
    KINDS: ['discussion', 'build_log', 'showcase', 'question'], REPORT_REASONS: ['spam', 'other'], IMAGE_MAX_BYTES: 3145728,
    isUuid,
    searchTerm: (v) => String(v || '').replace(/[^\p{L}\p{N} _'-]/gu, ' ').trim().slice(0, 60),
    status,
    founderId: async () => FOUNDER,
    categories: async () => categories.filter((c) => c.is_active),
    creatorsById: async (ids) => new Map(ids.filter((id) => creators.has(id)).map((id) => [id, creators.get(id)])),
    creatorStats: async (id) => (creators.has(id) ? { joined: '2026-08-01', posts: posts.filter((p) => p.author_id === id).length, shows: 0, followers: 3, following: 1, founder: id === FOUNDER } : null),
    listPosts: async (o = {}) => {
      calls.push('listPosts:' + JSON.stringify(o));
      let list = posts.filter((p) => p.status === 'visible');
      if (o.category) list = list.filter((p) => p.category === o.category);
      if (o.kind) list = list.filter((p) => p.kind === o.kind);
      if (o.featured) list = list.filter((p) => p.is_featured);
      if (o.authorId) list = list.filter((p) => p.author_id === o.authorId);
      if (o.following) list = list.filter((p) => follows.has(p.author_id));
      const q = String(o.search || '').toLowerCase();
      if (q) list = list.filter((p) => (p.title + ' ' + p.content).toLowerCase().includes(q));
      return list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map(decorate);
    },
    getPost: async (id) => { if (!isUuid(id)) throw new Error('That post link is not valid.'); const p = posts.find((x) => x.id === id && visible(x)); return p ? decorate(p) : null; },
    createPost: async (input) => {
      if (!canParticipate) throw new Error('You cannot do that.');
      const id = '20000000-0000-4000-8000-' + String(posts.length + 100).padStart(12, '0');
      posts.push({ id, author_id: ME, author_name: creators.get(ME).display_name, title: input.title, content: input.content, category: input.category, kind: input.kind, image_path: null, status: 'visible', is_featured: false, moderation_reason: '', created_at: new Date().toISOString(), edited_at: null });
      calls.push('createPost');
      save();
      return id;
    },
    updatePost: async (id, input) => { const p = posts.find((x) => x.id === id && x.author_id === ME); if (!p) throw new Error('This post is not yours, or it was removed.'); Object.assign(p, { title: input.title, content: input.content, edited_at: new Date().toISOString() }); save(); return true; },
    deletePost: async (id) => { const i = posts.findIndex((x) => x.id === id && x.author_id === ME); if (i < 0) throw new Error('This post is not yours.'); posts.splice(i, 1); calls.push('deletePost'); save(); return true; },
    imageUrl: () => null,
    sniffImage: async (file) => { const h = new Uint8Array(await file.slice(0, 4).arrayBuffer()); return h[0] === 0x89 && h[1] === 0x50 ? { ext: 'png', type: 'image/png' } : null; },
    uploadPostImage: async () => 'x',
    listComments: async (postId) => comments.filter((c) => c.post_id === postId).map((c) => ({ ...c, author: creators.get(c.author_id) || null, is_founder: c.author_id === FOUNDER })),
    addComment: async (postId, content, parentId) => {
      if (!canParticipate) throw new Error('You cannot do that.');
      const parent = parentId ? comments.find((c) => c.id === parentId) : null;
      comments.push({ id: '30000000-0000-4000-8000-' + String(comments.length + 100).padStart(12, '0'), post_id: postId, author_id: ME, author_name: creators.get(ME).display_name, content, parent_id: parent ? (parent.parent_id || parent.id) : null, status: 'visible', moderation_reason: '', created_at: new Date().toISOString(), edited_at: null });
      calls.push('addComment');
      save();
      return 'ok';
    },
    updateComment: async () => true,
    deleteComment: async () => true,
    isFollowing: async (id) => follows.has(id),
    follow: async (id) => { follows.add(id); calls.push('follow'); return true; },
    unfollow: async (id) => { follows.delete(id); calls.push('unfollow'); return true; },
    report: async (type, id, reason, details) => { if (!ME) throw new Error('Sign in to report content.'); calls.push(`report:${type}:${id}:${reason}:${details}`); return true; },
    admin: Object.freeze({
      stats: async () => { denyUnlessOwner('stats'); return { members: 4, published_creators: 4, open_reports: reports.filter((r) => r.status === 'open').length, posts: posts.length, posts_7d: 2, posts_hidden: posts.filter((p) => p.status !== 'visible').length, comments: comments.length, comments_7d: 1, shared_shows: 0, follows: 0, restricted: 0, suspended: 0, moderation_actions_30d: 0 }; },
      reports: async (st) => { denyUnlessOwner('reports'); return reports.filter((r) => !st || r.status === st).map((r) => ({ ...r, target: posts.find((p) => p.id === r.target_id) || null, reporter: creators.get(r.reporter_id) })); },
      moderate: async (type, id, action, reason) => { denyUnlessOwner('moderate:' + type + ':' + action); const p = posts.find((x) => x.id === id); if (p) { if (action === 'hide') p.status = 'hidden'; if (action === 'remove') p.status = 'removed'; if (action === 'restore') p.status = 'visible'; if (action === 'feature') p.is_featured = true; if (action === 'unfeature') p.is_featured = false; p.moderation_reason = reason || ''; } save(); return null; },
      resolveReport: async (id, resolution) => { denyUnlessOwner('resolve:' + resolution); const r = reports.find((x) => x.id === id); if (r) r.status = resolution; save(); return null; },
      members: async () => { denyUnlessOwner('members'); return [...creators.values()].map((c) => ({ user_id: c.creator_id, display_name: c.display_name, username: c.username, published: true, joined: '2026-08-01', status: 'active', status_reason: '', is_owner: c.creator_id === FOUNDER, posts: 1, comments: 0, shows: 0, open_reports: 0 })); },
      setMemberStatus: async (id, st) => { denyUnlessOwner('setMemberStatus:' + st); if (id === FOUNDER) throw new Error('The Showduino owner account cannot be restricted or suspended.'); return null; },
      clearAvatar: async (id, reason) => { denyUnlessOwner('clearAvatar:' + id + ':' + reason); return 1; },
      removeImage: async (path, reason) => { denyUnlessOwner('removeImage:' + path + ':' + reason); return true; },
      saveCategory: async (c) => { denyUnlessOwner('saveCategory:' + c.slug); return null; },
      allCategories: async () => { denyUnlessOwner('allCategories'); return categories; },
      sharedShows: async () => { denyUnlessOwner('sharedShows'); return []; },
      content: async () => { denyUnlessOwner('content'); return posts.map(decorate); },
      log: async () => { denyUnlessOwner('log'); return [{ id: 1, action: 'owner_assigned', target_type: 'account', target_id: FOUNDER, reason: 'W004 ' + HOSTILE, created_at: iso(1000) }]; }
    })
  });
})();
