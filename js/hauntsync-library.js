/* HauntSync community SHDO library — download-only; never initiates show playback. */
(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const els = {};
  let viewer = null;
  let selected = null;
  let loading = 0;
  let busy = false;
  let publicCreatorsById = new Map();

  function status(message, kind) {
    els.status.textContent = message;
    els.status.className = 'status-banner' + (kind ? ' ' + kind : '');
  }
  function shortDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Recently shared' : d.toLocaleDateString();
  }
  function optionLabel(value) {
    return ({ambience:'Ambience & sound',lighting:'Lighting',pixels:'Pixel FX',
      interactive:'Interactive scenes',props:'Practical effects',other:'Other'})[value] || 'Production';
  }
  function txt(tag, contents, cls) {
    const el = document.createElement(tag);
    el.textContent = String(contents || '');
    if (cls) el.className = cls;
    return el;
  }
  function placeholder(message, heading = 'Nothing shared here yet') {
    els.list.replaceChildren();
    const card = txt('div', '', 'hs-library-placeholder');
    card.append(txt('h3',heading), txt('p',message));
    els.list.append(card);
  }
  function showSummary(templates) {
    els.list.replaceChildren();
    if (!templates.length) return placeholder(
      'Try another category—or be the first to share a Showduino template!');
    for (const item of templates) {
      const card = txt('article', '', 'hs-shared-card');
      card.append(txt('span', optionLabel(item.category), 'eyebrow'));
      card.append(txt('h3', item.title));
      card.append(txt('p', item.summary || 'No description yet.', 'hs-blurb'));
      const meta = txt('p','','hs-meta');
      meta.append(document.createTextNode('by '));
      const publicCreator = publicCreatorsById.get(item.author_id);
      if (publicCreator) {
        const author = txt('a', item.author_label || publicCreator.display_name);
        author.href = 'creator.html?u=' + encodeURIComponent(publicCreator.username);
        meta.append(author);
      } else meta.append(document.createTextNode(item.author_label || 'HauntSync creator'));
      meta.append(document.createTextNode(' · '+shortDate(item.created_at)+' · '+(item.license === 'cc0-1.0' ? 'CC0' : 'CC BY 4.0')));
      card.append(meta);
      const btn = txt('button', 'Preview & download', 'btn secondary');
      btn.type = 'button';
      btn.addEventListener('click', ()=>openShow(item.id));
      card.append(btn); els.list.append(card);
    }
  }
  async function refresh() {
    const seq = ++loading;
    placeholder('Checking the community library…','Loading shows');
    try {
      if (!window.ShowduinoSupabase?.enabled()) throw Error('The community service is currently unavailable.');
      const [rows,creators] = await Promise.all([
        window.ShowduinoSupabase.listSharedShows(els.filter.value),
        window.ShowduinoSupabase.listPublicCreators().catch(()=>[])
      ]);
      publicCreatorsById = new Map(creators.map(item=>[item.creator_id,item]));
      if (seq !== loading) return;
      showSummary(rows);
      status(rows.length ? rows.length+' shared show(s) ready to explore.' :
        'No shared shows in this category yet.','success');
    } catch (error) {
      if (seq !== loading) return;
      placeholder(error.message || 'Community library could not be loaded.','Library unavailable');
      status('Could not load community shows: '+error.message,'error');
    }
  }
  async function openShow(id) {
    if (busy) return;
    selected = null;
    status('Checking the shared production…');
    try {
      const entry = await window.ShowduinoSupabase.loadSharedShow(id);
      window.HauntSyncShare.validate(entry.document);
      selected = entry;
      els.previewTitle.textContent = entry.title;
      els.previewAuthor.textContent = 'Shared by '+entry.author_label+' · '+optionLabel(entry.category)+' · '+(entry.license === 'cc0-1.0' ? 'CC0 1.0' : 'CC BY 4.0');
      els.previewSummary.textContent = entry.summary || 'No description provided.';
      els.previewStats.replaceChildren();
      for (const label of [
        entry.document.scenes.length+' scene(s)',
        entry.document.clips.length+' cue clip(s)',
        entry.document.tracks.length+' track(s)',
        entry.document.devices.length+' generic device(s)',
        'No bundled media'
      ]) els.previewStats.append(txt('span', label, 'hs-tag'));
      els.remove.hidden = !viewer || entry.author_id !== viewer.id;
      els.report.href = 'mailto:showduino38@gmail.com?subject='+encodeURIComponent('HauntSync shared show report: '+entry.id)+'&body='+encodeURIComponent('Please review this shared show.\nID: '+entry.id+'\nTitle: '+entry.title+'\nReason: ');
      els.preview.showModal();
      els.download.focus();
      status('Template verified for download. Review all effects and assignments in Studio.','success');
    } catch (error) {
      status('This shared production could not be opened: '+error.message,'error');
    }
  }
  function download() {
    if (!selected) return;
    try {
      const doc = window.HauntSyncShare.cloneDownload(selected.document);
      const blob = new Blob([JSON.stringify(doc,null,2)],{type:'application/vnd.showduino.production+json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = (selected.title || 'hauntsync-template').replace(/[^a-z0-9-_]+/gi,'_').slice(0,80)+'.shdo';
      a.href = url; document.body.append(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      status('Downloaded a separate SHDO v2 template. Review it before importing to Studio.','success');
      els.preview.close();
    } catch (error) { status(error.message || 'Download failed.','error'); }
  }
  async function publish(event) {
    event.preventDefault();
    if (busy) return;
    const file = els.file.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.shdo')) {
      return status('Select a .shdo production exported from Studio.','error');
    }
    if (file.size > window.HauntSyncShare.MAX_INPUT_BYTES) {
      return status('The show file exceeds the 512 KB limit.','error');
    }
    if (!els.consent.checked) return status('Confirm your rights and that this is public before sharing.','error');
    busy = true; els.submit.disabled = true;
    try {
      if (!viewer) throw Error('Sign in to your Showduino ID before sharing.');
      status('Validating and sanitising your show…');
      const document = window.HauntSyncShare.prepare(await file.text(),els.title.value,els.summary.value);
      const confirmation = [
        'Publish this public Showduino template?',
        '',
        'Title: '+document.project.name,
        'Clips: '+document.clips.length,
        'Generic nodes: '+document.devices.length,
        'Media files: 0 (audio must be re-linked)',
        '',
        'Hardware bindings, original project ID, asset paths and notes are removed.',
        'Scene titles, cue names and clip labels remain visible. Please check they contain nothing private.',
        'Reuse licence: '+(els.license.value === 'cc0-1.0' ? 'CC0 1.0 (public domain dedication)' : 'CC BY 4.0 (credit required)'),
        'Others can download a copy. This does not affect your private shows.'
      ].join('\n');
      if (!window.confirm(confirmation)) { status('Sharing cancelled. Nothing was uploaded.'); return; }
      status('Publishing your sanitised template…');
      await window.ShowduinoSupabase.publishSharedShow({
        document, title:document.project.name, summary:els.summary.value.trim(), category:els.category.value, license:els.license.value
      });
      els.form.reset();
      status('Your show template was published to the HauntSync community.','success');
      await refresh();
    } catch (error) {
      status('Show not published: '+(error?.message || 'Unknown error'),'error');
    } finally { busy = false; els.submit.disabled = !viewer; }
  }
  async function unshare() {
    if (!selected || !viewer || viewer.id !== selected.author_id || busy) return;
    if (!window.confirm('Unshare "'+selected.title+'"? This removes the community copy, not your original show. Previously downloaded copies remain with other creators.')) return;
    busy = true; els.remove.disabled = true;
    try {
      await window.ShowduinoSupabase.removeSharedShow(selected.id);
      selected = null;
      els.preview.close();
      status('Community copy removed. Private projects were not changed.','success');
      await refresh();
    } catch (error) {
      status('Could not unshare: '+error.message,'error');
    } finally { busy = false; els.remove.disabled = false; }
  }
  function authChanged(user) {
    viewer = user;
    els.submit.disabled = !user || busy;
    els.authNote.textContent = user
      ? 'Sharing as your Showduino ID. Your display name is shown with the public template.'
      : 'Sign in to publish. Browsing and downloading are open to everyone.';
    if (selected) els.remove.hidden = !user || selected.author_id !== user.id;
  }
  function init() {
    els.status=byId('hs-share-status'); els.list=byId('hs-shared-list');
    els.filter=byId('hs-category-filter'); els.file=byId('hs-share-file');
    els.title=byId('hs-share-title'); els.summary=byId('hs-share-summary');
    els.category=byId('hs-share-category'); els.license=byId('hs-share-license'); els.consent=byId('hs-share-consent');
    els.form=byId('hs-publish-form'); els.submit=byId('hs-share-submit');
    els.authNote=byId('hs-share-auth-note'); els.preview=byId('hs-show-preview');
    els.previewTitle=byId('hs-preview-title'); els.previewAuthor=byId('hs-preview-author');
    els.previewSummary=byId('hs-preview-summary'); els.previewStats=byId('hs-preview-stats');
    els.download=byId('hs-preview-download'); els.remove=byId('hs-preview-remove'); els.report=byId('hs-preview-report');
    els.filter.addEventListener('change',refresh);
    els.form.addEventListener('submit',publish);
    els.download.addEventListener('click',download);
    els.remove.addEventListener('click',unshare);
    byId('hs-preview-close').addEventListener('click',()=>els.preview.close());
    els.preview.addEventListener('click',event=>{if(event.target===els.preview)els.preview.close();});
    els.submit.disabled = true;
    if (window.ShowduinoSupabase?.enabled()) {
      window.ShowduinoSupabase.onAuthChanged(authChanged);
    } else {
      els.authNote.textContent = 'Showduino accounts are unavailable; browsing may be temporarily unavailable.';
    }
    refresh();
    const linkedShow = new URLSearchParams(window.location.search).get('show');
    if (linkedShow) {
      // A link only opens a reviewed template preview, never runs a production.
      openShow(linkedShow);
    }
  }
  document.addEventListener('DOMContentLoaded',init);
})();
