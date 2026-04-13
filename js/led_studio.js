// LEDStudio — Visual LED pattern editor for Showduino Studio
// Supports color picking, effect selection, brightness, and live preview

class LEDStudio {
  constructor(timelineEditor) {
    this._tl    = timelineEditor;
    this._modal = null;
    this._clipId = null;
    this._params = { r: 255, g: 255, b: 255, brightness: 255, effect: 'solid', line: 1, duration: 5000 };
    this._animFrame = null;
    this._previewStep = 0;
  }

  createModal() {
    if (this._modal) return;

    const overlay = document.createElement('div');
    overlay.id = 'led-studio-modal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;z-index:8500;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e1e;border:1px solid #444;border-radius:8px;width:680px;max-width:98vw;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.7);overflow:hidden;';

    // Header
    const hdr = document.createElement('div');
    hdr.style.cssText = 'padding:14px 18px;border-bottom:1px solid #444;display:flex;align-items:center;justify-content:space-between;';
    hdr.innerHTML = `<h3 style="margin:0;color:#00ffcc;font-size:15px;">💡 LED Studio</h3>`;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#888;font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => this.close());
    hdr.appendChild(closeBtn);
    box.appendChild(hdr);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px;';

    // Left: Color & Effect controls
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    leftPanel.appendChild(this._section('Color Picker', `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
        <input type="color" id="led-color-hex" value="#ffffff" style="width:60px;height:40px;background:#111;border:1px solid #555;cursor:pointer;border-radius:4px;"/>
        <div style="flex:1;">
          <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;width:12px;">R</span>
            <input type="range" id="led-r" min="0" max="255" value="255" style="flex:1;accent-color:#ff4444;"/>
            <input type="number" id="led-r-num" min="0" max="255" value="255" style="width:46px;background:#111;border:1px solid #555;color:#eee;padding:2px;font-size:11px;border-radius:3px;text-align:center;"/>
          </div>
          <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;width:12px;">G</span>
            <input type="range" id="led-g" min="0" max="255" value="255" style="flex:1;accent-color:#44ff44;"/>
            <input type="number" id="led-g-num" min="0" max="255" value="255" style="width:46px;background:#111;border:1px solid #555;color:#eee;padding:2px;font-size:11px;border-radius:3px;text-align:center;"/>
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            <span style="font-size:11px;color:#888;width:12px;">B</span>
            <input type="range" id="led-b" min="0" max="255" value="255" style="flex:1;accent-color:#4488ff;"/>
            <input type="number" id="led-b-num" min="0" max="255" value="255" style="width:46px;background:#111;border:1px solid #555;color:#eee;padding:2px;font-size:11px;border-radius:3px;text-align:center;"/>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;" id="led-swatches"></div>
    `));

    leftPanel.appendChild(this._section('Brightness', `
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="range" id="led-brightness" min="0" max="255" value="255" style="flex:1;"/>
        <input type="number" id="led-brightness-num" min="0" max="255" value="255" style="width:50px;background:#111;border:1px solid #555;color:#eee;padding:4px;font-size:12px;border-radius:3px;text-align:center;"/>
        <span style="font-size:11px;color:#888;" id="led-brightness-pct">100%</span>
      </div>
    `));

    leftPanel.appendChild(this._section('Effect', `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;" id="led-effects-grid"></div>
      <div style="margin-top:8px;" id="led-effect-params"></div>
    `));

    leftPanel.appendChild(this._section('LED Line', `
      <div style="display:flex;gap:8px;">
        <button id="led-line-1" class="btn-primary" style="flex:1;font-size:12px;">Line 1</button>
        <button id="led-line-2" class="btn-secondary" style="flex:1;font-size:12px;">Line 2</button>
        <button id="led-line-both" class="btn-secondary" style="flex:1;font-size:12px;">Both</button>
      </div>
    `));

    body.appendChild(leftPanel);

    // Right: Preview
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    rightPanel.appendChild(this._section('LED Strip Preview', `
      <canvas id="led-preview-canvas" width="300" height="60" style="width:100%;border-radius:4px;background:#111;display:block;"></canvas>
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:center;">
        <button id="led-preview-play" class="btn-toolbar" style="font-size:12px;">▶ Preview</button>
        <button id="led-preview-stop" class="btn-toolbar" style="font-size:12px;">⏹ Stop</button>
      </div>
    `));

    rightPanel.appendChild(this._section('Color Palette', `
      <div id="led-palette-grid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:3px;"></div>
    `));

    rightPanel.appendChild(this._section('Live Send', `
      <button id="led-send-live" class="btn-primary" style="width:100%;font-size:12px;">⚡ Send to Device Now</button>
      <p style="font-size:10px;color:#666;margin:4px 0 0;">Sends current settings to connected Showduino device immediately.</p>
    `));

    body.appendChild(rightPanel);
    box.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 18px;border-top:1px solid #444;display:flex;gap:8px;justify-content:flex-end;';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save to Clip';
    saveBtn.className = 'btn-primary';
    saveBtn.addEventListener('click', () => { this._saveToClip(); this.close(); });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.addEventListener('click', () => this.close());
    footer.appendChild(saveBtn);
    footer.appendChild(cancelBtn);
    box.appendChild(footer);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    this._modal = overlay;
  }

