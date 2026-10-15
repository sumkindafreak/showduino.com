// SHDO community share sanitisation — node tests/hauntsync-share.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ids=['1e23b33a-7bd2-4d01-b191-85d1f3bf8010','55e9fe9f-d79a-49b0-a0b7-21e69ed33a52'];
let cursor=0;
const context={window:{},TextEncoder,Date,console,crypto:{randomUUID(){return ids[cursor++%ids.length]}}};
context.globalThis=context;
vm.runInNewContext(fs.readFileSync('js/hauntsync-share-model.js','utf8'),context);
const model=context.window.HauntSyncShare;

const source={
  schema:'showduino-production-v2',
  project:{id:'personal-id',name:'Private Haunt',description:'Somewhere private',duration:120000},
  architecture:{runtimeAuthority:'esp32-p4-show-engine',nodeAddressing:'logical-device-id'},
  safety:{runtimeAuthority:'esp32-p4-show-engine',policy:'firmware-authoritative',emergency:{
    stopTimeline:true,pixelOverride:'all-white',requiresManualClear:true,autoResume:false,productionCannotDisable:true
  }},
  package:{format:'showduino-production',version:2},
  devices:[{id:'my-actual-hardware',name:'Kitchen pixels',type:'pixel-node',binding:{
    route:'pixel-node',nodeId:'PIXEL-HOME',ipAddress:'192.168.1.77',
    mac:'AA:BB:CC:DD:EE:FF'
  },metadata:{serial:'serial-private'}}],
  clips:[{id:'cue-1',trackId:'track1',sceneId:'scene1',cueId:'scene1-cue',name:'Lightning',type:'pixel',
    startMs:0,durationMs:5000,action:{type:'pixel',targetDeviceId:'my-actual-hardware',
      value:'Home show',params:{effect:'flicker',speed:5,ssid:'mywifi',token:'secret',
        path:'/private/audio.wav',notes:'http://home.local'}}}],
  tracks:[{id:'track1',name:'Pixel track',type:'pixel',targetDeviceId:'my-actual-hardware'}],
  scenes:[{id:'scene1',name:'Horror opening',description:'Personal notes',order:0,
    cues:[{id:'scene1-cue',name:'Startle',notes:'Don’t share',trigger:'Timeline',clipIds:['cue-1']}]}],
  markers:[],assets:[{path:'/home/private.wav'}],
  metadata:{email:'person@example.com'},globalSettings:{wifiPassword:'secret'},
};
const next=model.prepare(JSON.stringify(source),'Public template','A general lighting cue');
assert.equal(next.schema,source.schema);
assert.equal(next.project.id,ids[0]);
assert.equal(next.project.name,'Public template');
assert.equal(next.devices[0].binding.nodeId,undefined);
assert.equal(next.devices[0].name,'pixel-node 1');
assert.equal(next.devices[0].binding.route,'pixel-node');
assert.equal(next.clips[0].targetDeviceId,'shared-device-1');
assert.equal(next.tracks[0].targetDeviceId,'shared-device-1');
assert.equal(next.clips[0].action.params.effect,'flicker');
assert.equal(next.clips[0].action.params.ssid,undefined);
assert.equal(next.clips[0].action.params.path,undefined);
assert.equal(next.clips[0].action.params.notes,'');
assert.equal(next.clips[0].action.value,'');
assert.equal(next.scenes[0].cues[0].notes,'');
assert.equal(next.assets.length,0);
assert.equal(next.metadata.communityTemplate,true);
assert.equal(next.metadata.autoRun,false);
assert.deepEqual(Object.keys(next.globalSettings),[]);
assert.equal(source.devices[0].binding.nodeId,'PIXEL-HOME','Original must stay unchanged.');
assert.equal(model.validate(next),true);

const downloaded=model.cloneDownload(next);
assert.equal(downloaded.project.id,ids[1]);
assert.equal(next.project.id,ids[0],'Download must not replace source ID.');
assert.equal(downloaded.safety.emergency.requiresManualClear,true);

const wrong=JSON.parse(JSON.stringify(source));wrong.safety.emergency.autoResume=true;
assert.throws(()=>model.prepare(JSON.stringify(wrong),'Example',''),/Emergency safety/);
assert.throws(()=>model.prepare(JSON.stringify({schema:'wrong'}),'Example',''),/SHDO v2/);
assert.throws(()=>model.prepare(JSON.stringify(source),'x',''),/Title/);
assert.throws(()=>model.prepare('{broken','Template',''),/not valid JSON/);
assert.throws(()=>model.prepare(' '.repeat(513*1024),'Template',''),/512 KB/);

const migration=fs.readFileSync('supabase/hauntsync_shared_shows_v1.sql','utf8');
const html=fs.readFileSync('community.html','utf8');
const dash=fs.readFileSync('hauntsync.html','utf8');
const lib=fs.readFileSync('js/hauntsync-library.js','utf8');
assert.match(migration,/enable row level security/);
assert.match(migration,/shared_shows_publish_own/);
assert.match(migration,/shared_shows_remove_own/);
assert.match(migration,/octet_length\(document::text\)/);
assert.match(html,/id="hs-share-consent"/);
assert.match(dash,/community.html/);
assert.match(lib,/cloneDownload/);
assert.doesNotMatch(lib,/importProject\(/,'Sharing must never auto-import.');
console.log('PASS: public SHDO templates sanitise routing, reject invalid safety, clone identity, and keep manual import.');
