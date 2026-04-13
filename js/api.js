// Showduino API Client
// Communicates with Showduino hardware over HTTP (AP or LAN mode)
// Falls back to mock responses when offline

class ShowduinoAPI {
  constructor(baseURL = null) {
    this._baseURL = baseURL || this._detectBaseURL();
    this._timeout = 5000;
    this._mockMode = false;
  }

  _detectBaseURL() {
    const host = window.location.hostname;
    if (host === '192.168.4.1' || host.startsWith('192.168.4.')) {
      return `http://${host}`;
    }
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== 'showduino.com' && !host.endsWith('.showduino.com') && !host.endsWith('.github.io') && host !== 'github.com') {
      return `http://${host}`;
    }
    return 'http://192.168.4.1';
  }

  setBaseURL(url) { this._baseURL = url; }
  setMockMode(enabled) { this._mockMode = enabled; }

  async _request(method, path, body = null) {
    if (this._mockMode) return this._mockResponse(method, path, body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);
    try {
      const opts = {
        method,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) opts.body = JSON.stringify(body);
      const resp = await fetch(this._baseURL + path, opts);
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      return await resp.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('Request timed out');
      throw err;
    }
  }

  _mockResponse(method, path, body) {
    if (path === '/status') {
      return Promise.resolve({
        wifi_connected: false, ip: '192.168.4.1', mac: 'AA:BB:CC:DD:EE:FF',
        firmware: '1.0.0', uptime: 0, heap: 200000, ssid: '',
        relays: { out1: false, out2: false },
        audio: { playing: false, file: '', volume: 80 },
        sd_card: true
      });
    }
    if (path === '/audio/list') return Promise.resolve({ files: [] });
    if (path === '/devices') return Promise.resolve({ devices: [] });
    return Promise.resolve({ ok: true });
  }

  // Status
  async getStatus() { return this._request('GET', '/status'); }

  // LED Lines
  async clearLEDLine(line) {
    return this._request('POST', '/led/clear', { line });
  }
  async setLEDLine(line, r, g, b, brightness = 255) {
    return this._request('POST', '/led/set', { line, r, g, b, brightness });
  }
  async setStatusLED(r, g, b) {
    return this._request('POST', '/led/status', { r, g, b });
  }
  async blinkStatusLED(r, g, b, interval = 500) {
    return this._request('POST', '/led/blink', { r, g, b, interval });
  }
  async statusLEDOff() {
    return this._request('POST', '/led/off', {});
  }

  // Relays
  async setRelay(out, state) {
    return this._request('POST', '/relay/set', { out, state });
  }

  // Audio
  async listAudioFiles() { return this._request('GET', '/audio/list'); }
  async playAudio(file) { return this._request('POST', '/audio/play', { file }); }
  async stopAudio() { return this._request('POST', '/audio/stop', {}); }
  async pauseAudio() { return this._request('POST', '/audio/pause', {}); }
  async resumeAudio() { return this._request('POST', '/audio/resume', {}); }
  async setAudioVolume(value) { return this._request('POST', '/audio/volume', { volume: value }); }
  async uploadAudioFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch(this._baseURL + '/audio/upload', {
        method: 'POST', body: fd, signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // WiFi
  async connectWiFi(ssid, password) {
    return this._request('POST', '/wifi/connect', { ssid, password });
  }

  // Projects on SD card
  async saveProject(filename, project) {
    return this._request('POST', '/project/save', { filename, data: JSON.stringify(project) });
  }
  async loadProject(filename) {
    const resp = await this._request('GET', `/project/load?file=${encodeURIComponent(filename)}`);
    if (typeof resp === 'string') return JSON.parse(resp);
    return resp;
  }

  // Devices
  async getDevices() { return this._request('GET', '/devices'); }

  // DMX
  async setDMXChannels(channels) {
    return this._request('POST', '/dmx/set', { channels });
  }
}

window.ShowduinoAPI = ShowduinoAPI;
