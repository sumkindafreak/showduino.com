/* HauntSync public creator directory — opt-in snapshots only, no private profile requests. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = (msg, error=false) => {
    const el = byId('hs-creators-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'hs-inline-status' + (error?' error':'');
  };
  const txt = (tag, value, cls) => {
    const el = document.createElement(tag);
    el.textContent = String(value == null ? '' : value);
    if (cls) el.className = cls;
    return el;
  };
  function avatar(creator) {
    const el = txt('div','','hs-avatar');
    const initials = String(creator.display_name || 'Creator').trim().split(/\s+/).slice(0,2)
      .map(part=>part.charAt(0)).join('').toUpperCase() || 'HS';
    if (creator.avatar_url && /^https:\/\//.test(creator.avatar_url)) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.className = 'hs-avatar-photo';
      img.referrerPolicy = 'no-referrer';
      img.src = creator.avatar_url;
      img.addEventListener('error', () => {img.remove();el.append(txt('span',initials));});
      el.append(img);
    } else { el.append(txt('span',initials)); }
    return el;
  }
  let founder = null;
  function creatorUrl(username) {
    return 'creator.html?u=' + encodeURIComponent(username);
  }
  function card(creator) {
    const article = txt('article','','card hs-public-creator-card');
    const row = txt('div','','hs-creator-person');
    const info = txt('div','');
    const link = txt('a',creator.display_name || 'HauntSync creator','hs-creator-name');
    link.href = creatorUrl(creator.username);
    info.append(link);
    if (founder && creator.creator_id === founder && window.HauntSyncUI) info.append(window.HauntSyncUI.founderBadge());
    info.append(txt('p','@'+creator.username,'hs-handle'),txt('p',creator.creator_focus || 'Creative projects','hs-focus-text'));
    row.append(avatar(creator),info);
    article.append(row,txt('p',creator.bio || 'Discover this creator’s projects and public work.','hs-profile-about'));
    const open = txt('a','View creator','btn secondary');
    open.href = creatorUrl(creator.username);
    article.append(open);
    return article;
  }
  function safeWebsite(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null;
    } catch (_) { return null; }
  }
  async function directory() {
    const list = byId('hs-creators-list');
    const search = byId('hs-creator-search');
    if (!list) return;
    const creators = await window.ShowduinoSupabase.listPublicCreators();
    function render() {
      const q = search.value.trim().toLowerCase();
      const shown = creators.filter(c=>[c.display_name,c.username,c.creator_focus,c.bio]
        .some(value=>String(value||'').toLowerCase().includes(q)));
      list.replaceChildren();
      if (!shown.length) list.append(txt('p',q?'No creators match this search.':'No public creator profiles yet. Be the first!','hs-inline-status'));
      for (const item of shown) list.append(card(item));
      status(shown.length+' public creator'+(shown.length===1?'':'s')+' found.');
    }
    search.addEventListener('input',render);
    render();
  }
  async function detail() {
    const handle = new URLSearchParams(location.search).get('u');
    if (!handle || !/^[a-z0-9_-]{3,30}$/.test(handle)) {
      status('Choose a creator from the directory.',true); return;
    }
    const creator = await window.ShowduinoSupabase.getPublicCreator(handle);
    if (!creator) {status('That creator profile is not publicly available.',true);return;}
    const head=byId('hs-public-creator-head'), actions=byId('hs-public-creator-actions');
    const info=txt('div','');
    const nameRow=txt('div','','hs-byline');
    nameRow.append(txt('h2',creator.display_name));
    if (founder && creator.creator_id === founder && window.HauntSyncUI) nameRow.append(window.HauntSyncUI.founderBadge());
    info.append(nameRow,txt('p','@'+creator.username,'hs-handle'),txt('p',creator.creator_focus||'Creative technology','hs-focus-text'));
    head.replaceChildren(avatar(creator),info);
    byId('hs-public-creator-bio').textContent=creator.bio||'This creator has not added a bio yet.';
    actions.replaceChildren();
    const website=safeWebsite(creator.website_url);
    if (website) {
      const link=txt('a','Creator website','btn secondary');
      link.href=website;link.rel='noopener noreferrer nofollow';link.target='_blank';
      actions.append(link);
    }
    byId('hs-public-creator-detail').hidden=false;
    await communityExtras(creator, info);
    const shows=await window.ShowduinoSupabase.listPublicCreatorShows(creator.creator_id);
    const area=byId('hs-public-creator-shows'), list=byId('hs-public-creator-shows-list');
    list.replaceChildren();
    if(!shows.length) list.append(txt('p','No publicly shared .shdo templates from this creator yet.','hs-inline-status'));
    for(const show of shows){
      const item=txt('article','','card hs-public-creator-card');
      item.append(txt('h3',show.title),txt('p',show.summary||'No description yet.','hs-profile-about'));
      const a=txt('a','Find in Show Library','btn secondary');
      // The library is a separate moderated/download flow; do not launch content here.
      a.href='community.html?show='+encodeURIComponent(show.id);
      item.append(a);list.append(item);
    }
    area.hidden=false;
    status('Viewing public creator @'+creator.username+'.');
    document.title=creator.display_name+' | HauntSync Creator';
  }
  // W004: founder badge, public stats, follow, report and recent posts (needs js/cloud/hauntsync-community.js).
  async function communityExtras(creator, info) {
    const C = window.HauntSyncCommunity, UI = window.HauntSyncUI;
    if (!C || !UI) return;
    try {
      const stats = await C.creatorStats(creator.creator_id);
      if (stats) {
        const row = txt('p','','hs-creator-stats');
        const stat = (n, label) => { const s = txt('span',''); s.append(txt('strong',String(n ?? 0)), document.createTextNode(' ' + label)); return s; };
        row.append(stat(stats.followers,'followers'), stat(stats.following,'following'), stat(stats.posts,'posts'), stat(stats.shows,'shared shows'));
        if (stats.joined) row.append(txt('span','Member since ' + new Date(stats.joined + 'T00:00:00Z').toLocaleDateString(undefined,{month:'long',year:'numeric'})));
        info.append(row);
      }
      const me = await C.status();
      const user = me.signed_in ? await window.ShowduinoSupabase.getCurrentUser() : null;
      const actions = byId('hs-public-creator-actions');
      if (user && user.id !== creator.creator_id) {
        let following = await C.isFollowing(creator.creator_id);
        const btn = txt('button', following ? 'Following ✓' : 'Follow', 'btn');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(following));
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            if (following) await C.unfollow(creator.creator_id); else await C.follow(creator.creator_id);
            following = !following;
            btn.textContent = following ? 'Following ✓' : 'Follow';
            btn.setAttribute('aria-pressed', String(following));
          } catch (err) { status(err.message, true); }
          btn.disabled = false;
        });
        actions.append(btn, UI.reportButton('creator', creator.creator_id, 'Report profile'));
      } else if (!user) {
        const a = txt('a','Sign in to follow','btn secondary'); a.href = 'account.html'; actions.append(a);
      }
      const posts = await C.listPosts({ authorId: creator.creator_id, limit: 5 });
      if (posts.length) {
        const section = byId('hs-public-creator-posts');
        const list = byId('hs-public-creator-posts-list');
        posts.forEach((p) => {
          const item = txt('article','','card hs-public-creator-card');
          const a = txt('a', p.title); a.href = 'feed.html?post=' + encodeURIComponent(p.id);
          const h = txt('h3',''); h.append(a);
          item.append(h, txt('p', String(p.content).slice(0, 200) + (p.content.length > 200 ? '…' : ''), 'hs-profile-about'));
          list.append(item);
        });
        if (section) section.hidden = false;
      }
    } catch (_) { /* the profile itself is already shown */ }
  }

  async function init() {
    if (!window.ShowduinoSupabase?.enabled()) {
      status('Community profiles are not configured at the moment.',true);return;
    }
    try {
      if (window.HauntSyncCommunity) founder = await window.HauntSyncCommunity.founderId();
      if(byId('hs-creators-list'))await directory();else await detail();
    }
    catch(err){status('Could not load public creators: '+(err?.message||'service unavailable'),true);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();