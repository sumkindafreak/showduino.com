/* HauntSync founder dashboard (W004).
 * The page renders only after the database confirms the signed-in account is the owner, and
 * every action is a database function that checks that again. Editing this file, the requests
 * or browser storage cannot grant access. User text is rendered with textContent only. */
(function () {
  'use strict';
  const C = () => window.HauntSyncCommunity;
  const UI = () => window.HauntSyncUI;
  const byId = (id) => document.getElementById(id);
  const el = (...a) => UI().el(...a);
  const loaded = new Set();

  function status(message, kind) {
    const node = byId('hs-admin-status');
    node.textContent = message || '';
    node.className = 'hs-inline-status' + (kind ? ' ' + kind : '');
  }

  function button(label, onClick, cls) {
    const b = el('button', 'btn small ' + (cls || 'secondary'), label);
    b.type = 'button';
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await onClick(); } catch (error) { status(error.message, 'error'); } finally { b.disabled = false; }
    });
    return b;
  }

  function askReason(question) {
    const value = prompt(question, '');
    return value === null ? null : value.trim();
  }

  const when = (v) => (v ? new Date(v).toLocaleString() : '');

  /* overview */
  async function overview() {
    const s = await C().admin.stats();
    const grid = byId('hs-stats');
    grid.replaceChildren();
    const tiles = [
      ['Members', s.members], ['Published creators', s.published_creators], ['Open reports', s.open_reports],
      ['Posts', s.posts], ['Posts this week', s.posts_7d], ['Hidden or removed posts', s.posts_hidden],
      ['Comments', s.comments], ['Comments this week', s.comments_7d], ['Shared shows', s.shared_shows],
      ['Follows', s.follows], ['Restricted', s.restricted], ['Suspended', s.suspended], ['Moderation actions (30 days)', s.moderation_actions_30d]
    ];
    tiles.forEach(([label, value]) => {
      const tile = el('div', 'card hs-stat');
      tile.append(el('strong', null, String(value ?? 0)), el('span', null, label));
      grid.append(tile);
    });
    byId('hs-open-count').textContent = s.open_reports ? String(s.open_reports) : '';
  }

  /* reports */
  function preview(report) {
    const t = report.target;
    const box = el('div', 'hs-report-target');
    if (!t) { box.append(el('p', 'muted', 'The reported item no longer exists.')); return box; }
    if (report.target_type === 'post') {
      const a = el('a', null, t.title); a.href = 'feed.html?post=' + encodeURIComponent(t.id);
      const h = el('h3'); h.append(a);
      box.append(h, el('p', 'hs-post-body', String(t.content || '').slice(0, 400)), el('p', 'muted', `By ${t.author_name} · status: ${t.status}`));
    } else if (report.target_type === 'comment') {
      const a = el('a', null, 'Open the post'); a.href = 'feed.html?post=' + encodeURIComponent(t.post_id) + '#comment-' + encodeURIComponent(t.id);
      box.append(el('p', 'hs-post-body', String(t.content || '').slice(0, 400)), el('p', 'muted', `Comment by ${t.author_name} · status: ${t.status}`), a);
    } else if (report.target_type === 'shared_show') {
      box.append(el('h3', null, t.title), el('p', 'hs-post-body', t.summary || ''), el('p', 'muted', `Shared by ${t.author_label} · status: ${t.status}`));
    } else {
      const a = el('a', null, (t.display_name || '') + ' (@' + t.username + ')'); a.href = 'creator.html?u=' + encodeURIComponent(t.username);
      box.append(el('p', null, 'Creator profile: '), a);
    }
    return box;
  }

  async function reports() {
    const list = byId('hs-report-list');
    const rows = await C().admin.reports(byId('hs-report-filter').value);
    list.replaceChildren();
    if (!rows.length) list.append(el('p', 'muted', 'No reports here.'));
    rows.forEach((r) => {
      const card = el('article', 'card hs-admin-item');
      const head = el('div', 'hs-post-tags');
      head.append(el('span', 'hs-tag', r.target_type.replace('_', ' ')), el('span', 'hs-tag hs-tag-featured', UI().REASON_LABELS[r.reason] || r.reason), el('span', 'hs-tag', r.status));
      card.append(head, preview(r));
      if (r.details) card.append(el('p', 'hs-report-details', 'Reporter says: ' + r.details));
      card.append(el('p', 'muted', `Reported ${when(r.created_at)} by ${r.reporter ? '@' + r.reporter.username : 'a member'}` + (r.resolution_note ? ` · Note: ${r.resolution_note}` : '')));
      const actions = el('div', 'button-row');
      const t = r.target;
      if (t && r.target_type !== 'creator') {
        if (t.status === 'visible') {
          actions.append(button('Hide', async () => { const why = askReason('Reason (shown to the author):'); if (why === null) return; await C().admin.moderate(r.target_type, t.id, 'hide', why); await C().admin.resolveReport(r.id, 'actioned', 'Hidden: ' + why); refresh('reports'); }, 'danger'));
          actions.append(button('Remove', async () => { const why = askReason('Reason (shown to the author):'); if (why === null) return; await C().admin.moderate(r.target_type, t.id, 'remove', why); await C().admin.resolveReport(r.id, 'actioned', 'Removed: ' + why); refresh('reports'); }, 'danger'));
        } else {
          actions.append(button('Restore content', async () => { await C().admin.moderate(r.target_type, t.id, 'restore', 'Restored from report review'); refresh('reports'); }));
        }
      }
      if (r.status === 'open') {
        actions.append(button('Dismiss', async () => { const note = askReason('Note for the audit log (optional):'); if (note === null) return; await C().admin.resolveReport(r.id, 'dismissed', note); refresh('reports'); }));
        actions.append(button('Mark actioned', async () => { const note = askReason('What was done?'); if (note === null) return; await C().admin.resolveReport(r.id, 'actioned', note); refresh('reports'); }));
      } else {
        actions.append(button('Reopen', async () => { await C().admin.resolveReport(r.id, 'open', 'Reopened'); refresh('reports'); }));
      }
      card.append(actions);
      list.append(card);
    });
  }

  /* posts */
  async function content() {
    const list = byId('hs-content-list');
    const posts = await C().admin.content(byId('hs-content-filter').value);
    list.replaceChildren();
    if (!posts.length) list.append(el('p', 'muted', 'No posts.'));
    posts.forEach((p) => {
      const card = el('article', 'card hs-admin-item');
      const a = el('a', null, p.title); a.href = 'feed.html?post=' + encodeURIComponent(p.id);
      const h = el('h3'); h.append(a);
      const tags = el('div', 'hs-post-tags');
      tags.append(el('span', 'hs-tag', p.status));
      if (p.is_featured) tags.append(el('span', 'hs-tag hs-tag-featured', 'Featured'));
      card.append(tags, h, UI().byline(p), el('p', 'hs-post-body', String(p.content).slice(0, 300)));
      if (p.moderation_reason) card.append(el('p', 'muted', 'Moderation reason: ' + p.moderation_reason));
      const actions = el('div', 'button-row');
      if (p.status === 'visible') {
        actions.append(button('Hide', async () => { const why = askReason('Reason (shown to the author):'); if (why === null) return; await C().admin.moderate('post', p.id, 'hide', why); refresh('content'); }, 'danger'));
        actions.append(button('Remove', async () => { const why = askReason('Reason (shown to the author):'); if (why === null) return; await C().admin.moderate('post', p.id, 'remove', why); refresh('content'); }, 'danger'));
        actions.append(button(p.is_featured ? 'Unfeature' : 'Feature', async () => { await C().admin.moderate('post', p.id, p.is_featured ? 'unfeature' : 'feature', ''); refresh('content'); }));
      } else {
        actions.append(button('Restore', async () => { await C().admin.moderate('post', p.id, 'restore', ''); refresh('content'); }));
      }
      if (p.image_path) actions.append(button('Delete image file', async () => { if (!confirm('Delete the image file from storage? The post stays.')) return; await C().admin.removeImage(p.image_path); status('Image file deleted.', 'success'); }, 'danger'));
      card.append(actions);
      list.append(card);
    });
  }

  /* shared shows */
  async function shows() {
    const list = byId('hs-show-list');
    const rows = await C().admin.sharedShows();
    list.replaceChildren();
    if (!rows.length) list.append(el('p', 'muted', 'No shared shows yet.'));
    rows.forEach((s) => {
      const card = el('article', 'card hs-admin-item');
      const tags = el('div', 'hs-post-tags');
      tags.append(el('span', 'hs-tag', s.status), el('span', 'hs-tag', s.category), el('span', 'hs-tag', s.license));
      if (s.is_featured) tags.append(el('span', 'hs-tag hs-tag-featured', 'Featured'));
      card.append(tags, el('h3', null, s.title), el('p', 'hs-post-body', s.summary || ''), el('p', 'muted', `Shared by ${s.author_label} · ${when(s.created_at)}`));
      const open = el('a', 'btn small secondary', 'Open in library'); open.href = 'community.html?show=' + encodeURIComponent(s.id);
      const actions = el('div', 'button-row');
      actions.append(open);
      if (s.status === 'visible') {
        actions.append(button('Hide', async () => { const why = askReason('Reason (shown to the author):'); if (why === null) return; await C().admin.moderate('shared_show', s.id, 'hide', why); refresh('shows'); }, 'danger'));
        actions.append(button(s.is_featured ? 'Unfeature' : 'Feature', async () => { await C().admin.moderate('shared_show', s.id, s.is_featured ? 'unfeature' : 'feature', ''); refresh('shows'); }));
      } else {
        actions.append(button('Restore', async () => { await C().admin.moderate('shared_show', s.id, 'restore', ''); refresh('shows'); }));
      }
      card.append(actions);
      list.append(card);
    });
  }

  /* members */
  async function members() {
    const body = byId('hs-member-table').querySelector('tbody');
    const rows = await C().admin.members(byId('hs-member-search').value);
    body.replaceChildren();
    rows.forEach((m) => {
      const tr = el('tr');
      const who = el('td');
      who.append(el('strong', null, m.display_name || 'Showduino Creator'));
      if (m.username) {
        if (m.published) { const a = el('a', null, ' @' + m.username); a.href = 'creator.html?u=' + encodeURIComponent(m.username); who.append(a); }
        else who.append(el('span', 'muted', ' @' + m.username + ' (not published)'));
      } else who.append(el('span', 'muted', ' (no public profile)'));
      if (m.is_owner) who.append(UI().founderBadge());
      const st = el('td', 'hs-member-status-' + m.status, m.status + (m.status_reason ? ' — ' + m.status_reason : ''));
      const act = el('td');
      if (m.is_owner) {
        act.append(el('span', 'muted', 'Owner (protected)'));
      } else {
        const set = (value, label, cls) => act.append(button(label, async () => {
          const why = askReason(`Reason for "${label}" (the member sees it):`);
          if (why === null) return;
          await C().admin.setMemberStatus(m.user_id, value, why);
          status(`${m.display_name}: ${value}.`, 'success');
          refresh('members');
        }, cls));
        if (m.status !== 'active') set('active', 'Reactivate');
        if (m.status !== 'restricted') set('restricted', 'Restrict');
        if (m.status !== 'suspended') set('suspended', 'Suspend', 'danger');
        act.append(button('Clear photo', async () => {
          const why = askReason('Reason for removing the profile photo:');
          if (why === null) return;
          await C().admin.clearAvatar(m.user_id, why);
          status('Profile photo cleared.', 'success');
        }));
      }
      tr.append(who, el('td', null, m.joined || ''), st, el('td', null, `${m.posts} posts · ${m.comments} comments · ${m.shows} shows · ${m.open_reports} open reports`), act);
      body.append(tr);
    });
    if (!rows.length) { const tr = el('tr'); const td = el('td', 'muted', 'No members match.'); td.colSpan = 5; tr.append(td); body.append(tr); }
  }

  /* categories */
  async function categories() {
    const list = byId('hs-category-list');
    const rows = await C().admin.allCategories();
    list.replaceChildren();
    rows.forEach((c) => {
      const card = el('article', 'card hs-admin-item hs-category-item');
      card.append(el('h3', null, c.name), el('p', 'muted', `${c.slug} · order ${c.sort_order} · ${c.is_active ? 'open for posts' : 'retired'}`), el('p', null, c.description || ''));
      const actions = el('div', 'button-row');
      actions.append(button('Edit', async () => {
        byId('hs-cat-slug').value = c.slug; byId('hs-cat-name').value = c.name; byId('hs-cat-order').value = c.sort_order;
        byId('hs-cat-description').value = c.description || ''; byId('hs-cat-active').checked = c.is_active;
        byId('hs-cat-name').focus();
      }));
      actions.append(button(c.is_active ? 'Retire' : 'Reopen', async () => {
        await C().admin.saveCategory({ ...c, is_active: !c.is_active });
        refresh('categories');
      }));
      card.append(actions);
      list.append(card);
    });
  }

  function bindCategoryForm() {
    byId('hs-category-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await C().admin.saveCategory({
          slug: byId('hs-cat-slug').value.trim(), name: byId('hs-cat-name').value.trim(), description: byId('hs-cat-description').value.trim(),
          sort_order: byId('hs-cat-order').value, is_active: byId('hs-cat-active').checked
        });
        status('Category saved.', 'success');
        event.target.reset();
        refresh('categories');
      } catch (error) { status(error.message, 'error'); }
    });
  }

  /* audit log */
  async function log() {
    const body = byId('hs-log-table').querySelector('tbody');
    const rows = await C().admin.log();
    body.replaceChildren();
    rows.forEach((l) => {
      const tr = el('tr');
      tr.append(el('td', null, when(l.created_at)), el('td', null, l.action.replace(/_/g, ' ')), el('td', null, `${l.target_type} ${String(l.target_id).slice(0, 8)}…`), el('td', null, l.reason || ''));
      body.append(tr);
    });
  }

  const sections = { overview, reports, content, shows, members, categories, log };

  async function refresh(name) {
    status('');
    try { await sections[name](); loaded.add(name); if (name !== 'overview') overview().catch(() => {}); }
    catch (error) { status(error.message, 'error'); }
  }

  function show(name) {
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    document.querySelectorAll('[data-section]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.section === name)));
    if (!loaded.has(name)) refresh(name);
  }

  async function init() {
    const gate = byId('hs-admin-gate');
    if (!window.ShowduinoSupabase?.enabled() || !C()) { gate.textContent = 'HauntSync is not available right now.'; return; }
    let me;
    try { me = await C().status(); } catch (error) { gate.textContent = 'Could not check your access: ' + error.message; return; }
    if (me.role !== 'owner') {
      gate.textContent = me.signed_in ? 'This page is only for the Showduino founder.' : 'Sign in with the founder account to use this page.';
      gate.className = 'hs-inline-status error';
      return;
    }
    gate.textContent = 'Signed in as the Showduino founder.';
    byId('hs-admin').hidden = false;
    document.querySelectorAll('[data-section]').forEach((tab) => tab.addEventListener('click', () => show(tab.dataset.section)));
    byId('hs-report-filter').addEventListener('change', () => refresh('reports'));
    byId('hs-content-filter').addEventListener('change', () => refresh('content'));
    let t = null;
    byId('hs-member-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => refresh('members'), 300); });
    bindCategoryForm();
    show('overview');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
