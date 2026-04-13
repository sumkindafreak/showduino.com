// DMXEditor — 512-channel DMX editing modal for Showduino Studio

class DMXEditor {
  constructor(timelineEditor) {
    this._tl    = timelineEditor;
    this._modal = null;
    this._clipId = null;
    this._channels = new Array(512).fill(0);  // 0-255 per channel
    this._selectedChannel = null;
    this._page = 0; // 0-3 (pages of 128 channels each)
  }

  createModal() {
    if (this._modal) return;

    const overlay = document.createElement('div');
    overlay.id = 'dmx-editor-modal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;z-index:8500;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e1e;border:1px solid #444;border-radius:8px;width:900px;max-width:98vw;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.7);';

    // Header
    const hdr = document.createElement('div');
    hdr.style.cssText = 'padding:14px 18px;border-bottom:1px solid #444;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;';
    hdr.innerHTML = `<h3 style="margin:0;color:#00ffcc;font-size:15px;">🎛 DMX Channel Editor</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#888;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => this.close());
    hdr.appendChild(closeBtn);
    box.appendChild(hdr);

    // Page tabs
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:0;border-bottom:1px solid #333;background:#252525;';
    ['CH 1–128','CH 129–256','CH 257–384','CH 385–512'].forEach((label, i) => {
      const tab = document.createElement('button');
      tab.textContent = label;
      tab.dataset.page = i;
      tab.style.cssText = 'flex:1;padding:8px;background:none;border:none;border-right:1px solid #333;color:#888;cursor:pointer;font-size:12px;';
      tab.addEventListener('click', () => {
        this._page = i;
        document.querySelectorAll('#dmx-editor-modal [data-page]').forEach(b => { b.style.color='#888'; b.style.borderBottom='none'; });
        tab.style.color = '#00ffcc';
        tab.style.borderBottom = '2px solid #00ffcc';
        this._renderGrid();
      });
      if (i === 0) { tab.style.color = '#00ffcc'; tab.style.borderBottom = '2px solid #00ffcc'; }
      tabs.appendChild(tab);
    });
    box.appendChild(tabs);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #333;';

    const allZeroBtn = document.createElement('button');
    allZeroBtn.textContent = '🔇 All Off';
    allZeroBtn.className = 'btn-toolbar';
    allZeroBtn.style.fontSize = '12px';
    allZeroBtn.addEventListener('click', () => { this._channels.fill(0); this._renderGrid(); });

    const allFullBtn = document.createElement('button');
    allFullBtn.textContent = '💡 All Full';
    allFullBtn.className = 'btn-toolbar';
    allFullBtn.style.fontSize = '12px';
    allFullBtn.addEventListener('click', () => { this._channels.fill(255); this._renderGrid(); });

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy';
    copyBtn.className = 'btn-toolbar';
    copyBtn.style.fontSize = '12px';
    copyBtn.addEventListener('click', () => { this._clipboard = [...this._channels]; this._showMsg('Channels copied'); });

    const pasteBtn = document.createElement('button');
    pasteBtn.textContent = '📌 Paste';
    pasteBtn.className = 'btn-toolbar';
    pasteBtn.style.fontSize = '12px';
    pasteBtn.addEventListener('click', () => {
      if (this._clipboard) { this._channels = [...this._clipboard]; this._renderGrid(); this._showMsg('Channels pasted'); }
    });

    const chInput = document.createElement('input');
    chInput.type = 'number';
    chInput.min = 1; chInput.max = 512;
    chInput.placeholder = 'CH#';
    chInput.style.cssText = 'width:70px;background:#111;border:1px solid #555;color:#eee;padding:4px;font-size:12px;border-radius:3px;';
    chInput.addEventListener('change', () => {
      const ch = parseInt(chInput.value) - 1;
      if (ch >= 0 && ch < 512) {
        this._page = Math.floor(ch / 128);
        this._renderGrid();
        // Scroll to channel
        setTimeout(() => {
          const el = document.querySelector(`[data-ch="${ch}"]`);
          if (el) el.scrollIntoView({ block: 'center' });
        }, 50);
      }
    });

    toolbar.appendChild(allZeroBtn);
    toolbar.appendChild(allFullBtn);
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(pasteBtn);
    toolbar.appendChild(document.createTextNode(' Jump to: '));
    toolbar.appendChild(chInput);
    box.appendChild(toolbar);

    // Channel grid
    this._gridContainer = document.createElement('div');
    this._gridContainer.id = 'dmx-ch-grid';
    this._gridContainer.style.cssText = 'flex:1;overflow-y:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:4px;';
    box.appendChild(this._gridContainer);

    // Selected channel detail
    this._detailBar = document.createElement('div');
    this._detailBar.style.cssText = 'padding:10px 18px;border-top:1px solid #333;background:#252525;display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
    this._detailBar.innerHTML = '<span id="dmx-detail-label" style="font-size:13px;color:#888;">Select a channel</span>';
    box.appendChild(this._detailBar);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 18px;border-top:1px solid #444;display:flex;gap:8px;justify-content:flex-end;';

    const sendLiveBtn = document.createElement('button');
    sendLiveBtn.textContent = '⚡ Send Live';
    sendLiveBtn.className = 'btn-primary';
    sendLiveBtn.style.fontSize = '12px';
    sendLiveBtn.addEventListener('click', () => this._sendLive());

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save to Clip';
    saveBtn.className = 'btn-primary';
    saveBtn.addEventListener('click', () => { this._saveToClip(); this.close(); });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.addEventListener('click', () => this.close());

    footer.appendChild(sendLiveBtn);
    footer.appendChild(saveBtn);
    footer.appendChild(cancelBtn);
    box.appendChild(footer);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    this._modal = overlay;
  }

  open(clipId) {
    if (!this._modal) this.createModal();
    this._clipId = clipId;
    this._page = 0;

    // Load existing channel data from clip
    if (this._tl && clipId) {
      const clips = this._tl._clips ? this._tl._clips() : [];
      const clip = clips.find(c => c.id === clipId);
      if (clip && clip.params && clip.params.channels) {
        this._channels = new Array(512).fill(0);
        Object.entries(clip.params.channels).forEach(([ch, val]) => {
          const idx = parseInt(ch);
          if (idx >= 0 && idx < 512) this._channels[idx] = Math.min(255, Math.max(0, parseInt(val) || 0));
        });
      } else {
        this._channels = new Array(512).fill(0);
      }
    }

    this._modal.style.display = 'flex';
    this._renderGrid();
  }

  close() {
    if (this._modal) this._modal.style.display = 'none';
  }

  _renderGrid() {
    if (!this._gridContainer) return;
    this._gridContainer.innerHTML = '';
    const start = this._page * 128;
    const end   = Math.min(start + 128, 512);

    for (let i = start; i < end; i++) {
      const val = this._channels[i];
      const cell = document.createElement('div');
      cell.dataset.ch = i;
      cell.style.cssText = `background:#2a2a2a;border:1px solid ${val > 0 ? '#00ffcc' : '#444'};border-radius:3px;padding:4px;cursor:pointer;text-align:center;`;

      const chNum = document.createElement('div');
      chNum.textContent = i + 1;
      chNum.style.cssText = 'font-size:9px;color:#666;margin-bottom:2px;';

      const valDisplay = document.createElement('div');
      valDisplay.textContent = val;
      valDisplay.style.cssText = `font-size:12px;font-weight:bold;color:${val > 0 ? '#fff' : '#555'};`;

      const bar = document.createElement('div');
      bar.style.cssText = `margin-top:3px;height:4px;background:linear-gradient(to right, #00ffcc ${Math.round(val/255*100)}%, #333 0%);border-radius:2px;`;

      cell.appendChild(chNum);
      cell.appendChild(valDisplay);
      cell.appendChild(bar);

      cell.addEventListener('click', () => this._selectChannel(i));
      cell.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 5 : -5;
        this._channels[i] = Math.min(255, Math.max(0, this._channels[i] + delta));
        this._renderGrid();
        this._updateDetail(i);
      });

      this._gridContainer.appendChild(cell);
    }
  }

  _selectChannel(idx) {
    this._selectedChannel = idx;
    this._updateDetail(idx);
  }

  _updateDetail(idx) {
    const val = this._channels[idx];
    this._detailBar.innerHTML = `
      <span style="font-size:13px;color:#00ffcc;min-width:80px;">CH ${idx + 1}</span>
      <input type="range" min="0" max="255" value="${val}" id="dmx-detail-range" style="flex:1;min-width:100px;max-width:300px;"/>
      <input type="number" min="0" max="255" value="${val}" id="dmx-detail-num" style="width:60px;background:#111;border:1px solid #555;color:#eee;padding:4px;font-size:13px;border-radius:3px;text-align:center;"/>
      <div style="width:24px;height:24px;border-radius:50%;background:hsl(${Math.round(idx/512*360)},60%,${Math.round(val/255*50+10)}%);border:1px solid #555;"></div>
      <button id="dmx-detail-zero" class="btn-secondary" style="font-size:11px;padding:3px 8px;">Zero</button>
      <button id="dmx-detail-full" class="btn-secondary" style="font-size:11px;padding:3px 8px;">Full</button>
    `;

    const range = document.getElementById('dmx-detail-range');
    const num   = document.getElementById('dmx-detail-num');
    const update = v => {
      this._channels[idx] = Math.min(255, Math.max(0, parseInt(v) || 0));
      if (range) range.value = this._channels[idx];
      if (num)   num.value   = this._channels[idx];
      // Update cell in grid
      const cell = document.querySelector(`[data-ch="${idx}"]`);
      if (cell) {
        cell.querySelector('div:nth-child(2)').textContent = this._channels[idx];
        cell.querySelector('div:nth-child(3)').style.background = `linear-gradient(to right, #00ffcc ${Math.round(this._channels[idx]/255*100)}%, #333 0%)`;
        cell.style.borderColor = this._channels[idx] > 0 ? '#00ffcc' : '#444';
      }
    };

    if (range) range.addEventListener('input', () => update(range.value));
    if (num)   num.addEventListener('change', () => update(num.value));

    const zeroBtn = document.getElementById('dmx-detail-zero');
    const fullBtn = document.getElementById('dmx-detail-full');
    if (zeroBtn) zeroBtn.addEventListener('click', () => update(0));
    if (fullBtn) fullBtn.addEventListener('click', () => update(255));
  }

  _saveToClip() {
    if (!this._tl || !this._clipId) return;
    const channelsObj = {};
    this._channels.forEach((v, i) => { if (v > 0) channelsObj[i] = v; });
    this._tl.setClipParams(this._clipId, { channels: channelsObj });
  }

  async _sendLive() {
    try {
      if (window.api) {
        const channelsObj = {};
        this._channels.forEach((v, i) => { channelsObj[i + 1] = v; });
        await window.api.setDMXChannels(channelsObj);
        this._showMsg('Sent to device ✓');
      }
    } catch (err) {
      this._showMsg('Send failed: ' + err.message);
    }
  }

  _showMsg(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#00ffcc;color:#000;padding:8px 16px;border-radius:4px;font-size:13px;z-index:9999;font-weight:bold;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }
}

window.DMXEditor = DMXEditor;
