// Owner-scoped avatar upload tests. Run: node tests/hauntsync-avatar.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const userId = '0e0a9e23-7a8f-4f26-9d7b-d6f6c8391c18';
const bucketUrl = 'https://storage.example/storage/v1/object/public/hauntsync-avatars/';
const newUuid = '54c82e95-7f31-4e15-82a2-829d403970b5';

function makeFixture() {
  let activeUser = { id: userId };
  let stored = { id:userId, display_name:'Studio Creator', avatar_url:null };
  const uploads = [], removes = [], updates = [];
  let failProfileUpdate = false;
  const storage = {
    async upload(path, file, options) {
      uploads.push({path,file,options});
      return {error:null};
    },
    async remove(paths) {
      removes.push(...paths);
      return {data:{},error:null};
    },
    getPublicUrl(path) { return {data:{publicUrl:bucketUrl+path}}; }
  };
  const db = {
    auth:{ async getUser(){return{data:{user:activeUser},error:null}} },
    storage:{from(bucket){assert.equal(bucket,'hauntsync-avatars');return storage}},
    from(table) {
      assert.equal(table,'profiles');
      return {
        select() {
          return { eq(field,id) {
            assert.equal(field,'id');assert.equal(id,userId);
            return { async maybeSingle(){return{data:stored,error:null}} };
          } };
        },
        upsert(){ throw Error('Existing profile should not be overwritten'); },
        update(changes) {
          return { eq(field,id) {
            assert.equal(field,'id');assert.equal(id,userId);
            return { select() {return{ async single() {
              if (failProfileUpdate) return{data:null,error:new Error('DB unavailable')};
              updates.push(changes);
              stored = {...stored,...changes};
              return {data:stored,error:null};
            } }} };
          } };
        }
      };
    }
  };
  const win={
    location:{ hostname:'show-duino.com' },
    SHOWDUINO_CONFIG:{
      features:{supabase:true,authentication:true},
      supabase:{url:'https://storage.example',publishableKey:'sb_publishable_test'}
    },
    supabase:{createClient(){return db}},
    crypto:{randomUUID(){return newUuid}}
  };
  vm.runInNewContext(fs.readFileSync('js/cloud/supabase-service.js','utf8'),{window:win,URL,console,Date});
  return{
    api:win.ShowduinoSupabase, uploads,removes,updates,
    setActiveUser(user){activeUser=user},
    setDbFail(value){failProfileUpdate=value},
    getProfile(){return stored},
    setProfile(next){stored=next}
  };
}

(async()=>{
  const f=makeFixture();
  const valid={type:'image/webp',size:118000};
  await assert.rejects(f.api.uploadCreatorAvatar({type:'image/svg+xml',size:900}),/JPG|PNG|WebP/i);
  await assert.rejects(f.api.uploadCreatorAvatar({type:'image/png',size:3*1024*1024}),/2 MB/i);
  assert.equal(f.uploads.length,0);

  const first=await f.api.uploadCreatorAvatar(valid);
  const ownPath=userId+'/avatar-'+newUuid+'.webp';
  assert.equal(f.uploads[0].path,ownPath);
  assert.equal(f.uploads[0].options.upsert,false);
  assert.equal(first.avatar_url,bucketUrl+ownPath);
  assert.equal(f.removes.length,0);

  // An old owned photo is removed after the new URL is saved.
  const second=await f.api.uploadCreatorAvatar({type:'image/jpeg',size:400});
  assert.equal(second.avatar_url,bucketUrl+userId+'/avatar-'+newUuid+'.jpg');
  assert.ok(f.removes.includes(ownPath));

  // Never delete images pointing at another member.
  f.setProfile({...f.getProfile(),avatar_url:bucketUrl+'someone-else/avatar-'+newUuid+'.webp'});
  const before=f.removes.length;
  await f.api.removeCreatorAvatar();
  assert.equal(f.removes.length,before);
  assert.equal(f.getProfile().avatar_url,null);

  // If a database update fails, remove only the new temporary upload.
  f.setDbFail(true);
  await assert.rejects(f.api.uploadCreatorAvatar(valid),/DB unavailable/);
  assert.equal(f.getProfile().avatar_url,null);
  assert.equal(f.removes.at(-1),ownPath);

  f.setDbFail(false);
  f.setActiveUser(null);
  await assert.rejects(f.api.uploadCreatorAvatar(valid),/Sign in/);
  await assert.rejects(f.api.removeCreatorAvatar(),/Sign in/);

  const page=fs.readFileSync('profile.html','utf8');
  const client=fs.readFileSync('js/hauntsync-profile.js','utf8');
  const sql=fs.readFileSync('supabase/hauntsync_avatar_storage_v1.sql','utf8');
  const dashboard=fs.readFileSync('js/hauntsync-dashboard.js','utf8');
  assert.match(page,/id="hs-profile-file"/);
  assert.match(page,/id="hs-profile-photo-remove"/);
  assert.match(client,/createObjectURL/);
  assert.match(client,/revokeObjectURL/);
  assert.match(sql,/storage\.foldername\(name\)/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/allowed_mime_types/);
  assert.match(dashboard,/showWorkspaceAvatar/);
  console.log('PASS: HauntSync avatar validation, upload, replacement, removal, rollback and owner scope.');
})().catch(error=>{console.error(error);process.exitCode=1});
