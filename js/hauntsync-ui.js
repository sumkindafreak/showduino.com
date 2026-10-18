/* HauntSync shared interface helpers (W004).
 *
 * Everything that came from a user (names, titles, posts, comments, file names, URLs) is put
 * on the page with textContent or validated attributes, never as HTML.
 * The admin link is shown only when the database says the signed-in account is the owner;
 * the admin page and every admin action are still checked by the database itself.
 */
(function () {
  'use strict';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function initials(name) {
    return String(name || 'Creator').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'HS';
  }

  function avatar(creator, size) {
    const box = el('span', 'hs-avatar' + (size === 'small' ? ' hs-avatar-small' : ''));
    const url = String(creator?.avatar_url || '');
    const fallback = () => box.replaceChildren(el('span', null, initials(creator?.display_name)));
    // Avatars come only from this project's storage (enforced by a database constraint too).
    if (/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/hauntsync-avatars\//.test(url)) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.className = 'hs-avatar-photo';
      img.src = url;
      img.addEventListener('error', fallback);
      box.append(img);
    } else {
      fallback();
    }
    return box;
  }

  function founderBadge() {
    const badge = el('span', 'hs-founder-badge', 'Showduino Founder');
    badge.title = 'Founder and administrator of Showduino and HauntSync';
    return badge;
  }

  function creatorLink(creator, fallbackName) {
    if (creator?.username && /^[a-z0-9_-]{3,30}$/.test(creator.username)) {
      const a = el('a', 'hs-author-link', creator.display_name || fallbackName || creator.username);
      a.href = 'creator.html?u=' + encodeURIComponent(creator.username);
      return a;
    }
    return el('span', 'hs-author-link', fallbackName || 'HauntSync creator');
  }

  function byline(item) {
    const row = el('div', 'hs-byline');
    row.append(avatar(item.author || { display_name: item.author_name }, 'small'), creatorLink(item.author, item.author_name));
    if (item.is_founder) row.append(founderBadge());
    const when = el('time', 'hs-when', timeAgo(item.created_at));
    if (item.created_at) when.dateTime = item.created_at;
    when.title = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    row.append(when);
    if (item.edited_at) row.append(el('span', 'hs-edited', 'edited'));
    return row;
  }

  function timeAgo(value) {
    const t = Date.parse(value);
    if (!Number.isFinite(t)) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    return new Date(t).toLocaleDateString();
  }

  const KIND_LABELS = { discussion: 'Discussion', build_log: 'Build log', showcase: 'Showcase', question: 'Question' };
  const REASON_LABELS = {
    spam: 'Spam or advertising', harassment: 'Harassment or bullying', hateful: 'Hateful content',
    sexual: 'Sexual content', violence: 'Violence or threats', dangerous: 'Dangerous instructions',
    impersonation: 'Impersonation', copyright: 'Copyright', unsafe_show: 'Unsafe show file or wiring advice', other: 'Something else'
  };

  /* ── report dialog ───────────────────────────────────────────────────── */

  function reportButton(targetType, targetId, label) {
    const button = el('button', 'hs-link-button hs-report', label || 'Report');
    button.type = 'button';
    button.addEventListener('click', () => openReport(targetType, targetId, button));
    return button;
  }

  function openReport(targetType, targetId, returnFocus) {
    const dialog = el('dialog', 'hs-dialog');
    dialog.setAttribute('aria-labelledby', 'hs-report-title');
    const form = el('form', 'hs-dialog-form');
    form.method = 'dialog';
    form.append(el('h2', null, 'Report to the Showduino team'));
    form.firstChild.id = 'hs-report-title';
    form.append(el('p', 'muted', 'Reports go only to the founder, who reviews them. The person you report is not told who reported them.'));
    const reasonLabel = el('label', 'hs-field-label', 'Reason');
    const reason = el('select', 'form-control');
    reason.setAttribute('aria-required', 'true');   // validated below with a visible message
    reason.append(el('option', null, 'Choose a reason…'));
    reason.firstChild.value = '';
    Object.entries(REASON_LABELS).forEach(([value, text]) => { const o = el('option', null, text); o.value = value; reason.append(o); });
    reasonLabel.append(reason);
    const detailsLabel = el('label', 'hs-field-label', 'Details (optional)');
    const details = el('textarea', 'form-control');
    details.maxLength = 1000;
    details.rows = 4;
    detailsLabel.append(details);
    const status = el('p', 'hs-inline-status');
    status.setAttribute('role', 'status');
    const actions = el('div', 'button-row');
    const cancel = el('button', 'btn secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    const send = el('button', 'btn', 'Send report');
    send.type = 'submit';
    actions.append(send, cancel);
    form.append(reasonLabel, detailsLabel, status, actions);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!reason.value) { status.textContent = 'Choose a reason.'; return; }
      send.disabled = true;
      try {
        await window.HauntSyncCommunity.report(targetType, targetId, reason.value, details.value);
        status.textContent = 'Thank you. Your report was sent.';
        status.className = 'hs-inline-status success';
        setTimeout(() => dialog.close(), 1200);
      } catch (error) {
        status.textContent = error.message;
        status.className = 'hs-inline-status error';
        send.disabled = false;
      }
    });
    dialog.append(form);
    dialog.addEventListener('close', () => { dialog.remove(); returnFocus?.focus?.(); });
    document.body.append(dialog);
    dialog.showModal();
    reason.focus();
  }

  /* ── HauntSync sub-navigation ─────────────────────────────────────────── */

  const SECTIONS = [
    ['feed.html', 'Community'],
    ['creators.html', 'Creators'],
    ['community.html', 'Projects'],
    ['profile.html', 'My Profile']
  ];

  function currentPage() {
    const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') + '.html';
    return page === 'creator.html' ? 'creators.html' : page;
  }

  async function renderSubnav() {
    const host = document.getElementById('hs-subnav');
    if (!host) return;
    const nav = el('nav', 'hs-subnav');
    nav.setAttribute('aria-label', 'HauntSync');
    const here = currentPage();
    SECTIONS.forEach(([href, label]) => {
      const a = el('a', null, label);
      a.href = href;
      if (href === here) a.setAttribute('aria-current', 'page');
      nav.append(a);
    });
    host.replaceChildren(nav);
    try {
      const me = await window.HauntSyncCommunity?.status?.();
      if (me?.role === 'owner') {
        const a = el('a', 'hs-subnav-admin', 'Admin');
        a.href = 'admin.html';
        if (here === 'admin.html') a.setAttribute('aria-current', 'page');
        nav.append(a);
      }
      if (me?.signed_in && me.status && me.status !== 'active') {
        const notice = el('p', 'hs-account-notice', me.status === 'suspended'
          ? 'Your HauntSync account is suspended: your profile and posts are hidden and you cannot post.'
          : 'Your HauntSync account is restricted: you can read, but you cannot post, comment or share for now.');
        if (me.status_reason) notice.append(el('span', null, ' Reason: ' + me.status_reason));
        host.append(notice);
      }
    } catch (_) { /* the links above still work signed out or offline */ }
  }

  document.addEventListener('DOMContentLoaded', renderSubnav);

  window.HauntSyncUI = Object.freeze({ el, avatar, founderBadge, creatorLink, byline, timeAgo, reportButton, openReport, KIND_LABELS, REASON_LABELS, renderSubnav });
})();
