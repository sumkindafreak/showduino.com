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
  function creatorUrl(username) {
    return 'creator.html?u=' + encodeURIComponent(username);
  }
  function card(creator) {
    const article = txt('article','','card hs-public-creator-card');
    const row = txt('div','','hs-creator-person');
    const info = txt('div','');
    const link = txt('a',creator.display_name || 'HauntSync creator','hs-creator-name');
    link.href = creatorUrl(creator.username);
    info.append(link,txt('p','@'+creator.username,'hs-handle'),txt('p',creator.creator_focus || 'Creative projects','hs-focus-text'));
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
    info.append(txt('h2',creator.display_name),txt('p','@'+creator.username,'hs-handle'),txt('p',creator.creator_focus||'Creative technology','hs-focus-text'));
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
    const shows=await window.ShowduinoSupabase.listPublicCreatorShows(creator.creator_id);
    const area=byId('hs-public-creator-shows'), list=byId('hs-public-creator-shows-list');
    list.replaceChildren();
    if(!shows.length) list.append(txt('p','No publicly shared .shdo templates from this creator yet.','hs-inline-status'));
    for(const show of shows){
      const item=txt('article','','card hs-public-creator-card');
      item.append(txt('h3',show.title),txt('p',show.summary||'No description yet.','hs-profile-about'));
      const a=txt('a','Find in Show Library','btn secondary');
      // The library is a separate moderated/download flow; do not launch content here.
      a.href='community.html';
      item.append(a);list.append(item);
    }
    area.hidden=false;
    status('Viewing public creator @'+creator.username+'.');
    document.title=creator.display_name+' | HauntSync Creator';
  }
  async function init() {
    if (!window.ShowduinoSupabase?.enabled()) {
      status('Community profiles are not configured at the moment.',true);return;
    }
    try {if(byId('hs-creators-list'))await directory();else await detail();}
    catch(err){status('Could not load public creators: '+(err?.message||'service unavailable'),true);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();