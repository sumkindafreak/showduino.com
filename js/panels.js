// PanelManager — Generates HTML for each sidebar panel in Showduino Studio

class PanelManager {
  constructor(api, state, log) {
    this._api   = api;
    this._state = state;
    this._log   = log || console.log;
  }

  /* ── Introduction ─────────────────────────────────────────────── */
  introduction() {
    const tier = this._state.user?.subscription || 'free';
    const tierBadge = { free: '#888', pro: '#00aaff', enterprise: '#ffcc00' }[tier] || '#888';
    return `
<div class="panel-introduction" style="max-width:800px;margin:0 auto;">
  <div style="text-align:center;padding:2rem 1rem;">
    <img src="showduino._logo.png" alt="Showduino" style="max-width:160px;margin-bottom:1rem;"/>
    <h1 style="color:var(--accent-color);margin:0 0 0.5rem;">Showduino Studio</h1>
    <p style="color:#888;font-size:14px;margin:0 0 1rem;">Professional Show Control Software</p>
    <span style="background:${tierBadge};color:#000;padding:3px 12px;border-radius:12px;font-size:12px;font-weight:bold;text-transform:uppercase;">${tier} Tier</span>
  </div>

  <div class="control-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin-bottom:2rem;">
    <div class="control-section" style="cursor:pointer;" onclick="document.querySelector('[data-panel=\"timeline-editor\"]').click()">
      <h3>🎬 Timeline Editor</h3>
      <p style="font-size:12px;color:#888;">Full DAW-style show sequencer with clips, tracks, and effects.</p>
    </div>
    <div class="control-section" style="cursor:pointer;" onclick="document.querySelector('[data-panel=\"live-control\"]')?.click()">
      <h3>🎛 Live Control</h3>
      <p style="font-size:12px;color:#888;">Control LEDs, relays, and audio in real-time.</p>
    </div>
    <div class="control-section" style="cursor:pointer;" onclick="document.querySelector('[data-panel=\"connect\"]')?.click()">
      <h3>📡 Connect</h3>
      <p style="font-size:12px;color:#888;">Connect to your Showduino device via AP or LAN.</p>
    </div>
    <div class="control-section" style="cursor:pointer;" onclick="document.querySelector('[data-panel=\"hauntsync\"]')?.click()">
      <h3>☁ HauntSync</h3>
      <p style="font-size:12px;color:#888;">Cloud sync, backup, and multi-device show management.</p>
    </div>
  </div>

  <div class="control-section">
    <h3>🚀 Quick Start</h3>
    <ol style="color:#ccc;font-size:13px;line-height:2;padding-left:1.4rem;margin:0;">
      <li>Click <strong style="color:var(--accent-color);">Timeline Editor</strong> in the left menu to create your show.</li>
      <li>Use <strong style="color:var(--accent-color);">Add Track</strong> buttons to add audio, lighting, relay, and more.</li>
      <li>Double-click a track lane to add a clip, or drag from the toolbar.</li>
      <li>Click a clip to edit its properties in the Inspector panel.</li>
      <li>Press <kbd style="background:#333;padding:1px 6px;border-radius:3px;font-size:11px;">Space</kbd> to play/pause. <kbd style="background:#333;padding:1px 6px;border-radius:3px;font-size:11px;">Ctrl+S</kbd> to save.</li>
      <li>Connect to your Showduino device and press Play to run the show!</li>
    </ol>
  </div>

  <div class="control-section" style="margin-top:1rem;">
    <h3>⌨ Keyboard Shortcuts</h3>
    <div class="control-grid" style="grid-template-columns:1fr 1fr;gap:0.5rem;">
      ${[
        ['Space','Play / Pause'],['Delete','Delete selected clip'],
        ['Ctrl+Z','Undo'],['Ctrl+Y','Redo'],
        ['Ctrl+S','Save project'],['Ctrl++','Zoom in'],
        ['Ctrl+-','Zoom out'],['Double-click lane','Add clip'],
      ].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #333;font-size:12px;">
        <span style="color:#888;">${v}</span>
        <kbd style="background:#333;padding:1px 8px;border-radius:3px;font-size:11px;color:#00ffcc;">${k}</kbd>
      </div>`).join('')}
    </div>
  </div>

  <div style="text-align:center;margin-top:1.5rem;">
    <button class="btn-primary" onclick="document.querySelector('[data-panel=\\'timeline-editor\\']').click()" style="font-size:14px;padding:10px 24px;">
      Open Timeline Editor →
    </button>
  </div>

  <div style="text-align:center;margin-top:2rem;padding-top:1rem;border-top:1px solid #333;font-size:11px;color:#555;">
    Showduino Studio v1.0 · &copy; ${new Date().getFullYear()} Showduino · <a href="https://showduino.com" target="_blank" style="color:#555;">showduino.com</a>
  </div>
</div>`;
  }

  /* ── Connect ──────────────────────────────────────────────────── */
  async connect() {
    let status = null;
    let mode = 'offline';
    try {
      if (window.connectionDetector) {
        mode = window.connectionDetector.mode;
      }
      status = await this._api.getStatus();
    } catch (_) {}

    const modeColor = { ap: '#00ff88', lan: '#00aaff', offline: '#ff4444' }[mode] || '#888';
    const modeLabel = { ap: 'AP Mode (Direct)', lan: 'LAN Mode', offline: 'Offline' }[mode] || mode;

    return `