  _section(title, innerHtml) {
    const sec = document.createElement('div');
    sec.style.cssText = 'background:#2a2a2a;border:1px solid #333;border-radius:6px;padding:12px;';
    sec.innerHTML = `<div style="font-size:12px;color:#888;font-weight:bold;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">${title}</div>${innerHtml}`;
    return sec;
  }

  open(clipId) {
    if (!this._modal) this.createModal();
    this._clipId = clipId;

    // Load params from clip
    if (this._tl && clipId) {
      const clips = this._tl._clips ? this._tl._clips() : [];
      const clip = clips.find(c => c.id === clipId);
      if (clip && clip.params) {
        this._params = { ...this._params, ...clip.params };
      }
    }

    this._modal.style.display = 'flex';
    this._bindControls();
    this._buildEffectsGrid();
    this._buildSwatches();
    this._buildPalette();
    this._syncUI();
    this._renderPreview();
  }

  close() {
    if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
    if (this._modal) this._modal.style.display = 'none';
  }

  _bindControls() {
    const syncRGB = () => {
      const r = parseInt(document.getElementById('led-r')?.value) || 0;
      const g = parseInt(document.getElementById('led-g')?.value) || 0;
      const b = parseInt(document.getElementById('led-b')?.value) || 0;
      this._params.r = r; this._params.g = g; this._params.b = b;
      const hex = '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
      const hexEl = document.getElementById('led-color-hex');
      if (hexEl) hexEl.value = hex;
      const numR = document.getElementById('led-r-num'); if (numR) numR.value = r;
      const numG = document.getElementById('led-g-num'); if (numG) numG.value = g;
      const numB = document.getElementById('led-b-num'); if (numB) numB.value = b;
      this._renderPreview();
    };

    ['led-r','led-g','led-b'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', syncRGB);
    });

    ['led-r-num','led-g-num','led-b-num'].forEach((id, i) => {
      const el = document.getElementById(id);
      const sliderId = ['led-r','led-g','led-b'][i];
      if (el) el.addEventListener('change', () => {
        const sl = document.getElementById(sliderId);
        if (sl) { sl.value = el.value; syncRGB(); }
      });
    });

    const hexEl = document.getElementById('led-color-hex');
    if (hexEl) hexEl.addEventListener('input', () => {
      const hex = hexEl.value.replace('#','');
      if (hex.length === 6) {
        this._params.r = parseInt(hex.slice(0,2),16);
        this._params.g = parseInt(hex.slice(2,4),16);
        this._params.b = parseInt(hex.slice(4,6),16);
        this._syncUI();
        this._renderPreview();
      }
    });

    const brightEl = document.getElementById('led-brightness');
    const brightNum = document.getElementById('led-brightness-num');
    const brightPct = document.getElementById('led-brightness-pct');
    const syncBright = () => {
      const v = parseInt(brightEl?.value) || 0;
      this._params.brightness = v;
      if (brightNum) brightNum.value = v;
      if (brightPct) brightPct.textContent = Math.round(v / 255 * 100) + '%';
      this._renderPreview();
    };
    if (brightEl) brightEl.addEventListener('input', syncBright);
    if (brightNum) brightNum.addEventListener('change', () => { if (brightEl) brightEl.value = brightNum.value; syncBright(); });

