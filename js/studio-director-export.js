/* Studio -> legacy Director SD package. Offline export only; never loads or starts hardware. */
(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const MAX_CUES = 2048;
  const MAX_COMMAND = 63;
  const MAX_TIME = 0xffffffff;
  const json = value => JSON.stringify(value, null, 2) + '\n';
  function fail(message) { throw new Error(message); }
  function bounded(value, max, fallback) {
    const s = String(value || fallback || '');
    if (/[\x00-\x1f\x7f]/.test(s) || encoder.encode(s).length > max) fail('Invalid or too long metadata: ' + s);
    return s;
  }
  function safeId(value) {
    const id = String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
    if (!id || id.length > 63 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id)) fail('Project ID is not a safe Director folder name.');
    return id;
  }
  function checkTime(value, label) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_TIME) fail('Invalid millisecond time: ' + label);
    return value;
  }
  function build(shdo) {
    const validator = root.ShowduinoPackage;
    const compiler = root.ShowduinoDeploy;
    if (!validator?.validateShdo || !compiler?.compileShdoForStage) fail('Studio export components are not ready.');
    const validation = validator.validateShdo(shdo);
    if (!validation.valid) fail(validation.errors.join('\n'));
    const p = shdo.project || {};
    const id = safeId(p.id || p.name);
    if (shdo.metadata?.releaseStatus === 'AUTHORING_ONLY_PLAYBACK_DISABLED') fail('This production is marked authoring-only; resolve its playback restrictions before exporting.');
    const enabled = shdo.clips.filter(c => c.enabled !== false);
    if (!enabled.length) fail('No enabled cues to export.');
    // This first version deliberately uses the proven narrow PIXEL/AUDIO compiler.
    // Unsupported enabled cues must never be silently omitted.
    const supported = new Set(['pixel', 'audio']);
    let duration = checkTime(p.duration ?? 0, 'project duration');
    const audio = [];
    for (const clip of enabled) {
      if (shdo.tracks.some(t => t.id === clip.trackId && t.enabled === false)) fail(clip.name + ': enabled clip on a disabled track; resolve before export.');
      if (shdo.devices.some(d => d.id === (clip.action?.targetDeviceId || clip.targetDeviceId) && d.enabled === false)) fail(clip.name + ': target device is disabled.');
      const type = String(clip.action?.type || clip.type || '').toLowerCase();
      if (!supported.has(type)) fail(clip.name + ': unsupported in Director SD export (' + type + '). Disable explicitly or use another verified workflow.');
      const start = checkTime(clip.startMs, clip.name);
      const length = checkTime(clip.durationMs ?? 0, clip.name);
      duration = Math.max(duration, checkTime(start + length, clip.name));
      if (type === 'audio') audio.push({ start, end: start + length, length, name: clip.name });
    }
    audio.sort((a,b) => a.start-b.start);
    for (let i=1; i<audio.length; i++) {
      if (audio[i].start === audio[i-1].start || (audio[i-1].length && audio[i].start < audio[i-1].end)) {
        fail('Overlapping Audio Node clips: ' + audio[i-1].name + ' / ' + audio[i].name);
      }
    }
    if (!duration) fail('Set a non-zero production duration before exporting.');
    const plan = compiler.compileShdoForStage(shdo);
    if (!plan.ok) fail(plan.errors.join('\n') || 'Timeline compilation failed.');
    const timeline = plan.commands.map(c => {
      const time = checkTime(c.timeMs, c.source);
      const command = c.command;
      if (typeof command !== 'string' || !/^[\x20-\x7e]+$/.test(command) || command.length > MAX_COMMAND ||
          !/^(PIXEL:|AUDIO:NODE:)/.test(command)) fail('Unsupported or oversized Director command: ' + command);
      if (time > duration) fail('Compiled cue exceeds production duration: ' + c.source);
      return {time, command};
    });
    // Director playback ends at its last command, not at a UI-only duration.
    // Explicit Audio STOP prevents a loop continuing after SHOW:FINISHED.
    if (audio.length && !timeline.some(c => c.time === duration && c.command === 'AUDIO:NODE:STOP')) {
      timeline.push({time: duration, command:'AUDIO:NODE:STOP'});
    }
    timeline.push({time:duration,command:'INTERNAL:LOG:show-end:complete'});
    timeline.sort((a,b) => a.time-b.time);
    if (timeline.length > MAX_CUES) fail('P4 command limit exceeded (2048, including end commands).');
    const date = new Date().toISOString().slice(0,10);
    const show = {schemaVersion:1,id,
      name:bounded(p.name,63,id),description:bounded(p.description,127,''),
      author:bounded(p.author,47,'Showduino'),version:bounded(p.version,15,'1.0.0'),
      durationSeconds:Math.ceil(duration/1000),cueCount:timeline.length,
      created:bounded(String(p.createdAt || date).slice(0,10),31,date),
      modified:date,startCue:1,stageControllerRequired:true};
    const files = {
      [id+'.shdo']:json(shdo),
      'show.json':json(show),
      'cues.json':json({schemaVersion:1,cues:timeline}),
      'timeline.json':json({schemaVersion:1,timeline})
    };
    return {id,files,show,warnings:[...(plan.warnings || []),
      ...(shdo.clips.length!==enabled.length ? [(shdo.clips.length-enabled.length)+' explicitly disabled clips omitted from runtime.'] : []),
      'Audio assets are not included; confirm paths on the Audio Node. Pixel final states follow authored cues; export does not override emergency policy.']};
  }
  function crc32(bytes) {
    let c=0xffffffff;
    for (const b of bytes) {
      c^=b;
      for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0);
    }
    return (c^0xffffffff)>>>0;
  }
  // Standards-compliant ZIP STORE (no dependencies, no network). UTF-8 names.
  function zip(files) {
    const parts=[], directory=[];
    let offset=0, size=0;
    function header(n) { const bytes=new Uint8Array(n); return {bytes,v:new DataView(bytes.buffer)}; }
    for (const [filename, value] of Object.entries(files)) {
      const name=encoder.encode(filename), data=encoder.encode(value), crc=crc32(data);
      const local=header(30), central=header(46);
      const l=local.v, c=central.v;
      l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(6,0x800,true);
      l.setUint16(12,33,true); l.setUint32(14,crc,true); l.setUint32(18,data.length,true); l.setUint32(22,data.length,true); l.setUint16(26,name.length,true);
      c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x800,true);
      c.setUint16(14,33,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true);
      c.setUint16(28,name.length,true); c.setUint32(42,offset,true);
      parts.push(local.bytes,name,data); directory.push(central.bytes,name);
      offset+=30+name.length+data.length; size+=46+name.length;
    }
    const end=header(22), e=end.v, count=Object.keys(files).length;
    e.setUint32(0,0x06054b50,true); e.setUint16(8,count,true); e.setUint16(10,count,true); e.setUint32(12,size,true); e.setUint32(16,offset,true);
    const result=new Uint8Array(offset+size+22);
    let pos=0;
    for (const part of [...parts,...directory,end.bytes]) { result.set(part,pos); pos+=part.length; }
    return result;
  }
  async function exportCurrent() {
    if (!root.ShowduinoProjects?.saveCurrentProject) fail('Studio is still starting.');
    const project=await root.ShowduinoProjects.saveCurrentProject({cloud:false});
    const shdo=root.ShowduinoPackage.toShdo(project);
    const result=build(shdo);
    const summary='Director SD package: '+result.show.cueCount+' commands, '+result.show.durationSeconds+' seconds.\nExtract into /showduino/shows/packages/'+result.id+'/ on the Director SD card.\n\n'+result.warnings.join('\n');
    if (!root.confirm(summary+'\n\nExport ZIP?')) return null;
    const url=URL.createObjectURL(new Blob([zip(result.files)],{type:'application/zip'}));
    const a=document.createElement('a'); a.href=url; a.download=result.id+'-director-sd.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    return result;
  }
  root.ShowduinoDirectorExport=Object.freeze({build,zip,exportCurrent});
})(typeof window!=='undefined'?window:globalThis);