<div class="panel-connect">
  <div class="control-section">
    <h3>📡 Connection Status</h3>
    <div class="control-grid">
      <div>
        <label style="font-size:12px;color:#888;">Mode</label>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${modeColor};"></div>
          <span style="font-weight:bold;color:${modeColor};">${modeLabel}</span>
        </div>
      </div>
      <div>
        <label style="font-size:12px;color:#888;">Device IP</label>
        <div style="margin-top:4px;font-family:monospace;color:#eee;">${status?.ip || 'N/A'}</div>
      </div>
      <div>
        <label style="font-size:12px;color:#888;">Firmware</label>
        <div style="margin-top:4px;font-family:monospace;color:#eee;">${status?.firmware || 'N/A'}</div>
      </div>
      <div>
        <label style="font-size:12px;color:#888;">SD Card</label>
        <div style="margin-top:4px;">${status?.sd_card ? '✅ Inserted' : '❌ Not Found'}</div>
      </div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button class="btn-primary" onclick="window.connectionDetector?.detectMode().then(m=>alert('Mode: '+m))">🔍 Detect Mode</button>
      <button class="btn-secondary" onclick="location.reload()">🔄 Refresh</button>
    </div>
  </div>

  <div class="control-section">
    <h3>📶 WiFi Networks</h3>
    <div id="wifi-list" style="min-height:60px;background:#111;border:1px solid #333;border-radius:4px;padding:8px;margin-bottom:8px;font-size:12px;color:#666;">
      Press "Scan" to discover networks…
    </div>
    <button class="btn-toolbar" onclick="window._scanWifi()">📡 Scan Networks</button>
  </div>

  <div class="control-section">
    <h3>🔑 Manual Connect</h3>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div>
        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">SSID</label>
        <input id="wifi-ssid" type="text" placeholder="Network name" style="width:100%;background:#111;border:1px solid #555;color:#eee;padding:8px;box-sizing:border-box;border-radius:4px;font-size:13px;"/>
      </div>
      <div>
        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Password</label>
        <input id="wifi-password" type="password" placeholder="Password" style="width:100%;background:#111;border:1px solid #555;color:#eee;padding:8px;box-sizing:border-box;border-radius:4px;font-size:13px;"/>
      </div>
      <button class="btn-primary" onclick="window._connectWifi()" style="align-self:flex-start;">Connect</button>
    </div>
  </div>
</div>

<script>
window._scanWifi = async () => {
  const el = document.getElementById('wifi-list');
  if (el) el.textContent = 'Scanning…';
  try {
    const result = await window.api?.getStatus();
    if (el) el.innerHTML = result ? '<span style="color:#00ffcc;">Scan not supported via /status. Use Showduino AP to configure WiFi.</span>' : '<span style="color:#ff4444;">Device not reachable.</span>';
  } catch (e) { if (el) el.innerHTML = '<span style="color:#ff4444;">Failed: ' + e.message + '</span>'; }
};
window._connectWifi = async () => {
  const ssid = document.getElementById('wifi-ssid')?.value;
  const pass = document.getElementById('wifi-password')?.value;
  if (!ssid) { alert('Enter SSID'); return; }
  try {
    await window.api?.connectWiFi(ssid, pass);
    alert('Connect request sent. Device will reboot.');
  } catch (e) { alert('Failed: ' + e.message); }
};
<\/script>`;
  }

  /* ── Live Control ─────────────────────────────────────────────── */
  liveControl() {
    return `