    // Line buttons
    const lineMap = { 'led-line-1': 1, 'led-line-2': 2, 'led-line-both': 0 };
    Object.entries(lineMap).forEach(([id, line]) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => {
        this._params.line = line;
        document.querySelectorAll('#led-studio-modal #led-line-1, #led-studio-modal #led-line-2, #led-studio-modal #led-line-both')
          .forEach(b => { b.className = 'btn-secondary'; b.style.fontSize = '12px'; });
        btn.className = 'btn-primary';
      });
    });

    // Preview play/stop
    const playPreviewBtn = document.getElementById('led-preview-play');
    const stopPreviewBtn = document.getElementById('led-preview-stop');
    if (playPreviewBtn) playPreviewBtn.addEventListener('click', () => this._startPreviewAnimation());
    if (stopPreviewBtn) stopPreviewBtn.addEventListener('click', () => {
      if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
      this._renderPreview();
    });

    // Live send
    const sendBtn = document.getElementById('led-send-live');
    if (sendBtn) sendBtn.addEventListener('click', () => this._sendLive());
  }

  _buildEffectsGrid() {
    const grid = document.getElementById('led-effects-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const effects = [
      { id: 'solid',   label: '⬛ Solid',   desc: 'Constant color' },
      { id: 'fade',    label: '🌫 Fade',    desc: 'Fade in/out' },
      { id: 'pulse',   label: '💓 Pulse',   desc: 'Pulse rhythmically' },
      { id: 'flash',   label: '⚡ Flash',   desc: 'Strobe flash' },
      { id: 'rainbow', label: '🌈 Rainbow', desc: 'Cycle hues' },
      { id: 'chase',   label: '🏃 Chase',   desc: 'Running lights' }
    ];
    effects.forEach(ef => {
      const btn = document.createElement('button');
      btn.dataset.effect = ef.id;
      btn.title = ef.desc;
      btn.textContent = ef.label;
      btn.style.cssText = `padding:5px;font-size:10px;border-radius:4px;cursor:pointer;border:1px solid ${this._params.effect === ef.id ? '#00ffcc' : '#444'};background:${this._params.effect === ef.id ? '#004433' : '#333'};color:#eee;`;
      btn.addEventListener('click', () => {
        this._params.effect = ef.id;
        this._buildEffectsGrid();
        this._renderPreview();
        this._startPreviewAnimation();
      });
      grid.appendChild(btn);
    });
  }

  _buildSwatches() {
    const cont = document.getElementById('led-swatches');
    if (!cont) return;
    const presets = ['#ff0000','#ff8800','#ffff00','#00ff00','#00ffcc','#0088ff','#8800ff','#ff00ff','#ffffff','#888888','#ff6688','#00ffaa'];
    cont.innerHTML = '';
    presets.forEach(hex => {
      const sw = document.createElement('div');
      sw.style.cssText = `width:22px;height:22px;border-radius:3px;background:${hex};cursor:pointer;border:1px solid #555;`;
      sw.title = hex;
      sw.addEventListener('click', () => {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        this._params.r = r; this._params.g = g; this._params.b = b;
        this._syncUI();
        this._renderPreview();
      });
      cont.appendChild(sw);
    });
  }

  _buildPalette() {
    const grid = document.getElementById('led-palette-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let h = 0; h < 360; h += 45) {
      for (let l = 30; l <= 80; l += 25) {
        const div = document.createElement('div');
        div.style.cssText = `height:18px;border-radius:2px;background:hsl(${h},80%,${l}%);cursor:pointer;`;
        div.addEventListener('click', () => {
          // Convert HSL to RGB approx
          const [r,g,b] = this._hslToRgb(h/360, 0.8, l/100);
          this._params.r = r; this._params.g = g; this._params.b = b;
          this._syncUI();
          this._renderPreview();
        });
        grid.appendChild(div);
      }
    }
  }

  _syncUI() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('led-r', this._params.r); set('led-r-num', this._params.r);
    set('led-g', this._params.g); set('led-g-num', this._params.g);
    set('led-b', this._params.b); set('led-b-num', this._params.b);
    set('led-brightness', this._params.brightness); set('led-brightness-num', this._params.brightness);
    const pct = document.getElementById('led-brightness-pct');
    if (pct) pct.textContent = Math.round(this._params.brightness / 255 * 100) + '%';
    const hex = '#' + [this._params.r, this._params.g, this._params.b].map(v => v.toString(16).padStart(2,'0')).join('');
    set('led-color-hex', hex);
  }

  _renderPreview() {
    const canvas = document.getElementById('led-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const numLEDs = 30;
    const ledW = w / numLEDs;
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < numLEDs; i++) {
      const { r, g, b } = this._getLEDColor(i, numLEDs, this._previewStep);
      const bright = this._params.brightness / 255;
      ctx.fillStyle = `rgb(${Math.round(r*bright)},${Math.round(g*bright)},${Math.round(b*bright)})`;
      ctx.fillRect(i * ledW + 1, 4, ledW - 2, h - 8);
      // Glow
      const grad = ctx.createRadialGradient(i * ledW + ledW/2, h/2, 0, i * ledW + ledW/2, h/2, ledW);
      grad.addColorStop(0, `rgba(${Math.round(r*bright)},${Math.round(g*bright)},${Math.round(b*bright)},0.4)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(i * ledW - ledW, 0, ledW * 3, h);
    }
  }

  _getLEDColor(i, total, step) {
    const { r, g, b, effect } = this._params;
    switch (effect) {
      case 'solid':
        return { r, g, b };
      case 'rainbow': {
        const hue = ((i / total + step / 100) % 1) * 360;
        return this._hslToRgbObj(hue / 360, 1, 0.5);
      }
      case 'chase': {
        const active = (i === step % total);
        return active ? { r, g, b } : { r: r * 0.1, g: g * 0.1, b: b * 0.1 };
      }
      case 'fade': {
        const alpha = (Math.sin(step / 20 * Math.PI) + 1) / 2;
        return { r: r * alpha, g: g * alpha, b: b * alpha };
      }
      case 'pulse': {
        const pulse = (Math.sin(step / 10 * Math.PI) + 1) / 2;
        return { r: r * pulse, g: g * pulse, b: b * pulse };
      }
      case 'flash': {
        const on = Math.floor(step / 5) % 2 === 0;
        return on ? { r, g, b } : { r: 0, g: 0, b: 0 };
      }
      default: return { r, g, b };
    }
  }

  _startPreviewAnimation() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    const animate = () => {
      this._previewStep++;
      this._renderPreview();
      this._animFrame = requestAnimationFrame(animate);
    };
    this._animFrame = requestAnimationFrame(animate);
  }

  _saveToClip() {
    if (!this._tl || !this._clipId) return;
    this._tl.setClipParams(this._clipId, { ...this._params });
    const clips = this._tl._clips ? this._tl._clips() : [];
    const clip = clips.find(c => c.id === this._clipId);
    if (clip) {
      clip.color = '#' + [this._params.r, this._params.g, this._params.b].map(v => v.toString(16).padStart(2,'0')).join('');
      if (this._tl._refreshClipEl) this._tl._refreshClipEl(this._clipId);
    }
  }

  async _sendLive() {
    try {
      if (window.api) {
        const line = this._params.line || 1;
        if (line === 0) {
          await window.api.setLEDLine(1, this._params.r, this._params.g, this._params.b, this._params.brightness);
          await window.api.setLEDLine(2, this._params.r, this._params.g, this._params.b, this._params.brightness);
        } else {
          await window.api.setLEDLine(line, this._params.r, this._params.g, this._params.b, this._params.brightness);
        }
        this._showMsg('Sent to device ✓');
      }
    } catch (err) {
      this._showMsg('Send failed: ' + err.message);
    }
  }

  _hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  _hslToRgbObj(h, s, l) {
    const [r, g, b] = this._hslToRgb(h, s, l);
    return { r, g, b };
  }

  _showMsg(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#00ffcc;color:#000;padding:8px 16px;border-radius:4px;font-size:13px;z-index:9999;font-weight:bold;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }
}

window.LEDStudio = LEDStudio;
