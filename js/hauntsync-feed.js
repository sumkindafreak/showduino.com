/* HauntSync community feed and post pages (W004). All user text is rendered with textContent. */
(function () {
  'use strict';
  const C = () => window.HauntSyncCommunity;
  const UI = () => window.HauntSyncUI;
  const byId = (id) => document.getElementById(id);
  const el = (...args) => UI().el(...args);

  const state = { me: null, categories: [], tab: 'latest', oldest: null, loading: false, seq: 0 };

  function setStatus(node, message, kind) {
    if (!node) return;
    node.textContent = message || '';
    node.className = 'hs-inline-status' + (kind ? ' ' + kind : '');
  }

  function params() { return new URLSearchParams(location.search); }

  function categoryName(slug) {
    return state.categories.find((c) => c.slug === slug)?.name || slug;
  }

  function tag(text, cls) { return el('span', 'hs-tag ' + (cls || ''), text); }

  function excerpt(text, limit) {
    const value = String(text || '');
    return value.length > limit ? value.slice(0, limit).trimEnd() + '…' : value;
  }

  /* ── feed ─────────────────────────────────────────────────────────────── */

  function postCard(post) {
    const card = el('article', 'card hs-post');
    const tags = el('div', 'hs-post-tags');
    if (post.is_featured) tags.append(tag('Featured', 'hs-tag-featured'));
    tags.append(tag(UI().KIND_LABELS[post.kind] || 'Post'), tag(categoryName(post.category)));
    const title = el('h2', 'hs-post-title');
    const link = el('a', null, post.title);
    link.href = 'feed.html?post=' + encodeURIComponent(post.id);
    title.append(link);
    card.append(tags, title, UI().byline(post));
    if (post.status !== 'visible') card.append(moderationNotice(post));
    card.append(el('p', 'hs-post-body', excerpt(post.content, 420)));
    if (post.image_url) card.append(image(post, true));
    const foot = el('div', 'hs-post-foot');
    const comments = el('a', 'hs-link-button', post.comment_count === 1 ? '1 comment' : `${post.comment_count} comments`);
    comments.href = link.href + '#hs-comments-heading';
    foot.append(comments);
    if (state.me?.signed_in && post.author_id !== state.me.user_id) foot.append(UI().reportButton('post', post.id));
    card.append(foot);
    return card;
  }

  function image(post, thumb) {
    const figure = el('figure', 'hs-post-image' + (thumb ? ' thumb' : ''));
    const img = document.createElement('img');
    img.src = post.image_url;
    img.alt = 'Image attached to “' + post.title + '”';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => figure.remove());
    figure.append(img);
    return figure;
  }

  function moderationNotice(item) {
    const label = item.status === 'removed' ? 'Removed by the Showduino team' : 'Hidden by the Showduino team';
    const note = el('p', 'hs-moderation-notice', label + '. Only you and the team can see this.');
    if (item.moderation_reason) note.append(el('span', null, ' Reason: ' + item.moderation_reason));
    return note;
  }

  function filters() {
    return {
      category: byId('hs-filter-category').value,
      kind: byId('hs-filter-kind').value,
      search: byId('hs-filter-search').value,
      featured: state.tab === 'featured',
      following: state.tab === 'following'
    };
  }

  function syncUrl() {
    const f = filters();
    const q = new URLSearchParams();
    if (state.tab !== 'latest') q.set('tab', state.tab);
    if (f.category) q.set('category', f.category);
    if (f.kind) q.set('kind', f.kind);
    if (C().searchTerm(f.search)) q.set('q', C().searchTerm(f.search));
    history.replaceState(null, '', 'feed.html' + (q.toString() ? '?' + q : ''));
  }

  async function loadFeed(append) {
    // A new filter always wins over a request still in flight; "load older" waits its turn.
    if (append && state.loading) return;
    const seq = ++state.seq;
    state.loading = true;
    const list = byId('hs-feed-list');
    const status = byId('hs-feed-status');
    const more = byId('hs-feed-more');
    if (!append) { list.replaceChildren(); state.oldest = null; }
    setStatus(status, 'Loading posts…');
    try {
      if (state.tab === 'following' && !state.me?.signed_in) {
        setStatus(status, 'Sign in to see posts from creators you follow.');
        more.hidden = true;
        return;
      }
      const posts = await C().listPosts({ ...filters(), before: append ? state.oldest : null, limit: 20 });
      if (seq !== state.seq) return;
      if (!append) list.replaceChildren();
      posts.forEach((post) => list.append(postCard(post)));
      if (posts.length) state.oldest = posts[posts.length - 1].created_at;
      more.hidden = posts.length < 20;
      const shown = list.children.length;
      setStatus(status, shown ? `${shown} post${shown === 1 ? '' : 's'}.` :
        (state.tab === 'following' ? 'No posts yet from creators you follow. Find creators on the Creators page.' : 'No posts match. Be the first to start one!'));
    } catch (error) {
      if (seq === state.seq) setStatus(status, 'Could not load posts: ' + error.message, 'error');
    } finally {
      if (seq === state.seq) state.loading = false;
    }
  }

  function setupFeed() {
    const p = params();
    const cat = byId('hs-filter-category');
    state.categories.forEach((c) => { const o = el('option', null, c.name); o.value = c.slug; cat.append(o); });
    const kind = byId('hs-filter-kind');
    Object.entries(UI().KIND_LABELS).forEach(([value, label]) => { const o = el('option', null, label); o.value = value; kind.append(o); });
    if (state.categories.some((c) => c.slug === p.get('category'))) cat.value = p.get('category');
    if (UI().KIND_LABELS[p.get('kind')]) kind.value = p.get('kind');
    byId('hs-filter-search').value = C().searchTerm(p.get('q'));
    if (['following', 'featured'].includes(p.get('tab'))) state.tab = p.get('tab');
    document.querySelectorAll('.hs-tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab));
      tab.addEventListener('click', () => {
        state.tab = tab.dataset.tab;
        document.querySelectorAll('.hs-tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
        syncUrl(); loadFeed(false);
      });
    });
    let timer = null;
    const changed = () => { clearTimeout(timer); timer = setTimeout(() => { syncUrl(); loadFeed(false); }, 300); };
    cat.addEventListener('change', changed);
    kind.addEventListener('change', changed);
    byId('hs-filter-search').addEventListener('input', changed);
    byId('hs-feed-more').addEventListener('click', () => loadFeed(true));
    setupComposer();
    loadFeed(false);
  }

  /* ── composer ─────────────────────────────────────────────────────────── */

  function gateMessage(node, action) {
    node.replaceChildren();
    const me = state.me;
    const link = (href, text) => { const a = el('a', null, text); a.href = href; return a; };
    if (!me?.signed_in) {
      node.append(link('account.html', 'Sign in or create a free Showduino account'), document.createTextNode(` to ${action}.`));
      return false;
    }
    if (me.status === 'suspended' || me.status === 'restricted') {
      node.textContent = `Your account is ${me.status}, so you cannot ${action} at the moment.`;
      return false;
    }
    if (!me.published) {
      node.append(document.createTextNode(`To ${action}, first `), link('profile.html', 'publish your creator profile'),
        document.createTextNode('. Every post shows the creator name and username you choose there.'));
      return false;
    }
    return true;
  }

  function setupComposer() {
    const area = byId('hs-composer-area');
    const gate = byId('hs-composer-gate');
    const form = byId('hs-composer');
    if (!gateMessage(gate, 'post')) { form.hidden = true; return; }
    gate.hidden = true;
    const opener = byId('hs-composer-open');
    opener.hidden = false;
    opener.addEventListener('click', () => {
      form.hidden = false;
      opener.hidden = true;
      opener.setAttribute('aria-expanded', 'true');
      byId('hs-post-title').focus();
    });
    const cat = byId('hs-post-category');
    state.categories.forEach((c) => { const o = el('option', null, c.name); o.value = c.slug; cat.append(o); });
    cat.value = state.categories.some((c) => c.slug === 'general') ? 'general' : (state.categories[0]?.slug || '');
    const kind = byId('hs-post-kind');
    Object.entries(UI().KIND_LABELS).forEach(([value, label]) => { const o = el('option', null, label); o.value = value; kind.append(o); });
    const content = byId('hs-post-content');
    content.addEventListener('input', () => { byId('hs-post-count').textContent = String(content.value.length); });
    const file = byId('hs-post-image');
    const preview = byId('hs-post-image-preview');
    let previewUrl = null;
    file.addEventListener('change', async () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      preview.replaceChildren();
      preview.hidden = true;
      const chosen = file.files?.[0];
      if (!chosen) return;
      const status = byId('hs-composer-status');
      if (chosen.size > C().IMAGE_MAX_BYTES) { setStatus(status, 'Images must be 3 MB or smaller.', 'error'); file.value = ''; return; }
      if (!(await C().sniffImage(chosen))) { setStatus(status, 'Images must be JPEG, PNG or WebP.', 'error'); file.value = ''; return; }
      setStatus(status, '');
      previewUrl = URL.createObjectURL(chosen);
      const img = document.createElement('img');
      img.src = previewUrl;
      img.alt = 'Preview of the image you chose';
      const remove = el('button', 'btn secondary', 'Remove image');
      remove.type = 'button';
      remove.addEventListener('click', () => { file.value = ''; preview.replaceChildren(); preview.hidden = true; });
      preview.append(img, remove);
      preview.hidden = false;
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = byId('hs-composer-status');
      const button = byId('hs-post-submit');
      button.disabled = true;
      setStatus(status, 'Publishing…');
      try {
        const id = await C().createPost({
          title: byId('hs-post-title').value, content: content.value, category: cat.value, kind: kind.value,
          imageFile: file.files?.[0] || null
        });
        location.href = 'feed.html?post=' + encodeURIComponent(id);
      } catch (error) {
        setStatus(status, error.message, 'error');
        button.disabled = false;
      }
    });
    area.hidden = false;
  }

  /* ── single post ──────────────────────────────────────────────────────── */

  async function showPost(id) {
    byId('hs-feed-view').hidden = true;
    byId('hs-post-view').hidden = false;
    const detail = byId('hs-post-detail');
    detail.replaceChildren(el('p', 'hs-inline-status', 'Loading post…'));
    let post;
    try { post = await C().getPost(id); } catch (error) { detail.replaceChildren(el('p', 'hs-inline-status error', error.message)); return; }
    if (!post) { detail.replaceChildren(el('p', 'hs-inline-status error', 'This post is not available. It may have been removed.')); byId('hs-comments-heading').parentElement.hidden = true; return; }
    document.title = post.title + ' | HauntSync Community';
    renderPost(detail, post);
    await renderComments(post);
  }

  function renderPost(detail, post) {
    const tags = el('div', 'hs-post-tags');
    if (post.is_featured) tags.append(tag('Featured', 'hs-tag-featured'));
    tags.append(tag(UI().KIND_LABELS[post.kind] || 'Post'), tag(categoryName(post.category)));
    detail.replaceChildren(tags, el('h1', 'hs-post-title', post.title), UI().byline(post));
    if (post.status !== 'visible') detail.append(moderationNotice(post));
    detail.append(el('p', 'hs-post-body', post.content));
    if (post.image_url) detail.append(image(post, false));
    const foot = el('div', 'hs-post-foot');
    const mine = state.me?.user_id && post.author_id === state.me.user_id;
    if (mine) {
      const edit = el('button', 'hs-link-button', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => editPost(detail, post));
      const del = el('button', 'hs-link-button danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm('Delete this post and its comments? This cannot be undone.')) return;
        try { await C().deletePost(post.id); location.href = 'feed.html'; } catch (error) { alert(error.message); }
      });
      foot.append(edit, del);
    } else if (state.me?.signed_in) {
      foot.append(UI().reportButton('post', post.id));
    }
    if (state.me?.role === 'owner') foot.append(ownerActions('post', post, () => showPost(post.id)));
    detail.append(foot);
  }

  function ownerActions(type, item, refresh) {
    const wrap = el('span', 'hs-owner-actions');
    wrap.append(el('span', 'hs-owner-label', 'Founder:'));
    const act = (label, action) => {
      const b = el('button', 'hs-link-button', label);
      b.type = 'button';
      b.addEventListener('click', async () => {
        const reason = ['hide', 'remove'].includes(action) ? prompt('Reason (shown to the author):', '') : '';
        if (reason === null) return;
        try { await C().admin.moderate(type, item.id, action, reason); refresh(); } catch (error) { alert(error.message); }
      });
      wrap.append(b);
    };
    if (item.status === 'visible') { act('Hide', 'hide'); act('Remove', 'remove'); } else act('Restore', 'restore');
    if (type === 'post' && item.status === 'visible') act(item.is_featured ? 'Unfeature' : 'Feature', item.is_featured ? 'unfeature' : 'feature');
    return wrap;
  }

  function editPost(detail, post) {
    const form = el('form', 'hs-composer');
    const title = el('input', 'form-control'); title.maxLength = 120; title.value = post.title;
    const body = el('textarea', 'form-control'); body.rows = 8; body.maxLength = 5000; body.value = post.content;
    const status = el('p', 'hs-inline-status');
    const save = el('button', 'btn', 'Save changes'); save.type = 'submit';
    const cancel = el('button', 'btn secondary', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => renderPost(detail, post));
    const t = el('label', 'hs-field-label', 'Title'); t.append(title);
    const b = el('label', 'hs-field-label', 'Post'); b.append(body);
    const row = el('div', 'button-row'); row.append(save, cancel);
    form.append(t, b);
    let removeImage = false;
    if (post.image_path) {
      const box = el('label', 'hs-check');
      const check = el('input'); check.type = 'checkbox';
      check.addEventListener('change', () => { removeImage = check.checked; });
      box.append(check, document.createTextNode(' Remove the image'));
      form.append(box);
    }
    form.append(status, row);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await C().updatePost(post.id, { title: title.value, content: body.value, category: post.category, kind: post.kind, sharedShowId: post.shared_show_id, removeImage });
        showPost(post.id);
      } catch (error) { setStatus(status, error.message, 'error'); save.disabled = false; }
    });
    detail.replaceChildren(form);
    title.focus();
  }

  async function renderComments(post) {
    const list = byId('hs-comment-list');
    list.replaceChildren(el('p', 'hs-inline-status', 'Loading comments…'));
    let comments = [];
    try { comments = await C().listComments(post.id); } catch (error) { list.replaceChildren(el('p', 'hs-inline-status error', error.message)); return; }
    list.replaceChildren();
    const top = comments.filter((c) => !c.parent_id);
    const replies = (id) => comments.filter((c) => c.parent_id === id);
    if (!top.length) list.append(el('p', 'muted', 'No comments yet.'));
    top.forEach((c) => {
      const node = commentNode(post, c);
      const thread = el('div', 'hs-replies');
      replies(c.id).forEach((r) => thread.append(commentNode(post, r)));
      node.append(thread);
      list.append(node);
    });
    const form = byId('hs-comment-form');
    const gate = byId('hs-comment-gate');
    const canComment = post.status === 'visible' && gateMessage(gate, 'comment');
    form.hidden = !canComment;
    gate.hidden = canComment;
    if (canComment && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = byId('hs-comment-text');
        const status = byId('hs-comment-status');
        try {
          await C().addComment(post.id, text.value);
          text.value = '';
          setStatus(status, 'Comment added.', 'success');
          renderComments(post);
        } catch (error) { setStatus(status, error.message, 'error'); }
      });
    }
  }

  function commentNode(post, c) {
    const node = el('article', 'hs-comment');
    node.id = 'comment-' + c.id;
    node.append(UI().byline(c));
    if (c.status !== 'visible') node.append(moderationNotice(c));
    node.append(el('p', 'hs-comment-body', c.content));
    const foot = el('div', 'hs-post-foot');
    const mine = state.me?.user_id && c.author_id === state.me.user_id;
    if (state.me?.can_participate && post.status === 'visible') {
      const reply = el('button', 'hs-link-button', 'Reply');
      reply.type = 'button';
      reply.addEventListener('click', () => replyForm(post, c, node));
      foot.append(reply);
    }
    if (mine) {
      const edit = el('button', 'hs-link-button', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => {
        const text = prompt('Edit your comment:', c.content);
        if (text == null) return;
        C().updateComment(c.id, text).then(() => renderComments(post)).catch((e) => alert(e.message));
      });
      const del = el('button', 'hs-link-button danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', () => {
        if (!confirm('Delete this comment?')) return;
        C().deleteComment(c.id).then(() => renderComments(post)).catch((e) => alert(e.message));
      });
      foot.append(edit, del);
    } else if (state.me?.signed_in) {
      foot.append(UI().reportButton('comment', c.id));
    }
    if (state.me?.role === 'owner') foot.append(ownerActions('comment', c, () => renderComments(post)));
    node.append(foot);
    return node;
  }

  function replyForm(post, parent, node) {
    if (node.querySelector(':scope > .hs-reply-form')) return;
    const form = el('form', 'hs-reply-form');
    const label = el('label', 'hs-field-label', 'Reply to ' + (parent.author?.display_name || parent.author_name));
    const text = el('textarea', 'form-control'); text.rows = 2; text.maxLength = 2500; text.required = true;
    label.append(text);
    const status = el('p', 'hs-inline-status');
    const send = el('button', 'btn', 'Reply'); send.type = 'submit';
    const cancel = el('button', 'btn secondary', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => form.remove());
    const row = el('div', 'button-row'); row.append(send, cancel);
    form.append(label, status, row);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await C().addComment(post.id, text.value, parent.id); renderComments(post); } catch (error) { setStatus(status, error.message, 'error'); }
    });
    node.insertBefore(form, node.querySelector(':scope > .hs-replies'));
    text.focus();
  }

  /* ── start ────────────────────────────────────────────────────────────── */

  async function init() {
    const status = byId('hs-feed-status');
    if (!window.ShowduinoSupabase?.enabled() || !C()) {
      setStatus(status, 'The community is not available right now.', 'error');
      byId('hs-composer-area').hidden = true;
      return;
    }
    try {
      const [me, categories, user] = await Promise.all([C().status(), C().categories(), window.ShowduinoSupabase.getCurrentUser()]);
      state.me = { ...me, user_id: user?.id || null };
      state.categories = categories;
    } catch (error) {
      setStatus(status, 'Could not reach HauntSync: ' + error.message, 'error');
      return;
    }
    const postId = params().get('post');
    if (postId) await showPost(postId);
    else setupFeed();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