<div class="panel-live-control">
  <div class="control-section">
    <h3>💡 LED Lines</h3>
    <div class="control-grid">
      ${[1, 2].map(line => `
      <div style="background:#222;border:1px solid #333;border-radius:6px;padding:12px;">
        <h4 style="margin:0 0 8px;font-size:13px;color:#00ffcc;">LED Line ${line}</h4>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <label style="font-size:12px;color:#888;">Color</label>
          <input type="color" id="led${line}-color" value="#00ffcc" style="width:50px;height:30px;background:#111;border:1px solid #555;cursor:pointer;border-radius:3px;"/>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <label style="font-size:12px;color:#888;white-space:nowrap;">Brightness</label>
          <input type="range" id="led${line}-brightness" min="0" max="255" value="255" style="flex:1;"/>
          <span id="led${line}-bright-val" style="font-size:11px;color:#888;min-width:28px;">255</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-primary" style="flex:1;font-size:12px;" onclick="window._setLEDLine(${line})">Set</button>
          <button class="btn-secondary" style="flex:1;font-size:12px;" onclick="window._clearLEDLine(${line})">Clear</button>
        </div>
      </div>`).join('')}
    </div>
  </div>

  <div class="control-section">
    <h3>⚡ Relay Controls</h3>
    <div class="control-grid">
      ${['out1', 'out2'].map((out, i) => `
      <div style="background:#222;border:1px solid #333;border-radius:6px;padding:12px;text-align:center;">
        <h4 style="margin:0 0 8px;font-size:13px;color:#ff8800;">OUT${i + 1}</h4>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button class="btn-primary" style="flex:1;font-size:13px;" onclick="window._setRelay('${out}', true)">ON</button>
          <button class="btn-secondary" style="flex:1;font-size:13px;" onclick="window._setRelay('${out}', false)">OFF</button>
        </div>
      </div>`).join('')}
    </div>
  </div>

  <div class="control-section">
    <h3>🌟 Status LED</h3>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <div>
        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Color</label>
        <input type="color" id="status-led-color" value="#00ffcc" style="width:60px;height:36px;background:#111;border:1px solid #555;cursor:pointer;border-radius:3px;"/>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;">
        <button class="btn-primary" style="font-size:12px;" onclick="window.setStatusLED()">Set</button>
        <button class="btn-toolbar" style="font-size:12px;" onclick="window.blinkStatusLED()">Blink</button>
        <button class="btn-secondary" style="font-size:12px;" onclick="window.statusLEDOff()">Off</button>
      </div>
    </div>
  </div>

  <div class="control-section">
    <h3>🎵 Audio Controls</h3>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div>
        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">File</label>
        <select id="audio-file-select" style="width:100%;background:#111;border:1px solid #555;color:#eee;padding:6px;border-radius:4px;font-size:13px;">
          <option value="">-- No file selected --</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn-primary" style="font-size:12px;" onclick="window.playAudio()">▶ Play</button>
        <button class="btn-toolbar" style="font-size:12px;" onclick="window.pauseAudio()">⏸ Pause</button>
        <button class="btn-toolbar" style="font-size:12px;" onclick="window.stopAudio()">⏹ Stop</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label style="font-size:12px;color:#888;white-space:nowrap;">Volume</label>
        <input type="range" id="audio-volume" min="0" max="100" value="80" style="flex:1;" oninput="window.api?.setAudioVolume(parseInt(this.value))"/>
        <span id="audio-vol-val" style="font-size:11px;color:#888;min-width:30px;">80%</span>
      </div>
    </div>
  </div>
</div>

<script>
// Wire brightness labels
[1,2].forEach(line => {
  const el = document.getElementById('led'+line+'-brightness');
  const vl = document.getElementById('led'+line+'-bright-val');
  if (el && vl) { el.addEventListener('input', () => { vl.textContent = el.value; }); }
});
const volEl = document.getElementById('audio-volume');
const volVal = document.getElementById('audio-vol-val');
if (volEl && volVal) volEl.addEventListener('input', () => { volVal.textContent = volEl.value + '%'; });

// Populate audio files
(async () => {
  try {
    const res = await window.api?.listAudioFiles();
    const files = res?.files || [];
    const sel = document.getElementById('audio-file-select');
    if (sel && files.length) {
      files.forEach(f => {
        const opt = document.createElement('option');
        opt.value = typeof f === 'string' ? f : f.name;
        opt.textContent = opt.value;
        sel.appendChild(opt);
      });
    }
  } catch(_) {}
})();

window._setLEDLine = async (line) => {
  const col = document.getElementById('led'+line+'-color')?.value || '#ffffff';
  const bright = parseInt(document.getElementById('led'+line+'-brightness')?.value) || 255;
  const r = parseInt(col.slice(1,3),16), g = parseInt(col.slice(3,5),16), b = parseInt(col.slice(5,7),16);
  try { await window.api?.setLEDLine(line, r, g, b, bright); } catch(e) { console.warn(e); }
};
window._clearLEDLine = async (line) => {
  try { await window.api?.clearLEDLine(line); } catch(e) { console.warn(e); }
};
window._setRelay = async (out, state) => {
  try { await window.api?.setRelay(out, state); } catch(e) { console.warn(e); }
};
<\/script>`;
  }

  /* ── Timeline Editor ──────────────────────────────────────────── */
  timelineEditor() {
    return `
<div class="timeline-editor" style="height:calc(100vh - 180px);min-height:500px;display:flex;flex-direction:column;">
  <!-- TimelineEditor renders into this div via init() -->
</div>`;
  }

  /* ── Playback ─────────────────────────────────────────────────── */
  playback() {
    const sub = this._state.user?.subscription || 'free';
    const bpm  = this._state.project?.project?.bpm || 120;
    const name = this._state.project?.project?.name || 'Untitled Show';
    return `
