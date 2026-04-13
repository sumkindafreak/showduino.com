// Connection Detector
// Determines whether Showduino is reachable in AP mode, LAN mode, or offline

class ConnectionDetector {
  constructor() {
    this.mode = 'offline'; // 'ap' | 'lan' | 'offline'
    this._monitorInterval = null;
    this._listeners = [];
    this._probeURL = null;
  }

  async detectMode() {
    const host = window.location.hostname;

    // If served from 192.168.4.x assume AP mode
    if (host === '192.168.4.1' || host.startsWith('192.168.4.')) {
      this.mode = 'ap';
      this._probeURL = `http://${host}/status`;
      this._notify();
      return 'ap';
    }

    // Try to reach the Showduino on its default AP address
    const apReachable = await this._probe('http://192.168.4.1/status', 2000);
    if (apReachable) {
      this.mode = 'ap';
      this._probeURL = 'http://192.168.4.1/status';
      this._notify();
      return 'ap';
    }

    // Try LAN detection via mDNS hostname or broadcast scan placeholder
    const lanReachable = await this._probeLAN();
    if (lanReachable) {
      this.mode = 'lan';
      this._notify();
      return 'lan';
    }

    this.mode = 'offline';
    this._notify();
    return 'offline';
  }

  async _probe(url, timeoutMs = 3000) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);
      return resp.ok;
    } catch (_) {
      return false;
    }
  }

  async _probeLAN() {
    // Try showduino.local mDNS
    const mdnsReachable = await this._probe('http://showduino.local/status', 2000);
    if (mdnsReachable) {
      this._probeURL = 'http://showduino.local/status';
      return true;
    }
    return false;
  }

  isAPMode()         { return this.mode === 'ap'; }
  isOffline()        { return this.mode === 'offline'; }
  shouldUseFirebase() { return this.mode === 'offline' || this.mode === 'lan'; }

  onModeChange(fn) { this._listeners.push(fn); }
  _notify() { this._listeners.forEach(fn => { try { fn(this.mode); } catch (_) {} }); }

  startMonitoring(intervalMs = 10000) {
    this.stopMonitoring();
    this.detectMode();
    this._monitorInterval = setInterval(() => this.detectMode(), intervalMs);
  }

  stopMonitoring() {
    if (this._monitorInterval) {
      clearInterval(this._monitorInterval);
      this._monitorInterval = null;
    }
  }

  getModeLabel() {
    switch (this.mode) {
      case 'ap':      return 'AP Mode (Direct)';
      case 'lan':     return 'LAN Mode (Network)';
      case 'offline': return 'Offline';
      default:        return 'Unknown';
    }
  }

  getModeColor() {
    switch (this.mode) {
      case 'ap':      return '#00ff88';
      case 'lan':     return '#00aaff';
      case 'offline': return '#ff4444';
      default:        return '#888';
    }
  }
}

window.ConnectionDetector = ConnectionDetector;
