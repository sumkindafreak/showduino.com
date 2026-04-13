// Showduino Studio - Main Application
document.addEventListener('DOMContentLoaded', () => {
  // Global state
  const state = {
      connection: 'offline',
      project: null,
      scene: null,
      selection: null,
      transport: 'stopped', // stopped, playing, paused
      playhead: 0, // in milliseconds
      devices: [],
      logs: [],
      user: {
          hasShowduino: false,
          subscription: (localStorage.getItem('hauntsync_subscription') || 'free') // free | pro | enterprise
      },
      autosaveInterval: null,
      lastAutosave: null
  };

  // Initialize API client
  const api = new ShowduinoAPI();
  
  // Initialize Panel Manager
  const panelManager = new PanelManager(api, state, log);

  // Initialize Audio Library (IndexedDB-backed local audio management)
  const audioLibrary = new AudioLibrary();
  window.audioLibrary = audioLibrary;
  audioLibrary.init().catch(() => {}); // async init, errors handled gracefully

  const workspace = document.querySelector('.workspace');
  const terminalOutput = document.querySelector('.terminal-output');
  const clockElement = document.querySelector('.clock');
  const playButton = document.querySelector('.transport-controls button:nth-child(1)');
  const stopButton = document.querySelector('.transport-controls button:nth-child(2)');
  const panicButton = document.querySelector('.transport-controls .panic');

  let animationFrameId;

  let logFilter = 'ALL';

  function log(message, level = 'INFO') {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = document.createElement('div');
      logEntry.textContent = `[${timestamp}] [${level}] ${message}`;
      logEntry.dataset.level = level;
      logEntry.style.display = (logFilter === 'ALL' || logFilter === level) ? 'block' : 'none';
      terminalOutput.appendChild(logEntry);
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
      
      // Store in state
      state.logs.push({ timestamp, level, message });
      if (state.logs.length > 500) {
          state.logs.shift();
      }
  }
  
  // Terminal filter buttons
  document.querySelectorAll('.terminal-header .filters button').forEach(btn => {
      btn.addEventListener('click', () => {
          document.querySelectorAll('.terminal-header .filters button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          logFilter = btn.textContent;
          
          // Update visibility
          document.querySelectorAll('.terminal-output div').forEach(entry => {
              const level = entry.dataset.level || 'INFO';
              entry.style.display = (logFilter === 'ALL' || logFilter === level) ? 'block' : 'none';
          });
      });
  });

  function updateClock() {
      clockElement.textContent = new Date().toLocaleTimeString();
  }

  function updateUIForTier() {
      const { subscription } = state.user;
      const sidebarItems = document.querySelectorAll('.sidebar-nav li');
      const permissions = {
          free: ['timeline-editor', 'playback', 'audio-manager', 'hauntsync', 'settings', 'help'],
          pro: ['connect', 'live-control', 'timeline-editor', 'playback', 'audio-manager', 'devices', 'diagnostics', 'hauntsync', 'settings', 'help'],
          enterprise: ['connect', 'live-control', 'timeline-editor', 'playback', 'audio-manager', 'devices', 'diagnostics', 'hauntsync', 'settings', 'help']
      };
      const allowedPanels = permissions[subscription] || permissions.free;
      sidebarItems.forEach(item => {
          const panelName = item.dataset.panel;
          if (panelName === 'introduction') return;
          if (allowedPanels.includes(panelName)) {
              item.classList.remove('locked');
              item.title = '';
          } else {
              item.classList.add('locked');
              item.title = 'This feature requires a different subscription tier.';
          }
      });
  }

  function updateHauntSyncPanel() {
      const { subscription } = state.user;
      const onlineContainer = document.querySelector('.hauntsync-online');
      const offlineContainer = document.querySelector('.hauntsync-offline');
      const isOnline = navigator.onLine;

      if (isOnline) {
          offlineContainer.style.display = 'none';
          onlineContainer.style.display = 'block';
          let content = '';
          switch(subscription) {
              case 'owner':
                  content = '<p>Your shows are being backed up to the cloud.</p>';
                  break;
              case 'creator':
                  content = '<p>You are using cloud-only projects. Export your .shdo files from here.</p>';
                  break;
              case 'pro':
                  content = '<p>Welcome to the HauntSync Pro dashboard. Manage your devices and shows.</p>';
                  break;
          }
          onlineContainer.innerHTML = content;
      } else {
          onlineContainer.style.display = 'none';
          offlineContainer.style.display = 'block';
      }
  }

  async function loadPanel(panelName) {
      const navItem = document.querySelector(`.sidebar-nav li[data-panel="${panelName}"]`);
      if (navItem && navItem.classList.contains('locked')) {
          log(`Access to ${panelName} is locked for your current subscription tier.`, 'WARN');
          return;
      }

      try {
          let html = '';
          if (panelName === 'connect') {
              html = await panelManager.connect();
          } else if (panelName === 'diagnostics') {
              html = await panelManager.diagnostics();
          } else if (panelName === 'introduction') {
              html = panelManager.introduction();
          } else if (panelName === 'live-control') {
              html = panelManager.liveControl();
          } else if (panelName === 'timeline-editor') {
              html = panelManager.timelineEditor();
          } else if (panelName === 'playback') {
              html = panelManager.playback();
          } else if (panelName === 'audio-manager') {
              html = panelManager.audioManager();
          } else if (panelName === 'devices') {
              html = panelManager.devices();
          } else if (panelName === 'hauntsync') {
              html = panelManager.hauntsync();
              setTimeout(() => initHauntSyncPanel(), 100);
          } else if (panelName === 'settings') {
              html = panelManager.settings();
          } else if (panelName === 'help') {
              html = panelManager.help();
          }

          workspace.innerHTML = html;
          // Re-execute any inline <script> tags (innerHTML does not execute them)
          workspace.querySelectorAll('script').forEach(oldScript => {
              const newScript = document.createElement('script');
              newScript.textContent = oldScript.textContent;
              document.head.appendChild(newScript);
              document.head.removeChild(newScript);
          });
          log(`Loaded panel: ${panelName}`);

          // Initialize panel-specific functionality
          if (panelName === 'timeline-editor') {
              setTimeout(() => {
                  loadTimelineEditor();
                  initTimelineEditor();
              }, 100);
          }
          if (panelName === 'live-control') {
              setTimeout(() => initLiveControl(), 100);
          }
          if (panelName === 'audio-manager') {
              setTimeout(() => initAudioManager(), 100);
          }
          if (panelName === 'playback') {
              setTimeout(() => initPlayback(), 100);
          }
          if (panelName === 'connect') {
              setTimeout(() => initConnectPanel(), 100);
          }
          if (panelName === 'devices') {
              setTimeout(() => initDevicesPanel(), 100);
          }
          if (panelName === 'settings') {
              setTimeout(() => initSettingsPanel(), 100);
          }
      } catch (error) {
          log(`Error loading panel ${panelName}: ${error.message}`, 'ERR');
      }
  }

  let timelineEditor = null;
  let audioBrowser = null;
  let dmxEditor = null;
  let ledStudio = null;

  function initTimelineEditor() {
      if (!timelineEditor) {
          timelineEditor = new TimelineEditor(api, state, log);
          window.timelineEditor = timelineEditor;
      }
      if (!audioBrowser) {
          audioBrowser = new AudioBrowser(api, timelineEditor);
          window.audioBrowser = audioBrowser;
      }
      if (!dmxEditor) {
          dmxEditor = new DMXEditor(timelineEditor);
          window.dmxEditor = dmxEditor;
      }
      if (!ledStudio) {
          ledStudio = new LEDStudio(timelineEditor);
          window.ledStudio = ledStudio;
      }
      timelineEditor.init();
      // Render audio library into the sidebar
      const libSidebar = document.getElementById('audio-lib-sidebar');
      if (libSidebar && window.audioLibrary) {
          window.audioLibrary.renderPanel(libSidebar);
      }
  }

  function loadTimelineEditor() {
      // This is now handled by TimelineEditor class
      // Legacy function kept for compatibility
  }

  function showClipInspector(clipData) {
      const inspector = document.querySelector('.inspector');
      if (!inspector) return;

      inspector.innerHTML = `
          <h3>Clip Inspector</h3>
          <div class="inspector-field">
              <label>ID:</label>
              <span>${clipData.id}</span>
          </div>
          <div class="inspector-field">
              <label>Label:</label>
              <input type="text" value="${clipData.label || ''}" onchange="window.updateClipLabel('${clipData.id}', this.value)">
          </div>
          <div class="inspector-field">
              <label>Start (ms):</label>
              <input type="number" value="${clipData.startMs}" onchange="window.updateClipStart('${clipData.id}', parseInt(this.value))">
          </div>
          <div class="inspector-field">
              <label>Duration (ms):</label>
              <input type="number" value="${clipData.durationMs}" onchange="window.updateClipDuration('${clipData.id}', parseInt(this.value))">
          </div>
          <div class="inspector-field">
              <label>Type:</label>
              <span>${clipData.type}</span>
          </div>
      `;
  }

  function makeDraggable(element) {
      let pos1 = 0, pos3 = 0;
      element.onmousedown = dragMouseDown;

      function dragMouseDown(e) {
          e = e || window.event;
          e.preventDefault();
          pos3 = e.clientX;
          document.onmouseup = closeDragElement;
          document.onmousemove = elementDrag;
      }

      function elementDrag(e) {
          e = e || window.event;
          e.preventDefault();
          pos1 = pos3 - e.clientX;
          pos3 = e.clientX;
          element.style.left = (element.offsetLeft - pos1) + "px";
      }

      function closeDragElement() {
          document.onmouseup = null;
          document.onmousemove = null;
      }
  }

  function updatePlayhead() {
      if (state.transport === 'playing') {
          state.playhead += 20; // Increment by 20ms
          const playheadElement = document.querySelector('.playhead');
          if (playheadElement) {
              playheadElement.style.left = `${state.playhead / 100}px`;
          }
          animationFrameId = requestAnimationFrame(updatePlayhead);
      }
  }

  function play() {
      if (state.transport !== 'playing') {
          state.transport = 'playing';
          log('Playback started');
          updatePlayhead();
      }
  }

  function stop() {
      if (state.transport !== 'stopped') {
          state.transport = 'stopped';
          state.playhead = 0;
          const playheadElement = document.querySelector('.playhead');
          if (playheadElement) {
              playheadElement.style.left = `0px`;
          }
          cancelAnimationFrame(animationFrameId);
          log('Playback stopped');
      }
  }

  async function panic() {
      stop();
      log('PANIC! Emergency stop initiated.', 'ERR');
      try {
          // Clear all LEDs
          await api.clearLEDLine(0);
          // Stop audio
          await api.stopAudio();
          // Turn off all relays
          await api.setRelay(1, false);
          await api.setRelay(2, false);
      } catch (error) {
          log(`Emergency stop error: ${error.message}`, 'ERR');
      }
  }

  // Autosave system
  function startAutosave() {
      if (state.autosaveInterval) return;
      
      state.autosaveInterval = setInterval(() => {
          if (state.project) {
              autosave();
          }
      }, 20000); // Every 20 seconds
      log('Autosave enabled');
  }

  function stopAutosave() {
      if (state.autosaveInterval) {
          clearInterval(state.autosaveInterval);
          state.autosaveInterval = null;
      }
  }

  async function autosave() {
      if (!state.project) return;
      
      try {
          const snapshot = {
              ...state.project,
              project: {
                  ...state.project.project,
                  updatedAt: new Date().toISOString()
              },
              _autosave: true,
              _timestamp: Date.now()
          };
          
          // Save to localStorage as backup
          const key = `autosave_${state.project.project.id}_${Date.now()}`;
          localStorage.setItem(key, JSON.stringify(snapshot));
          
          // Keep only last 20 autosaves
          const autosaveKeys = Object.keys(localStorage)
              .filter(k => k.startsWith('autosave_'))
              .sort()
              .reverse();
          if (autosaveKeys.length > 20) {
              autosaveKeys.slice(20).forEach(k => localStorage.removeItem(k));
          }
          
          // Sync to Firebase if available (but don't block on it)
          const shouldUseFirebase = window.connectionDetector?.shouldUseFirebase() || false;
          if (shouldUseFirebase && window.firebaseSync && window.firebaseSync.syncEnabled) {
              // Sync in background, don't wait for it
              window.firebaseSync.syncProject(state.project).catch(err => {
                  // Silently fail for autosave - it's just a backup
                  console.warn('Autosave cloud sync failed:', err);
              });
          }
          
          state.lastAutosave = Date.now();
          // Only log autosave every 5 minutes to reduce noise
          if (!state.lastAutosaveLog || Date.now() - state.lastAutosaveLog > 300000) {
              log('Autosave completed', 'INFO');
              state.lastAutosaveLog = Date.now();
          }
      } catch (error) {
          log(`Autosave error: ${error.message}`, 'WARN');
      }
  }

  // Recovery system
  function getAutosaves() {
      const autosaveKeys = Object.keys(localStorage)
          .filter(k => k.startsWith('autosave_'))
          .map(key => {
              try {
                  const data = JSON.parse(localStorage.getItem(key));
                  return {
                      key,
                      timestamp: data._timestamp || 0,
                      projectName: data.project?.name || 'Unknown',
                      date: new Date(data._timestamp).toLocaleString()
                  };
              } catch (e) {
                  return null;
              }
          })
          .filter(item => item !== null)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 20);
      
      return autosaveKeys;
  }

  function restoreAutosave(key) {
      try {
          const data = JSON.parse(localStorage.getItem(key));
          delete data._autosave;
          delete data._timestamp;
          state.project = data;
          log(`Restored autosave: ${data.project?.name || 'Unknown'}`, 'INFO');
          
          // Reload timeline if active
          if (document.querySelector('.timeline-editor')) {
              loadTimelineEditor();
          }
          
          return true;
      } catch (error) {
          log(`Failed to restore autosave: ${error.message}`, 'ERR');
          return false;
      }
  }

  window.showRecovery = () => {
      const autosaves = getAutosaves();
      const recoveryHtml = `
          <div class="recovery-panel">
              <h2>Recovery - Autosave Snapshots</h2>
              <p>Restore from previous autosave snapshots:</p>
              <div class="autosave-list">
                  ${autosaves.length > 0 ? autosaves.map(autosave => `
                      <div class="autosave-item">
                          <div class="autosave-info">
                              <strong>${autosave.projectName}</strong>
                              <span class="autosave-date">${autosave.date}</span>
                          </div>
                          <button onclick="window.restoreAutosave('${autosave.key}')">Restore</button>
                      </div>
                  `).join('') : '<p>No autosave snapshots found.</p>'}
              </div>
          </div>
      `;
      workspace.innerHTML = recoveryHtml;
  };

  window.restoreAutosave = (key) => {
      if (confirm('Restore this autosave? Current work will be replaced.')) {
          if (restoreAutosave(key)) {
              loadPanel('timeline-editor');
          }
      }
  };

  // Initialize panel-specific handlers
  function initLiveControl() {
      // LED controls — define both with and without underscore prefix for compatibility
      const setLEDLineImpl = async (line) => {
          const colorEl = document.getElementById(`led${line}-color`);
          const briEl = document.getElementById(`led${line}-brightness`);
          if (colorEl && briEl) {
              const hex = colorEl.value;
              const r = parseInt(hex.substr(1, 2), 16);
              const g = parseInt(hex.substr(3, 2), 16);
              const b = parseInt(hex.substr(5, 2), 16);
              const brightness = parseInt(briEl.value);
              try {
                  await api.setLEDLine(line, r, g, b, brightness);
                  log(`LED Line ${line} set`, 'INFO');
              } catch (error) {
                  log(`Failed to set LED: ${error.message}`, 'ERR');
              }
          }
      };
      window.setLEDLine  = setLEDLineImpl;
      window._setLEDLine = setLEDLineImpl;

      const clearLEDLineImpl = async (line) => {
          try {
              await api.clearLEDLine(line);
              log(`LED Line ${line} cleared`, 'INFO');
          } catch (error) {
              log(`Failed to clear LED: ${error.message}`, 'ERR');
          }
      };
      window.clearLEDLine  = clearLEDLineImpl;
      window._clearLEDLine = clearLEDLineImpl;

      const clearAllLEDsImpl = async () => {
          try {
              await api.clearLEDLine(0);
              log('All LEDs cleared', 'INFO');
          } catch (error) {
              log(`Failed to clear all LEDs: ${error.message}`, 'ERR');
          }
      };
      window.clearAllLEDs  = clearAllLEDsImpl;
      window._clearAllLEDs = clearAllLEDsImpl;

      const setRelayImpl = async (out, relayState) => {
          try {
              await api.setRelay(out, relayState);
              log(`Relay ${out} ${relayState ? 'ON' : 'OFF'}`, 'INFO');
          } catch (error) {
              log(`Failed to set relay: ${error.message}`, 'ERR');
          }
      };
      window._setRelay  = setRelayImpl;
      window.setRelay   = setRelayImpl;

      // LED brightness slider live update
      document.querySelectorAll('[id^="led"][id$="-brightness"]').forEach(slider => {
          const valEl = document.getElementById(slider.id.replace('brightness', 'bright-val'));
          if (valEl) slider.addEventListener('input', () => { valEl.textContent = slider.value; });
      });
  }

  function initAudioManager() {
      // Render local audio library into the panel
      const libPanel = document.getElementById('local-audio-library-panel');
      if (libPanel && window.audioLibrary) {
          window.audioLibrary.renderPanel(libPanel);
      }
      // Load device audio
      window._loadDeviceAudio && window._loadDeviceAudio();
  }

  // Audio manager functions (defined globally so HTML onclick handlers work)
  window._importLocalAudio = () => {
      if (window.audioLibrary) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/mp3,audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg,.flac,.m4a,.aac';
          input.multiple = true;
          input.style.display = 'none';
          document.body.appendChild(input);
          input.addEventListener('change', async () => {
              if (input.files && input.files.length) {
                  await window.audioLibrary.addFiles(input.files);
                  // Re-render wherever we have panels mounted
                  const libPanel = document.getElementById('local-audio-library-panel');
                  if (libPanel) window.audioLibrary.renderPanel(libPanel);
                  const libSidebar = document.getElementById('audio-lib-sidebar');
                  if (libSidebar) window.audioLibrary.renderPanel(libSidebar);
              }
              document.body.removeChild(input);
          });
          input.click();
      }
  };

  window._stopAudioPreview = () => {
      if (window.audioLibrary) window.audioLibrary.stopPreview();
  };

  window._loadDeviceAudio = async () => {
      const list = document.getElementById('device-audio-list');
      if (!list) return;
      list.textContent = 'Loading…';
      try {
          const res = await api.listAudioFiles();
          const files = Array.isArray(res) ? res : (res && res.files ? res.files : []);
          if (!files.length) {
              list.innerHTML = '<span style="color:#666;">No audio files on device SD card.</span>';
              return;
          }
          list.innerHTML = '';
          files.forEach(f => {
              const name = typeof f === 'string' ? f : (f.name || String(f));
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #222;';
              row.innerHTML = '<span style="flex:1;color:#eee;font-size:12px;">🎵 ' + name + '</span>';
              const btn = document.createElement('button');
              btn.className = 'btn-toolbar';
              btn.style.cssText = 'font-size:11px;padding:2px 8px;';
              btn.textContent = '▶';
              btn.addEventListener('click', () => api.playAudio(name).catch(() => {}));
              row.appendChild(btn);
              list.appendChild(row);
          });
      } catch (e) {
          list.innerHTML = '<span style="color:#888;">Device not connected. Files unavailable.</span>';
      }
  };

  window._uploadDeviceAudio = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.wav,.ogg';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
          for (const f of input.files) {
              try { await api.uploadAudioFile(f); } catch (_) {}
          }
          document.body.removeChild(input);
          window._loadDeviceAudio && window._loadDeviceAudio();
      });
      input.click();
  };
  
  // Audio player control functions
  window.playAudioPlayer = async () => {
      const select = document.getElementById('audio-player-files');
      if (select && select.value) {
          try {
              await api.playAudio(select.value);
              log(`Playing audio: ${select.value}`, 'INFO');
          } catch (error) {
              log(`Failed to play audio: ${error.message}`, 'ERR');
          }
      } else {
          log('Please select an audio file first', 'WARN');
      }
  };
  
  window.stopAudioPlayer = async () => {
      try {
          await api.stopAudio();
          log('Audio stopped', 'INFO');
      } catch (error) {
          log(`Failed to stop audio: ${error.message}`, 'ERR');
      }
  };
  
  window.pauseAudioPlayer = async () => {
      try {
          await api.pauseAudio();
          log('Audio paused', 'INFO');
      } catch (error) {
          log(`Failed to pause audio: ${error.message}`, 'ERR');
      }
  };
  
  window.resumeAudioPlayer = async () => {
      try {
          await api.resumeAudio();
          log('Audio resumed', 'INFO');
      } catch (error) {
          log(`Failed to resume audio: ${error.message}`, 'ERR');
      }
  };
  
  window.setAudioPlayerVolume = async (value) => {
      try {
          await api.setAudioVolume(parseInt(value));
          log(`Audio volume set to ${value}%`, 'INFO');
      } catch (error) {
          log(`Failed to set volume: ${error.message}`, 'ERR');
      }
  };
  
  window.refreshAudioLibrary = async () => {
      window._loadDeviceAudio && window._loadDeviceAudio();
      log('Audio library refreshed', 'INFO');
  };
  
  window.uploadAudio = async () => {
      const input = document.getElementById('audio-upload-input');
      if (input && input.files && input.files[0]) {
          try {
              await api.uploadAudioFile(input.files[0]);
              log(`Audio file uploaded: ${input.files[0].name}`, 'INFO');
              window._loadDeviceAudio && window._loadDeviceAudio();
              input.value = '';
          } catch (error) {
              log(`Failed to upload audio: ${error.message}`, 'ERR');
          }
      }
  };

  function initPlayback() {
      // Initialize playback panel - BPM and seek helpers
      updatePlaybackInfo();
      window._updateBPM = () => {
          const v = parseInt(document.getElementById('pb-bpm')?.value);
          if (v && state.project?.project) {
              state.project.project.bpm = v;
              if (window.timelineEditor) window.timelineEditor._autosave();
          }
      };
      window._seekTo = () => {
          const min = parseInt(document.getElementById('pb-seek-min')?.value) || 0;
          const sec = parseInt(document.getElementById('pb-seek-sec')?.value) || 0;
          const ms  = parseInt(document.getElementById('pb-seek-ms')?.value)  || 0;
          const t = min * 60000 + sec * 1000 + ms;
          if (window.timelineEditor) window.timelineEditor.seekTo(t);
          else state.playhead = t;
      };
  }

  function initConnectPanel() {
      window._scanWifi = async () => {
          const el = document.getElementById('wifi-list');
          if (el) el.textContent = 'Scanning…';
          try {
              const result = await api.getStatus();
              if (el) el.innerHTML = result
                  ? '<span style="color:#00ffcc;">Scan not supported via /status. Use Showduino AP to configure WiFi.</span>'
                  : '<span style="color:#ff4444;">Device not reachable.</span>';
          } catch (e) {
              if (el) el.innerHTML = `<span style="color:#ff4444;">Failed: ${e.message}</span>`;
          }
      };
      window._connectWifi = async () => {
          const ssid = document.getElementById('wifi-ssid')?.value;
          const pass = document.getElementById('wifi-password')?.value;
          if (!ssid) { alert('Enter SSID'); return; }
          try {
              await api.connectWiFi(ssid, pass);
              alert('Connect request sent. Device will reboot.');
          } catch (e) { alert('Failed: ' + e.message); }
      };
  }

  function initDevicesPanel() {
      window._refreshDevices = async () => {
          const list = document.getElementById('devices-list');
          if (!list) return;
          list.innerHTML = '<div style="color:#666;font-size:12px;text-align:center;padding:20px;">Scanning…</div>';
          try {
              const res = await api.getDevices();
              const devices = res?.devices || [];
              if (!devices.length) {
                  list.innerHTML = '<div style="color:#666;font-size:12px;text-align:center;padding:20px;">No devices found.</div>';
                  return;
              }
              list.innerHTML = '';
              devices.forEach(d => {
                  const row = document.createElement('div');
                  row.style.cssText = 'background:#222;border:1px solid #333;border-radius:4px;padding:10px;display:flex;justify-content:space-between;align-items:center;';
                  row.innerHTML = `<div><div style="color:#eee;font-size:13px;">${d.name || d.ip || 'Unknown'}</div><div style="color:#666;font-size:11px;">${d.ip || ''}</div></div>`;
                  list.appendChild(row);
              });
          } catch (e) {
              list.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;padding:20px;">Device not connected.</div>';
          }
      };
      // Auto-scan
      window._refreshDevices();
  }

  function initSettingsPanel() {
      // Snap setting
      const snapEl = document.getElementById('snap-value');
      if (snapEl) {
          snapEl.addEventListener('change', () => {
              const snap = parseInt(snapEl.value) || 1000;
              if (window.timelineEditor) window.timelineEditor._snapMs = snap;
              if (state.project?.config) state.project.config.snapMs = snap;
          });
      }
  }

  function initHauntSyncPanel() {
      // Initialize HauntSync panel with auth UI
      const panel = document.querySelector('.panel-hauntsync');
      if (!panel) return;
      
      // Add auth section if Firebase is available
      if (window.connectionDetector?.shouldUseFirebase() && window.firebaseAuth) {
          const authSection = document.createElement('div');
          authSection.id = 'studio-auth-section';
          authSection.style.marginBottom = '1rem';
          panel.insertBefore(authSection, panel.firstChild);
          
          updateStudioAuthUI();
          
          // Listen for auth changes
          window.firebaseAuth.onAuthStateChanged(() => {
              updateStudioAuthUI();
          });
      }
      
      // Add cloud projects section
      if (window.firebaseSync && window.firebaseSync.syncEnabled) {
          loadCloudProjectsForPanel();
      }
  }

  function updateStudioAuthUI() {
      const authSection = document.getElementById('studio-auth-section');
      if (!authSection) return;
      
      const user = window.firebaseAuth?.user || window.FirebaseConfig?.getCurrentUser();
      
      if (user) {
          authSection.innerHTML = `
              <div style="padding: 1rem; background-color: #333; border-radius: 5px; margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div>
                          <div style="font-weight: bold; color: var(--accent-color);">${user.email || user.displayName}</div>
                          <div style="font-size: 0.8rem; color: #aaa;">Signed in to HauntSync</div>
                      </div>
                      <button onclick="studioSignOut()" class="btn-secondary">Sign Out</button>
                  </div>
              </div>
          `;
      } else {
          authSection.innerHTML = `
              <div style="padding: 1rem; background-color: #333; border-radius: 5px; margin-bottom: 1rem;">
                  <h3 style="color: var(--accent-color); margin-top: 0;">HauntSync Cloud Sync</h3>
                  <p style="color: #aaa; margin-bottom: 1rem;">Sign in to sync your projects to the cloud and access them from any device.</p>
                  <div style="display: grid; gap: 1rem;">
                      <input type="email" id="studio-auth-email" placeholder="Email" style="padding: 0.75rem; background-color: #222; border: 1px solid var(--border-color); color: var(--text-color); border-radius: 5px;">
                      <input type="password" id="studio-auth-password" placeholder="Password" style="padding: 0.75rem; background-color: #222; border: 1px solid var(--border-color); color: var(--text-color); border-radius: 5px;">
                      <div style="display: flex; gap: 0.5rem;">
                          <button onclick="studioSignIn()" class="btn-primary" style="flex: 1;">Sign In</button>
                          <button onclick="studioSignUp()" class="btn-secondary" style="flex: 1;">Sign Up</button>
                      </div>
                      <button onclick="studioSignInWithGoogle()" class="btn-secondary" style="width: 100%;">Sign in with Google</button>
                  </div>
              </div>
          `;
      }
  }

  async function studioSignIn() {
      const email = document.getElementById('studio-auth-email')?.value;
      const password = document.getElementById('studio-auth-password')?.value;
      
      if (!email || !password) {
          log('Please enter email and password', 'WARN');
          return;
      }
      
      try {
          await window.firebaseAuth.signIn(email, password);
          log('Signed in successfully!', 'INFO');
      } catch (error) {
          log(`Sign in failed: ${error.message}`, 'ERR');
      }
  }

  async function studioSignUp() {
      const email = document.getElementById('studio-auth-email')?.value;
      const password = document.getElementById('studio-auth-password')?.value;
      const username = prompt('Enter a username:');
      
      if (!email || !password) {
          log('Please enter email and password', 'WARN');
          return;
      }
      
      if (!username) {
          log('Please enter a username', 'WARN');
          return;
      }
      
      try {
          await window.firebaseAuth.signUp(email, password, username);
          log('Account created successfully!', 'INFO');
      } catch (error) {
          log(`Sign up failed: ${error.message}`, 'ERR');
      }
  }

  async function studioSignInWithGoogle() {
      try {
          await window.firebaseAuth.signInWithGoogle();
          log('Signed in with Google!', 'INFO');
      } catch (error) {
          log(`Google sign in failed: ${error.message}`, 'ERR');
      }
  }

  async function studioSignOut() {
      try {
          await window.firebaseAuth.signOut();
          log('Signed out successfully', 'INFO');
      } catch (error) {
          log(`Sign out failed: ${error.message}`, 'ERR');
      }
  }

  async function loadCloudProjectsForPanel() {
      if (!window.firebaseSync || !window.firebaseSync.syncEnabled) return;
      
      try {
          const projects = await window.firebaseSync.loadProjects();
          const panel = document.querySelector('.panel-hauntsync');
          if (!panel) return;
          
          let projectsSection = document.getElementById('cloud-projects-section');
          if (!projectsSection) {
              projectsSection = document.createElement('div');
              projectsSection.id = 'cloud-projects-section';
              projectsSection.style.marginTop = '2rem';
              panel.appendChild(projectsSection);
          }
          
          if (projects && projects.length > 0) {
              projectsSection.innerHTML = `
                  <h3 style="color: var(--accent-color);">Cloud Projects</h3>
                  <div style="display: grid; gap: 0.5rem; margin-top: 1rem;">
                      ${projects.map(p => `
                          <div style="padding: 1rem; background-color: #333; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                              <div>
                                  <div style="font-weight: bold;">${p.project.name}</div>
                                  <div style="font-size: 0.8rem; color: #aaa;">Updated: ${new Date(p.project.updatedAt).toLocaleString()}</div>
                              </div>
                              <button onclick="loadCloudProject('${p.project.id}')" class="btn-primary">Load</button>
                          </div>
                      `).join('')}
                  </div>
              `;
          } else {
              projectsSection.innerHTML = `
                  <h3 style="color: var(--accent-color);">Cloud Projects</h3>
                  <p style="color: #aaa;">No projects in cloud. Save a project to sync it.</p>
              `;
          }
      } catch (error) {
          log(`Error loading cloud projects: ${error.message}`, 'ERR');
      }
  }

  window.loadCloudProject = async (projectId) => {
      const success = await window.loadProject(projectId, 'cloud');
      if (success) {
          log(`Project loaded: ${state.project.project.name}`, 'INFO');
          // Reload timeline if active
          if (document.querySelector('.timeline-editor')) {
              if (window.timelineEditor) {
                  window.timelineEditor.init();
              }
          }
      } else {
          log('Failed to load project', 'ERR');
      }
  };

  function updatePlaybackInfo() {
      const timeEl = document.getElementById('playhead-time');
      const totalEl = document.getElementById('total-time');
      if (timeEl) {
          const minutes = Math.floor(state.playhead / 60000);
          const seconds = Math.floor((state.playhead % 60000) / 1000);
          const ms = state.playhead % 1000;
          timeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
      }
  }

  // Update connection status
  async function updateConnectionStatus() {
      // Use connection detector if available
      if (window.connectionDetector) {
          await window.connectionDetector.detectMode();
          const mode = window.connectionDetector.mode;
          
          if (window.connectionDetector.isAPMode()) {
              state.connection = 'ap';
          } else if (window.connectionDetector.isOffline()) {
              state.connection = 'offline';
          } else {
              state.connection = 'lan';
          }
          
          const statusEl = document.querySelector('.connection-status');
          if (statusEl) {
              if (mode === 'ap') {
                  statusEl.className = 'connection-status ap';
                  statusEl.textContent = 'AP MODE (OFFLINE)';
              } else if (mode === 'offline') {
                  statusEl.className = 'connection-status offline';
                  statusEl.textContent = 'OFFLINE';
              } else {
                  statusEl.className = 'connection-status lan';
                  statusEl.textContent = 'ONLINE';
              }
          }
          return;
      }
      
      // Fallback to API check
      try {
          const status = await api.getStatus();
          state.connection = status.wifi_connected ? 'lan' : 'ap';
          const statusEl = document.querySelector('.connection-status');
          if (statusEl) {
              statusEl.className = `connection-status ${state.connection}`;
              statusEl.textContent = state.connection.toUpperCase();
          }
      } catch (error) {
          state.connection = 'offline';
          const statusEl = document.querySelector('.connection-status');
          if (statusEl) {
              statusEl.className = 'connection-status offline';
              statusEl.textContent = 'OFFLINE';
          }
      }
  }

  playButton.addEventListener('click', play);
  stopButton.addEventListener('click', stop);
  panicButton.addEventListener('click', panic);

  document.querySelectorAll('.sidebar-nav li').forEach(item => {
      item.addEventListener('click', () => {
          if (item.classList.contains('locked')) {
              log(`Access to ${item.dataset.panel} is locked for your current subscription tier.`, 'WARN');
              return;
          }
          document.querySelectorAll('.sidebar-nav li').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          loadPanel(item.dataset.panel);
      });
  });

  // Global window functions for panels
  window.loadPanel = loadPanel;
  window.appPlay = play;
  window.appStop = stop;
  window.appPause = () => {
      if (state.transport === 'playing') {
          state.transport = 'paused';
          cancelAnimationFrame(animationFrameId);
          log('Playback paused');
      }
  };
  window.api = api;
  window.state = state;
  
  // Timeline functions
  window.addTrack = (type, name) => {
      if (timelineEditor) {
          timelineEditor.addTrack(type, name);
          log(`Added ${type} track: ${name}`, 'INFO');
      }
  };
  
  window.openAudioBrowser = () => {
      if (audioBrowser) audioBrowser.open();
  };
  
  window.closeAudioBrowser = () => {
      if (audioBrowser) audioBrowser.close();
  };
  
  window.openDMXEditor = (clipId) => {
      if (dmxEditor) dmxEditor.open(clipId);
  };
  
  window.closeDMXEditor = () => {
      if (dmxEditor) dmxEditor.close();
  };
  
  window.openLEDStudio = (clipId) => {
      if (ledStudio) ledStudio.open(clipId);
  };
  
  window.closeLEDStudio = () => {
      if (ledStudio) ledStudio.close();
  };
  
  // WiFi connection helpers
  window.scanNetworks = async () => {
      log('Scanning WiFi networks...', 'NET');
      await loadPanel('connect');
  };
  
  window.connectToWiFi = async (ssid) => {
      const password = prompt(`Enter password for ${ssid}:`);
      if (password !== null) {
          try {
              await api.connectWiFi(ssid, password);
              log(`Connecting to ${ssid}...`, 'NET');
              setTimeout(() => updateConnectionStatus(), 3000);
          } catch (error) {
              log(`Failed to connect: ${error.message}`, 'ERR');
          }
      }
  };
  
  window.connectManual = async () => {
      const ssid = document.getElementById('manual-ssid')?.value;
      const password = document.getElementById('manual-password')?.value;
      if (ssid) {
          try {
              await api.connectWiFi(ssid, password);
              log(`Connecting to ${ssid}...`, 'NET');
              setTimeout(() => updateConnectionStatus(), 3000);
          } catch (error) {
              log(`Failed to connect: ${error.message}`, 'ERR');
          }
      }
  };
  
  window.checkDeviceStatus = async () => {
      try {
          const status = await api.getStatus();
          const display = document.getElementById('device-status-display');
          if (display) {
              display.innerHTML = `
                  <pre>${JSON.stringify(status, null, 2)}</pre>
              `;
          }
          log('Device status retrieved', 'NET');
      } catch (error) {
          log(`Failed to get status: ${error.message}`, 'ERR');
      }
  };
  
  // Toggle relay
  window.toggleRelay = async (out) => {
      try {
          const status = await api.getStatus();
          const currentState = status.relays?.[`out${out}`] || false;
          await api.setRelay(out, !currentState);
          const btn = document.getElementById(`relay${out}-btn`);
          if (btn) {
              btn.textContent = !currentState ? 'ON' : 'OFF';
          }
          log(`Relay OUT${out} ${!currentState ? 'ON' : 'OFF'}`, 'INFO');
      } catch (error) {
          log(`Failed to toggle relay: ${error.message}`, 'ERR');
      }
  };
  
  // Status LED helpers
  window.setStatusLED = async () => {
      const colorEl = document.getElementById('status-led-color');
      if (colorEl) {
          const hex = colorEl.value;
          const r = parseInt(hex.substr(1, 2), 16);
          const g = parseInt(hex.substr(3, 2), 16);
          const b = parseInt(hex.substr(5, 2), 16);
          try {
              await api.setStatusLED(r, g, b);
              log('Status LED color set', 'INFO');
          } catch (error) {
              log(`Failed to set status LED: ${error.message}`, 'ERR');
          }
      }
  };
  
  window.blinkStatusLED = async () => {
      const colorEl = document.getElementById('status-led-color');
      if (colorEl) {
          const hex = colorEl.value;
          const r = parseInt(hex.substr(1, 2), 16);
          const g = parseInt(hex.substr(3, 2), 16);
          const b = parseInt(hex.substr(5, 2), 16);
          try {
              await api.blinkStatusLED(r, g, b, 500);
              log('Status LED blinked', 'INFO');
          } catch (error) {
              log(`Failed to blink status LED: ${error.message}`, 'ERR');
          }
      }
  };
  
  window.statusLEDOff = async () => {
      try {
          await api.statusLEDOff();
          log('Status LED turned off', 'INFO');
      } catch (error) {
          log(`Failed to turn off status LED: ${error.message}`, 'ERR');
      }
  };
  
  // Audio helpers
  window.playAudio = async () => {
      const select = document.getElementById('audio-file-select');
      if (select && select.value) {
          try {
              await api.playAudio(select.value);
              log(`Playing audio: ${select.value}`, 'INFO');
          } catch (error) {
              log(`Failed to play audio: ${error.message}`, 'ERR');
          }
      }
  };
  
  window.stopAudio = async () => {
      try {
          await api.stopAudio();
          log('Audio stopped', 'INFO');
      } catch (error) {
          log(`Failed to stop audio: ${error.message}`, 'ERR');
      }
  };
  
  window.pauseAudio = async () => {
      try {
          await api.pauseAudio();
          log('Audio paused', 'INFO');
      } catch (error) {
          log(`Failed to pause audio: ${error.message}`, 'ERR');
      }
  };
  
  // Project save/load
  window.saveProject = async () => {
      if (!state.project) {
          log('No project to save', 'WARN');
          return;
      }
      
      const name = prompt('Enter project name:', state.project.project.name || 'Untitled Show');
      if (name) {
          try {
              state.project.project.name = name;
              state.project.project.updatedAt = new Date().toISOString();
              
              // Determine save strategy based on connection mode
              const isAPMode = window.connectionDetector?.isAPMode() || false;
              const shouldUseFirebase = window.connectionDetector?.shouldUseFirebase() || false;
              
              // Always try to save to SD card if connected to SUE
              try {
                  await api.saveProject(name + '.shdo', state.project);
                  log(`Project saved to SD: ${name}.shdo`, 'INFO');
              } catch (sdError) {
                  log(`SD card save failed (may be offline): ${sdError.message}`, 'WARN');
              }
              
              // Sync to Firebase if available and not in AP mode
              if (shouldUseFirebase && window.firebaseSync && window.firebaseSync.syncEnabled) {
                  try {
                      const syncResult = await window.firebaseSync.syncProject(state.project);
                      if (syncResult.success) {
                          log(`Project synced to cloud: ${name}`, 'INFO');
                      } else if (syncResult.queued) {
                          log(`Project queued for cloud sync: ${name}`, 'INFO');
                      }
                  } catch (firebaseError) {
                      log(`Cloud sync failed: ${firebaseError.message}`, 'WARN');
                      // Still save locally
                      localStorage.setItem(`project_${state.project.project.id}`, JSON.stringify(state.project));
                      log(`Project saved to local storage as backup`, 'INFO');
                  }
              } else {
                  // Save to localStorage as backup
                  localStorage.setItem(`project_${state.project.project.id}`, JSON.stringify(state.project));
                  if (isAPMode) {
                      log(`Project saved locally (AP mode - no cloud sync)`, 'INFO');
                  } else {
                      log(`Project saved locally (Firebase not available)`, 'INFO');
                  }
              }
              
              // Update UI
              const showNameEl = document.querySelector('.show-name');
              if (showNameEl) {
                  showNameEl.textContent = name;
              }
              
              log(`Project "${name}" saved successfully`, 'INFO');
          } catch (error) {
              log(`Failed to save project: ${error.message}`, 'ERR');
          }
      }
  };
  
  // Load project from cloud or local
  window.loadProject = async (projectId, source = 'auto') => {
      // source: 'auto', 'cloud', 'local', 'sd'
      
      if (source === 'auto') {
          // Try cloud first if available, then local, then SD
          const shouldUseFirebase = window.connectionDetector?.shouldUseFirebase() || false;
          
          if (shouldUseFirebase && window.firebaseSync) {
              const cloudProject = await window.firebaseSync.loadProject(projectId);
              if (cloudProject) {
                  state.project = cloudProject;
                  log(`Project loaded from cloud: ${cloudProject.project.name}`, 'INFO');
                  return true;
              }
          }
          
          // Try local storage
          const localProject = localStorage.getItem(`project_${projectId}`);
          if (localProject) {
              state.project = JSON.parse(localProject);
              log(`Project loaded from local storage: ${state.project.project.name}`, 'INFO');
              return true;
          }
          
          // Try SD card
          try {
              const sdProject = await api.loadProject(projectId + '.shdo');
              if (sdProject) {
                  state.project = sdProject;
                  log(`Project loaded from SD: ${sdProject.project.name}`, 'INFO');
                  return true;
              }
          } catch (error) {
              log(`SD load failed: ${error.message}`, 'WARN');
          }
          
          return false;
      } else if (source === 'cloud' && window.firebaseSync) {
          const cloudProject = await window.firebaseSync.loadProject(projectId);
          if (cloudProject) {
              state.project = cloudProject;
              return true;
          }
      } else if (source === 'local') {
          const localProject = localStorage.getItem(`project_${projectId}`);
          if (localProject) {
              state.project = JSON.parse(localProject);
              return true;
          }
      } else if (source === 'sd') {
          try {
              const sdProject = await api.loadProject(projectId + '.shdo');
              if (sdProject) {
                  state.project = sdProject;
                  return true;
              }
          } catch (error) {
              log(`SD load failed: ${error.message}`, 'ERR');
          }
      }
      
      return false;
  };
  
  // Save button handler
  document.querySelector('.save-icon')?.addEventListener('click', window.saveProject);
  
  // Export diagnostics
  window.exportDiagnostics = async () => {
      try {
          const status = await api.getStatus();
          const report = {
              timestamp: new Date().toISOString(),
              diagnostics: status
          };
          const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `diagnostics_${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          log('Diagnostics report exported', 'INFO');
      } catch (error) {
          log(`Failed to export diagnostics: ${error.message}`, 'ERR');
      }
  };

  // Terminal toggle function
  window.toggleTerminal = () => {
      const dock = document.querySelector('.bottom-dock');
      if (dock) {
          dock.classList.toggle('collapsed');
          const btn = document.querySelector('.toggle-terminal');
          if (btn) {
              btn.textContent = dock.classList.contains('collapsed') ? '▲' : '▼';
          }
      }
  };

  // Clip inspector update functions
  window.updateClipLabel = (clipId, value) => {
      if (state.project && state.project.clips) {
          const clip = state.project.clips.find(c => c.id === clipId);
          if (clip) {
              clip.label = value;
              const clipEl = document.querySelector(`[data-clip-id="${clipId}"]`);
              if (clipEl) {
                  clipEl.textContent = value || clip.type;
              }
              autosave();
              log(`Updated clip label: ${value}`, 'INFO');
          }
      }
  };

  window.updateClipStart = (clipId, value) => {
      if (state.project && state.project.clips) {
          const clip = state.project.clips.find(c => c.id === clipId);
          if (clip) {
              clip.startMs = value;
              const clipEl = document.querySelector(`[data-clip-id="${clipId}"]`);
              if (clipEl) {
                  clipEl.style.left = `${value / 10}px`;
              }
              autosave();
              log(`Updated clip start: ${value}ms`, 'INFO');
          }
      }
  };

  window.updateClipDuration = (clipId, value) => {
      if (state.project && state.project.clips) {
          const clip = state.project.clips.find(c => c.id === clipId);
          if (clip) {
              clip.durationMs = value;
              const clipEl = document.querySelector(`[data-clip-id="${clipId}"]`);
              if (clipEl) {
                  clipEl.style.width = `${value / 10}px`;
              }
              autosave();
              log(`Updated clip duration: ${value}ms`, 'INFO');
          }
      }
  };

  // Initial setup
  updateUIForTier();
  loadPanel('introduction');
  setInterval(updateClock, 1000);
  setInterval(updateConnectionStatus, 5000);
  startAutosave();
  
  log('Showduino Studio initialized');
  log(`User tier set to: ${state.user.subscription.toUpperCase()}`);
  
  // Sync subscription from localStorage if changed
  setInterval(() => {
      const currentSub = localStorage.getItem('hauntsync_subscription') || 'free';
      if (state.user.subscription !== currentSub) {
          state.user.subscription = currentSub;
          updateUIForTier();
          log(`Subscription updated to: ${currentSub.toUpperCase()}`);
      }
  }, 1000);
  
  // Initial connection check
  updateConnectionStatus();
});