<div class="panel-playback">
  <div class="control-section" style="text-align:center;">
    <h3>🎬 Transport</h3>
    <div style="font-size:32px;font-weight:bold;color:var(--accent-color);font-family:monospace;margin-bottom:16px;" id="pb-timecode">00:00.000</div>
    <div style="font-size:13px;color:#888;margin-bottom:16px;">
      Show: <strong style="color:#eee;">${name}</strong>
    </div>
    <div style="display:flex;justify-content:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn-primary" style="font-size:20px;width:56px;height:56px;border-radius:50%;" onclick="window.timelineEditor?.play()||window.appPlay?.()" title="Play">▶</button>
      <button class="btn-toolbar" style="font-size:20px;width:56px;height:56px;border-radius:50%;" onclick="window.timelineEditor?.pause()||window.appPause?.()" title="Pause">⏸</button>
      <button class="btn-toolbar" style="font-size:20px;width:56px;height:56px;border-radius:50%;" onclick="window.timelineEditor?.stop()||window.appStop?.()" title="Stop">⏹</button>
      <button class="btn-secondary" style="font-size:20px;width:56px;height:56px;border-radius:50%;" onclick="window.timelineEditor?.rewind()" title="Rewind">⏮</button>
    </div>
    <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
      <button id="pb-loop-btn" class="btn-toolbar" style="font-size:13px;" onclick="window.timelineEditor?._toggleLoop()">🔁 Loop: OFF</button>
    </div>
  </div>

  <div class="control-section">
    <h3>📊 Show Info</h3>
    <div class="control-grid">
      <div>
        <label style="font-size:12px;color:#888;">BPM</label>
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
          <input type="number" id="pb-bpm" value="${bpm}" min="20" max="300" style="width:70px;background:#111;border:1px solid #555;color:#eee;padding:4px;font-size:14px;border-radius:3px;text-align:center;"/>
          <button class="btn-toolbar" style="font-size:11px;" onclick="window._updateBPM()">Set</button>
        </div>
      </div>
      <div>
        <label style="font-size:12px;color:#888;">Duration</label>
        <div id="pb-duration" style="margin-top:4px;color:#eee;font-family:monospace;">${this._formatMs((this._state.project?.project?.duration || 300000))}</div>
      </div>
    </div>
  </div>

  <div class="control-section">
    <h3>🎯 Jump to Time</h3>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input type="number" id="pb-seek-min" min="0" max="99" value="0" placeholder="Min" style="width:60px;background:#111;border:1px solid #555;color:#eee;padding:6px;border-radius:4px;font-size:13px;text-align:center;"/>
      <span style="color:#888;">:</span>
      <input type="number" id="pb-seek-sec" min="0" max="59" value="0" placeholder="Sec" style="width:60px;background:#111;border:1px solid #555;color:#eee;padding:6px;border-radius:4px;font-size:13px;text-align:center;"/>
      <span style="color:#888;">.</span>
      <input type="number" id="pb-seek-ms" min="0" max="999" value="0" placeholder="Ms" style="width:65px;background:#111;border:1px solid #555;color:#eee;padding:6px;border-radius:4px;font-size:13px;text-align:center;"/>
      <button class="btn-primary" style="font-size:12px;" onclick="window._seekTo()">Go</button>
    </div>
  </div>

  <div class="control-section btn-panic" style="border-color:#ff2244;background:rgba(255,34,68,0.1);">
    <button class="btn-panic" style="width:100%;font-size:18px;padding:14px;" onclick="window.timelineEditor?.stop();window.appStop?.()">
      🚨 PANIC STOP
    </button>
  </div>
</div>

<script>
// Update timecode display from playhead
setInterval(() => {
  const ph = window.state?.playhead || 0;
  const el = document.getElementById('pb-timecode');
  if (el) {
    const min = Math.floor(ph/60000).toString().padStart(2,'0');
    const sec = Math.floor((ph%60000)/1000).toString().padStart(2,'0');
    const ms  = Math.floor(ph%1000).toString().padStart(3,'0');
    el.textContent = min + ':' + sec + '.' + ms;
  }
}, 100);

window._updateBPM = () => {
  const v = parseInt(document.getElementById('pb-bpm')?.value);
  if (v && window.state?.project?.project) {
    window.state.project.project.bpm = v;
    window.timelineEditor?._autosave();
  }
};
window._seekTo = () => {
  const min = parseInt(document.getElementById('pb-seek-min')?.value)||0;
  const sec = parseInt(document.getElementById('pb-seek-sec')?.value)||0;
  const ms  = parseInt(document.getElementById('pb-seek-ms')?.value)||0;
  window.timelineEditor?.seekTo(min*60000 + sec*1000 + ms);
};
<\/script>`;
  }

  /* ── Audio Manager ────────────────────────────────────────────── */
  audioManager() {
    return `
<div class="panel-audio-manager">
  <div class="control-section">
    <h3>🎵 Device Audio Library</h3>
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <button class="btn-primary" style="font-size:12px;" onclick="window._loadAudioLibrary()">🔄 Refresh</button>
      <button class="btn-toolbar" style="font-size:12px;" onclick="window._uploadAudio()">⬆ Upload File</button>
    </div>
    <div id="audio-library-list" style="min-height:80px;background:#111;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;color:#666;">
      Loading…
    </div>
  </div>

  <div class="control-section" style="margin-top:12px;">
    <h3>📁 Local Audio Library</h3>
    <p style="font-size:11px;color:#888;margin:0 0 8px;">Import audio from your device — stored locally in your browser, no upload needed.</p>
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <button class="btn-primary" style="font-size:12px;" onclick="window._importLocalAudio()">📂 Import Audio</button>
    </div>
    <div id="local-audio-status" style="font-size:11px;color:#888;margin-bottom:6px;min-height:16px;"></div>
    <div id="local-audio-library-list" style="min-height:60px;background:#111;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;color:#666;">
      Loading…
    </div>
  </div>

  <div class="control-grid">
    ${['A','B'].map(ch => `
    <div class="control-section">
      <h3>🔊 Player ${ch}</h3>
      <select id="player-${ch}-file" style="width:100%;background:#111;border:1px solid #555;color:#eee;padding:6px;border-radius:4px;font-size:12px;margin-bottom:8px;">
        <option value="">-- Select file --</option>
      </select>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        <button class="btn-primary" style="flex:1;font-size:12px;" onclick="window.api?.playAudio(document.getElementById('player-${ch}-file').value)">▶</button>
        <button class="btn-toolbar" style="flex:1;font-size:12px;" onclick="window.api?.pauseAudio()">⏸</button>
        <button class="btn-secondary" style="flex:1;font-size:12px;" onclick="window.api?.stopAudio()">⏹</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label style="font-size:11px;color:#888;white-space:nowrap;">Vol</label>
        <input type="range" id="player-${ch}-vol" min="0" max="100" value="80" style="flex:1;" oninput="window.api?.setAudioVolume(parseInt(this.value))"/>
        <span id="player-${ch}-vol-val" style="font-size:11px;color:#888;min-width:30px;">80%</span>
      </div>
    </div>`).join('')}
  </div>
