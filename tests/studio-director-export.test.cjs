/* Director SD package contract, compiler integration and ZIP integrity. */
const fs=require('fs'), vm=require('vm'), assert=require('assert');
global.window=global;
global.crypto=require('crypto').webcrypto;
global.location={protocol:'https:',origin:'https://show-duino.com'};
global.document={addEventListener(){},querySelector(){return null;},getElementById(){return null;}};
global.fetch=async()=>{throw Error('Export must never use network');};
const load=p=>vm.runInThisContext(fs.readFileSync(p,'utf8'),{filename:p});
['js/shdo_model.js','js/studio-package.js','js/showduino-pixel-authoring.js','js/showduino-mosfet-authoring.js','js/studio-deploy.js','js/studio-director-export.js'].forEach(load);
const p=SHDOModel.createProject('Awakening');
p.project.duration=180000;
p.assets={}; p.scenes=[];p.globalSettings={};p.metadata={};
const t=SHDOModel.createTrack('audio','Audio',0);
const a=SHDOModel.createClip(t.id,'audio',1000,20000,'Boot');
a.routing.nodeId='audio-1';a.params.file='booting_up.wav';
const px=SHDOModel.createTrack('pixel','Pixels',1);
const c=SHDOModel.createClip(px.id,'pixel',1000,5000,'Glow');
c.routing.nodeId='p4-local';c.params.startPixel=0;c.params.length=7;c.params.effect='SOLID';
const mt=SHDOModel.createTrack('mosfet','Powered outputs',2);
function powered(name,start,duration,out,params,node='MOSFET-01'){
  const clip=SHDOModel.createClip(mt.id,'mosfet',start,duration,name);
  clip.routing={nodeId:node,output:out};
  Object.assign(clip.params,{out,duty:50,mode:'hold'},params);
  return clip;
}
const hold=powered('Output hold',30000,2000,'out1',{});
const pulse=powered('Output pulse',31000,1000,'out2',{mode:'pulse',pulseMs:500,duty:75});
const fade=powered('Output fade',35000,3000,'out3',{mode:'fade',fadeInMs:500,fadeOutMs:1000});
const off=powered('Inactive output',40000,1000,'out4',{state:false},'MOSFET-02');
p.tracks.push(t,px,mt);p.clips.push(a,c,hold,pulse,fade,off);
const shdo=ShowduinoPackage.toShdo(p);
const result=ShowduinoDirectorExport.build(shdo);
assert.equal(Object.keys(result.files).length,4);
const show=JSON.parse(result.files['show.json']);
const cues=JSON.parse(result.files['cues.json']).cues;
const timeline=JSON.parse(result.files['timeline.json']).timeline;
assert.deepStrictEqual(cues,timeline);
assert.equal(show.durationSeconds,180);
assert.equal(show.cueCount,timeline.length);
assert.equal(show.id,result.id);
assert.deepStrictEqual(JSON.parse(result.files[result.id+'.shdo']),shdo);
assert.ok(timeline.some(c=>c.command==='AUDIO:NODE:PLAY:booting_up.wav'));
assert.ok(timeline.some(c=>c.command.startsWith('PIXEL:')));
for(const [time,command] of [
  [30000,'MOSFET:NODE:MOSFET-01:OUT:1:LEVEL:50'],
  [32000,'MOSFET:NODE:MOSFET-01:OUT:1:OFF'],
  [31000,'MOSFET:NODE:MOSFET-01:OUT:2:PULSE:75:500'],
  [32000,'MOSFET:NODE:MOSFET-01:OUT:2:OFF'],
  [35000,'MOSFET:NODE:MOSFET-01:OUT:3:FADE:50:500'],
  [37000,'MOSFET:NODE:MOSFET-01:OUT:3:FADE:0:1000'],
  [40000,'MOSFET:NODE:MOSFET-02:OUT:4:OFF'],
  [180000,'MOSFET:NODE:MOSFET-01:OUT:1:OFF'],
  [180000,'MOSFET:NODE:MOSFET-01:OUT:2:OFF'],
  [180000,'MOSFET:NODE:MOSFET-01:OUT:3:OFF'],
  [180000,'MOSFET:NODE:MOSFET-02:OUT:4:OFF']
]) assert.ok(timeline.some(c=>c.time===time&&c.command===command),command);
assert.ok(!ShowduinoDeploy.uploadEnvelopeAllowed('SHOW:TL:C:30000:MOSFET:NODE:MOSFET-01:OUT:1:LEVEL:50'));
assert.deepStrictEqual(timeline.at(-1),{time:180000,command:'INTERNAL:LOG:show-end:complete'});
assert.ok(timeline.some(c=>c.time===180000&&c.command==='AUDIO:NODE:STOP'));
assert.ok(timeline.every((c,i)=>!i||c.time>=timeline[i-1].time));
const archive=Buffer.from(ShowduinoDirectorExport.zip(result.files));
let pos=0;
for(const [name,value] of Object.entries(result.files)){
  assert.equal(archive.readUInt32LE(pos),0x04034b50);
  const len=archive.readUInt32LE(pos+18),nl=archive.readUInt16LE(pos+26);
  assert.equal(archive.subarray(pos+30,pos+30+nl).toString(),name);
  assert.equal(archive.subarray(pos+30+nl,pos+30+nl+len).toString(),value);
  pos+=30+nl+len;
}
assert.equal(archive.readUInt32LE(pos),0x02014b50);
assert.equal(archive.readUInt32LE(archive.length-22),0x06054b50);
assert.equal(archive.readUInt16LE(archive.length-12),4);
const clone=()=>JSON.parse(JSON.stringify(shdo));
let bad=clone();bad.clips[0].action.type='lamp';assert.throws(()=>ShowduinoDirectorExport.build(bad),/unsupported/);
const mos=doc=>doc.clips.find(c=>c.action.type==='mosfet');
bad=clone();mos(bad).action.params.out='out5';assert.throws(()=>ShowduinoDirectorExport.build(bad),/OUT1/);
bad=clone();mos(bad).action.params.duty=101;assert.throws(()=>ShowduinoDirectorExport.build(bad),/level/);
bad=clone();mos(bad).action.params.safeOff=false;assert.throws(()=>ShowduinoDirectorExport.build(bad),/safe OFF/);
bad=clone();mos(bad).durationMs=0;assert.throws(()=>ShowduinoDirectorExport.build(bad),/positive duration/);
bad=clone();mos(bad).action.targetDeviceId=bad.clips[0].action.targetDeviceId;assert.throws(()=>ShowduinoDirectorExport.build(bad),/bound MOSFET/);
bad=clone();mos(bad).action.params.mode='pulse';mos(bad).action.params.pulseMs=3000;assert.throws(()=>ShowduinoDirectorExport.build(bad),/pulse must/);
bad=clone();mos(bad).action.params.mode='fade';mos(bad).action.params.fadeInMs=1500;mos(bad).action.params.fadeOutMs=1500;assert.throws(()=>ShowduinoDirectorExport.build(bad),/fades must/);
bad=clone();bad.clips.push({...mos(bad),id:'mos-overlap',startMs:31000});assert.throws(()=>ShowduinoDirectorExport.build(bad),/Overlapping MOSFET/);
bad=clone();bad.clips.push({...mos(bad),id:'mos-adjacent',startMs:32000});assert.doesNotThrow(()=>ShowduinoDirectorExport.build(bad));
bad=clone();bad.clips[0].startMs=-1;assert.throws(()=>ShowduinoDirectorExport.build(bad),/Invalid millisecond/);
bad=clone();bad.metadata.releaseStatus='AUTHORING_ONLY_PLAYBACK_DISABLED';assert.throws(()=>ShowduinoDirectorExport.build(bad),/authoring-only/);
bad=clone();bad.clips.forEach(c=>c.enabled=false);assert.throws(()=>ShowduinoDirectorExport.build(bad),/No enabled/);
bad=clone();bad.clips.push({...bad.clips[0],id:'overlap',startMs:2000});assert.throws(()=>ShowduinoDirectorExport.build(bad),/Overlapping/);
console.log('Director SD export contract passed');
