// SHDO Model - Showduino Project Data Model
// Static factory methods for creating project data structures

class SHDOModel {
  static _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  static createProject(name = 'Untitled Show') {
    return {
      project: {
        id: SHDOModel._uuid(),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bpm: 120,
        duration: 300000
      },
      tracks: [],
      clips: [],
      markers: [],
      config: {
        snapEnabled: true,
        snapMs: 1000,
        gridEnabled: true,
        zoom: 0.1
      }
    };
  }

  static createTrack(type = 'audio', name = null, order = 0) {
    const colors = {
      mixed: '#7f8c98', audio: '#00aaff', fx: '#aa00ff', relay: '#ff8800', lighting: '#ffff00',
      pixel: '#00ffcc', dmx: '#ff0066', prop: '#33cc33', trigger: '#ff3333'
    };
    return {
      id: SHDOModel._uuid(),
      type,
      name: name || (type.charAt(0).toUpperCase() + type.slice(1) + ' Track'),
      muted: false,
      visible: true,
      locked: false,
      color: colors[type] || '#888888',
      order
    };
  }

  static createClip(trackId, type = 'audio', startMs = 0, durationMs = 5000, label = null) {
    const colors = {
      audio: '#00aaff', fx: '#aa00ff', relay: '#ff8800', lighting: '#ffff00',
      pixel: '#00ffcc', dmx: '#ff0066', prop: '#33cc33', trigger: '#ff3333'
    };
    return {
      id: SHDOModel._uuid(),
      trackId,
      type,
      startMs,
      durationMs,
      label: label || (type.charAt(0).toUpperCase() + type.slice(1)),
      color: colors[type] || '#00ffcc',
      params: SHDOModel._defaultParams(type)
    };
  }

  static createMarker(timeMs = 0, label = 'Marker') {
    return {
      id: SHDOModel._uuid(),
      timeMs,
      label,
      color: '#ffff00'
    };
  }

  static _defaultParams(type) {
    switch (type) {
      case 'audio':    return { file: '', volume: 100, loop: false, fadeIn: 0, fadeOut: 0 };
      case 'fx':       return { effect: 'none', intensity: 100 };
      case 'relay':    return { out: 'out1', state: true, pulseMs: 0 };
      case 'lighting': return { r: 255, g: 255, b: 255, brightness: 255, effect: 'solid' };
      case 'pixel':    return { r: 255, g: 255, b: 255, brightness: 255, effect: 'solid', line: 1 };
      case 'dmx':      return { channels: {} };
      case 'prop':     return { action: 'trigger', value: 1 };
      case 'trigger':  return { event: '', payload: '' };
      default:         return {};
    }
  }

  static validate(project) {
    if (!project || !project.project || !project.project.id) return false;
    if (!Array.isArray(project.tracks)) return false;
    if (!Array.isArray(project.clips)) return false;
    if (!Array.isArray(project.markers)) return false;
    return true;
  }

  static migrate(project) {
    if (!project.config) project.config = {};
    if (!project.markers) project.markers = [];
    if (typeof project.config.snapMs === 'undefined') project.config.snapMs = 1000;
    if (typeof project.config.zoom === 'undefined') project.config.zoom = 0.1;
    project.project.updatedAt = new Date().toISOString();
    return project;
  }
}

window.SHDOModel = SHDOModel;