</div>`;
  }

  /* ── Devices ──────────────────────────────────────────────────── */
  devices() {
    return `
<div class="panel-devices">
  <div class="control-section">
    <h3>🔍 Device Discovery</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="btn-primary" style="font-size:12px;" onclick="window._refreshDevices()">🔄 Refresh Devices</button>
    </div>
    <div id="devices-list" style="display:flex;flex-direction:column;gap:8px;">
      <div style="color:#666;font-size:12px;text-align:center;padding:20px;">Scanning for devices…</div>
    </div>
  </div>
</div>

<script>
window._refreshDevices = async () => {
  const list = document.getElementById('devices-list');
  if (list) list.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;padding:20px;">Scanning…</div>';
  try {
    const res = await window.api?.getDevices();
    const devs = res?.devices || [];
    if (list) {
      if (!devs.length) {
        list.innerHTML = '<div style="color:#666;font-size:12px;text-align:center;padding:20px;">No devices found. Make sure you are connected to a Showduino.</div>';
        return;
      }
      list.innerHTML = '';
      devs.forEach(d => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#222;border:1px solid #333;border-radius:6px;padding:12px;display:flex;align-items:center;gap:12px;';
        card.innerHTML = '<div style="width:12px;height:12px;border-radius:50%;background:#00ff88;flex-shrink:0;"></div>'
          + '<div style="flex:1;">'
          + '<div style="font-size:14px;color:#eee;font-weight:bold;">' + (d.name||'Showduino') + '</div>'
          + '<div style="font-size:11px;color:#666;">' + (d.ip||'') + ' · FW ' + (d.firmware||'?') + '</div>'
          + '</div>'
          + '<span style="font-size:11px;color:#00ff88;background:#004422;padding:2px 8px;border-radius:10px;">Online</span>';
        list.appendChild(card);
      });
    }
  } catch(e) {
    if (list) list.innerHTML = '<div style="color:#ff4444;font-size:12px;text-align:center;padding:20px;">Discovery failed: ' + e.message + '</div>';
  }
};
window._refreshDevices();
<\/script>`;
  }

  /* ── Diagnostics ──────────────────────────────────────────────── */
  async diagnostics() {
    let status = null;
    try { status = await this._api.getStatus(); } catch (_) {}

    const rows = status ? [
      ['Firmware',  status.firmware || 'N/A'],
      ['IP Address',status.ip || 'N/A'],
      ['MAC',       status.mac || 'N/A'],
      ['Uptime',    status.uptime ? Math.round(status.uptime / 1000) + 's' : 'N/A'],
      ['Free Heap', status.heap ? (status.heap / 1024).toFixed(1) + ' KB' : 'N/A'],
      ['WiFi SSID', status.ssid || 'Not connected'],
      ['SD Card',   status.sd_card ? '✅ OK' : '❌ Not Found'],
    ] : [];

    return `
<div class="panel-diagnostics">
  <div class="control-section">
    <h3>🖥 System Status</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <button class="btn-primary" style="font-size:12px;" onclick="location.reload()">🔄 Refresh</button>
      <button class="btn-toolbar" style="font-size:12px;" onclick="window.exportDiagnostics()">⬇ Export Report</button>
    </div>
    ${rows.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${rows.map(([k,v]) => `
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:6px 10px;color:#888;width:140px;">${k}</td>
        <td style="padding:6px 10px;color:#eee;font-family:monospace;">${v}</td>
      </tr>`).join('')}
    </table>` : `<p style="color:#ff4444;font-size:13px;">Device not reachable. Connect to your Showduino first.</p>`}
  </div>

  <div class="control-section">
    <h3>📋 App Diagnostics</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:6px 10px;color:#888;">User Tier</td>
        <td style="padding:6px 10px;color:#eee;text-transform:uppercase;font-weight:bold;">${this._state.user?.subscription || 'free'}</td>
      </tr>
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:6px 10px;color:#888;">Connection Mode</td>
        <td style="padding:6px 10px;color:#eee;">${window.connectionDetector?.getModeLabel() || 'Unknown'}</td>
      </tr>
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:6px 10px;color:#888;">Firebase Sync</td>
        <td style="padding:6px 10px;color:#eee;">${window.firebaseSync?.syncEnabled ? '✅ Enabled' : '❌ Disabled'}</td>
      </tr>
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:6px 10px;color:#888;">Project</td>
        <td style="padding:6px 10px;color:#eee;">${this._state.project?.project?.name || 'None'}</td>
      </tr>
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:6px 10px;color:#888;">Log Entries</td>
        <td style="padding:6px 10px;color:#eee;">${this._state.logs?.length || 0}</td>
      </tr>
    </table>
  </div>

  <div class="control-section">
    <h3>📜 Recent Logs</h3>
    <div style="background:#0a0a0a;border:1px solid #333;border-radius:4px;padding:8px;max-height:200px;overflow-y:auto;font-family:monospace;font-size:11px;color:#ccc;">
      ${(this._state.logs || []).slice(-20).reverse().map(l =>
        `<div style="color:${l.level==='ERR'?'#ff4444':l.level==='WARN'?'#ff8800':'#ccc'}">[${l.timestamp}] [${l.level}] ${l.message}</div>`
      ).join('') || '<span style="color:#555;">No logs yet.</span>'}
    </div>
  </div>
</div>`;
  }

  /* ── HauntSync ────────────────────────────────────────────────── */
  hauntsync() {
    return `
<div class="panel-hauntsync">
  <!-- Auth Section -->
  <div class="control-section" id="hauntsync-auth-section">
    <h3>🔐 Account</h3>
    <div id="hauntsync-auth-content">
      <p style="font-size:13px;color:#888;">Loading…</p>
    </div>
  </div>

  <!-- Online/Offline Sections -->
  <div class="hauntsync-online" style="display:none;">
    <div class="control-section">
      <h3>☁ Cloud Projects</h3>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <button class="btn-primary" style="font-size:12px;" onclick="window._loadCloudProjects()">🔄 Refresh</button>
        <button class="btn-toolbar" style="font-size:12px;" onclick="window.saveProject?.()">⬆ Sync Current</button>
      </div>
      <div id="cloud-projects-list" style="min-height:60px;background:#111;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;color:#666;">
        Sign in to view cloud projects.
      </div>
    </div>
  </div>
  <div class="hauntsync-offline">
    <div class="control-section" style="border-color:#555;">
      <h3>📴 Offline Mode</h3>
      <p style="font-size:13px;color:#888;">HauntSync cloud features require an internet connection. Your projects are saved locally.</p>
    </div>
  </div>

  <!-- Subscription -->
  <div class="control-section">
    <h3>⭐ Subscription</h3>
    <div style="font-size:13px;color:#ccc;margin-bottom:8px;">Current tier: <strong style="color:#00ffcc;text-transform:uppercase;" id="hs-tier-display">${this._state.user?.subscription || 'free'}</strong></div>
    <div class="control-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
      ${[
        { id:'free',       label:'Free',       price:'$0/mo',  desc:'Timeline editor & local save'},
        { id:'pro',        label:'Pro',         price:'$9/mo',  desc:'Device control & cloud sync'},
        { id:'enterprise', label:'Enterprise', price:'$29/mo', desc:'Multi-device & priority support'},
      ].map(t => `
      <div id="hs-tier-${t.id}" style="background:#222;border:2px solid ${this._state.user?.subscription===t.id?'var(--accent-color)':'#333'};border-radius:6px;padding:10px;cursor:pointer;" onclick="window._setTier('${t.id}')">
        <div style="font-weight:bold;color:#eee;font-size:13px;">${t.label}</div>
        <div style="color:var(--accent-color);font-size:14px;margin:4px 0;">${t.price}</div>
        <div style="color:#666;font-size:11px;">${t.desc}</div>
      </div>`).join('')}
    </div>
    <p style="font-size:11px;color:#555;margin-top:8px;">⚠ Tier selection here is for demo purposes only.</p>
  </div>
</div>

<script>
window._setTier = (tier) => {
  localStorage.setItem('hauntsync_subscription', tier);
  const disp = document.getElementById('hs-tier-display');
  if (disp) disp.textContent = tier;
  ['free','pro','enterprise'].forEach(t => {
    const el = document.getElementById('hs-tier-'+t);
    if (el) el.style.borderColor = t === tier ? 'var(--accent-color)' : '#333';
  });
};

window._loadCloudProjects = async () => {
  const list = document.getElementById('cloud-projects-list');
  if (list) list.textContent = 'Loading…';
  try {
    const projects = await window.firebaseSync?.loadProjects() || [];
    if (!projects.length) {
      if (list) list.innerHTML = '<span style="color:#666;">No cloud projects found.</span>';
      return;
    }
    if (list) {
      list.innerHTML = '';
      projects.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #222;';
        row.innerHTML = '<div style="flex:1;"><div style="color:#eee;font-size:13px;">'+p.project.name+'</div>'
          +'<div style="color:#555;font-size:10px;">'+new Date(p.project.updatedAt).toLocaleString()+'</div></div>'
          +'<button class="btn-secondary" style="font-size:11px;padding:2px 8px;" onclick="window.loadProject(\\''+p.project.id+'\\',\\'cloud\\')">Open</button>';
        list.appendChild(row);
      });
    }
  } catch(e) { if (list) list.innerHTML = '<span style="color:#ff4444;">'+e.message+'</span>'; }
};

// Auth state display
const authSection = document.getElementById('hauntsync-auth-content');
const onlineSection = document.querySelector('.hauntsync-online');
const offlineSection = document.querySelector('.hauntsync-offline');

const updateAuth = (user) => {
  if (!authSection) return;
  if (user) {
    authSection.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:32px;height:32px;border-radius:50%;background:#444;display:flex;align-items:center;justify-content:center;font-size:16px;">👤</div><div><div style="color:#eee;font-size:13px;">'+(user.displayName||user.email||'User')+'</div><div style="color:#666;font-size:11px;">'+(user.email||'')+'</div></div></div>'
      +'<button class="btn-secondary" style="font-size:12px;" onclick="window.firebaseAuth?.signOut()">Sign Out</button>';
    if (navigator.onLine && onlineSection) onlineSection.style.display='block';
    if (offlineSection) offlineSection.style.display = navigator.onLine ? 'none' : 'block';
    window._loadCloudProjects();
  } else {
    authSection.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">'
      +'<input id="hs-email" type="email" placeholder="Email" style="background:#111;border:1px solid #555;color:#eee;padding:7px;border-radius:4px;font-size:13px;"/>'
      +'<input id="hs-pass" type="password" placeholder="Password" style="background:#111;border:1px solid #555;color:#eee;padding:7px;border-radius:4px;font-size:13px;"/>'
      +'<div style="display:flex;gap:8px;">'
      +'<button class="btn-primary" style="flex:1;font-size:12px;" onclick="window._hsSignIn()">Sign In</button>'
      +'<button class="btn-toolbar" style="flex:1;font-size:12px;" onclick="window._hsSignUp()">Sign Up</button>'
      +'<button class="btn-toolbar" style="flex:1;font-size:12px;" onclick="window.firebaseAuth?.signInWithGoogle()">Google</button>'
      +'</div>'
      +'<div id="hs-auth-err" style="font-size:11px;color:#ff4444;min-height:16px;"></div>'
      +'</div>';
    if (onlineSection) onlineSection.style.display='none';
  }
};

window._hsSignIn = async () => {
  const e=document.getElementById('hs-email')?.value, p=document.getElementById('hs-pass')?.value;
  const err = document.getElementById('hs-auth-err');
  try { await window.firebaseAuth?.signIn(e,p); } catch(ex) { if(err) err.textContent=ex.message; }
};
window._hsSignUp = async () => {
  const e=document.getElementById('hs-email')?.value, p=document.getElementById('hs-pass')?.value;
  const err = document.getElementById('hs-auth-err');
  try { await window.firebaseAuth?.signUp(e,p,''); } catch(ex) { if(err) err.textContent=ex.message; }
};

if (window.firebaseAuth) window.firebaseAuth.onAuthStateChanged(updateAuth);
else updateAuth(null);
<\/script>`;
  }

  /* ── Settings ─────────────────────────────────────────────────── */
  settings() {
    const sub = this._state.user?.subscription || 'free';
    return `
<div class="panel-settings">
  <div class="control-section">
    <h3>⚙ App Settings</h3>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:10px;">
        <div>
          <div style="font-size:13px;color:#eee;">Theme</div>
          <div style="font-size:11px;color:#666;">Application color theme</div>
        </div>
        <select id="settings-theme" style="background:#111;border:1px solid #555;color:#eee;padding:5px;border-radius:4px;font-size:12px;">
          <option value="dark" selected>Dark (Default)</option>
          <option value="darker">Darker</option>
          <option value="light" disabled>Light (Coming soon)</option>
        </select>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:10px;">
        <div>
          <div style="font-size:13px;color:#eee;">Autosave Interval</div>
          <div style="font-size:11px;color:#666;">How often to auto-save locally</div>
        </div>
        <select id="settings-autosave" style="background:#111;border:1px solid #555;color:#eee;padding:5px;border-radius:4px;font-size:12px;">
          <option value="10000">10 seconds</option>
          <option value="30000" selected>30 seconds</option>
          <option value="60000">1 minute</option>
          <option value="0">Disabled</option>
        </select>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:10px;">
        <div>
          <div style="font-size:13px;color:#eee;">Default Snap</div>
          <div style="font-size:11px;color:#666;">Clip snapping resolution</div>
        </div>
        <select id="settings-snap" style="background:#111;border:1px solid #555;color:#eee;padding:5px;border-radius:4px;font-size:12px;">
          <option value="250">250ms (1/4 beat)</option>
          <option value="500">500ms (1/2 beat)</option>
          <option value="1000" selected>1000ms (1 beat)</option>
          <option value="2000">2000ms (2 beats)</option>
        </select>
      </div>
    </div>
    <button class="btn-primary" style="margin-top:12px;font-size:12px;" onclick="window._saveSettings()">Save Settings</button>
  </div>

  <div class="control-section">
    <h3>🗑 Clear Data</h3>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn-secondary" style="font-size:12px;text-align:left;" onclick="window._clearLogs()">🧹 Clear Logs</button>
      <button class="btn-secondary" style="font-size:12px;text-align:left;" onclick="window._clearAutosave()">🗑 Clear Autosave</button>
      <button class="btn-secondary" style="font-size:12px;color:#ff4444;text-align:left;" onclick="window._clearAllData()">⚠ Clear All Local Data</button>
    </div>
  </div>

  <div class="control-section">
    <h3>ℹ About</h3>
    <div style="font-size:13px;color:#888;line-height:1.8;">
      <div>Showduino Studio v1.0</div>
      <div>Build: ${new Date().toISOString().split('T')[0]}</div>
      <div>Tier: <strong style="color:#00ffcc;text-transform:uppercase;">${sub}</strong></div>
      <div style="margin-top:8px;"><a href="https://showduino.com" target="_blank" style="color:#00ffcc;">showduino.com</a></div>
    </div>
  </div>
</div>

<script>
window._saveSettings = () => {
  const snap = parseInt(document.getElementById('settings-snap')?.value) || 1000;
  if (window.timelineEditor) { window.timelineEditor._snapMs = snap; }
  if (window.state?.project?.config) window.state.project.config.snapMs = snap;
  localStorage.setItem('showduino_settings', JSON.stringify({ snap }));
  alert('Settings saved!');
};
window._clearLogs = () => {
  if (window.state) window.state.logs = [];
  document.querySelector('.terminal-output').innerHTML = '';
  alert('Logs cleared.');
};
window._clearAutosave = () => {
  localStorage.removeItem('showduino_current_project');
  alert('Autosave cleared.');
};
window._clearAllData = () => {
  if (!confirm('Clear ALL local data? This cannot be undone.')) return;
  localStorage.clear();
  alert('All local data cleared. Refreshing…');
  setTimeout(() => location.reload(), 500);
};
<\/script>`;
  }

  /* ── Help ─────────────────────────────────────────────────────── */
  help() {
    return `
<div class="panel-help" style="max-width:800px;">
  <div class="control-section">
    <h3>📚 Documentation</h3>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${[
        ['Getting Started',   'Learn the basics of Showduino Studio',   'https://showduino.com/docs/start'],
        ['Timeline Editor',   'Full guide to the DAW timeline',          'https://showduino.com/docs/timeline'],
        ['Device Setup',      'Connecting and configuring your Showduino','https://showduino.com/docs/device'],
        ['HauntSync Cloud',   'Cloud sync and project management',       'https://showduino.com/docs/cloud'],
        ['API Reference',     'HTTP API endpoint reference',             'https://showduino.com/docs/api'],
      ].map(([title, desc, url]) => `
      <a href="${url}" target="_blank" style="background:#222;border:1px solid #333;border-radius:5px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;text-decoration:none;">
        <div>
          <div style="font-size:13px;color:#eee;font-weight:bold;">${title}</div>
          <div style="font-size:11px;color:#666;margin-top:2px;">${desc}</div>
        </div>
        <span style="color:#00ffcc;font-size:16px;">→</span>
      </a>`).join('')}
    </div>
  </div>

  <div class="control-section">
    <h3>⌨ Keyboard Shortcuts</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${[
        ['Space',           'Play / Pause playback'],
        ['Delete',          'Delete selected clip'],
        ['Ctrl + Z',        'Undo'],
        ['Ctrl + Y',        'Redo'],
        ['Ctrl + S',        'Save project'],
        ['Ctrl + +',        'Zoom in on timeline'],
        ['Ctrl + -',        'Zoom out on timeline'],
        ['Double-click',    'Add clip to track at cursor'],
        ['Right-click clip','Context menu (split, duplicate, delete)'],
        ['Drag clip edge',  'Resize clip duration'],
        ['Drag clip body',  'Move clip along timeline'],
      ].map(([k,v]) => `
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:6px 10px;"><kbd style="background:#333;padding:2px 8px;border-radius:3px;font-size:11px;color:#00ffcc;">${k}</kbd></td>
        <td style="padding:6px 10px;color:#ccc;">${v}</td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="control-section">
    <h3>🔌 API Endpoints</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      ${[
        ['GET',  '/status',         'Device status JSON'],
        ['POST', '/led/set',        '{ line, r, g, b, brightness }'],
        ['POST', '/led/clear',      '{ line }'],
        ['POST', '/relay/set',      '{ out, state }'],
        ['POST', '/audio/play',     '{ file }'],
        ['POST', '/audio/stop',     '{}'],
        ['GET',  '/audio/list',     'Returns { files:[] }'],
        ['POST', '/audio/upload',   'Multipart form upload'],
        ['POST', '/wifi/connect',   '{ ssid, password }'],
        ['POST', '/project/save',   '{ filename, data }'],
        ['GET',  '/project/load',   '?file=filename.shdo'],
        ['GET',  '/devices',        'Returns { devices:[] }'],
      ].map(([m,p,d]) => `
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:4px 8px;"><span style="background:${m==='GET'?'#004400':'#004488'};color:#fff;padding:1px 6px;border-radius:3px;font-family:monospace;font-size:10px;">${m}</span></td>
        <td style="padding:4px 8px;font-family:monospace;color:#00ffcc;">${p}</td>
        <td style="padding:4px 8px;color:#888;">${d}</td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="control-section">
    <h3>💬 Support</h3>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
      <a href="https://showduino.com/forum" target="_blank" style="color:#00ffcc;">💬 Community Forum</a>
      <a href="mailto:support@showduino.com" style="color:#00ffcc;">📧 support@showduino.com</a>
      <a href="https://github.com/showduino" target="_blank" style="color:#00ffcc;">🐙 GitHub</a>
    </div>
  </div>
</div>`;
  }

  /* ── Helpers ──────────────────────────────────────────────────── */
  _formatMs(ms) {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${String(sec).padStart(2,'0')}`;
  }
}

window.PanelManager = PanelManager;
