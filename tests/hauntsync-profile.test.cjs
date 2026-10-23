// HauntSync creator profiles — run with Node 22: node tests/hauntsync-profile.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const user = { id:'0e0a9e23-7a8f-4f26-9d7b-d6f6c8391c18', user_metadata:{ display_name:'Original Name' }, email:'creator@example.test' };
  let currentUser = user;
  let profile = { id:user.id, display_name:'Edited Name', username:'tester', bio:'Working effects', creator_focus:'Show Control', website_url:null };
  const mutations = [];
  const queries = [];

  const auth = {
    async getUser() { return { data:{ user:currentUser }, error:null }; },
    async signInWithPassword() { return { data:{ user:currentUser }, error:null }; }
  };

  const service = {
    auth,
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select(fields) {
          const expected = fields;
          return {
            eq(field, value) {
              assert.equal(field,'id'); assert.equal(value,user.id);
              queries.push({kind:'select',columns:expected,owner:value});
              return {
                async maybeSingle() { return {data:profile,error:null}; }
              };
            }
          };
        },
        update(values) {
          return {
            eq(field,value) {
              assert.equal(field,'id');
              assert.equal(value,user.id, 'Profile update must be scoped to the authenticated owner');
              return {
                select() {
                  return {
                    async single() {
                      mutations.push({...values});
                      profile = { ...profile, ...values };
                      return {data:profile,error:null};
                    }
                  };
                }
              };
            }
          };
        },
        upsert() { throw Error('Existing user profile must never be overwritten on sign-in'); }
      };
    }
  };

  const window = {
    location:{ hostname:'show-duino.com' },
    SHOWDUINO_CONFIG:{
      features:{supabase:true,authentication:true},
      supabase:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}
    },
    supabase:{ createClient(){ return service; } }
  };
  const context = { window, URL, console };
  vm.runInNewContext(fs.readFileSync('js/cloud/supabase-service.js','utf8'),context);
  return {
    api:window.ShowduinoSupabase,
    mutations, queries,
    setUser(value) { currentUser = value; },
    getProfile() { return profile; }
  };
}

(async () => {
  const f = fixture();
  const original = await f.api.getCreatorProfile();
  assert.equal(original.display_name, 'Edited Name', 'Sign-in should preserve edited display names');
  assert.equal(f.mutations.length, 0, 'Retrieving a profile must not modify it');

  await assert.rejects(f.api.saveCreatorProfile({display_name:'Valid',username:'two spaces'}), /Username/i);
  await assert.rejects(f.api.saveCreatorProfile({display_name:'Valid',website_url:'http://unsecured.example/'}), /HTTPS/i);
  await assert.rejects(f.api.saveCreatorProfile({display_name:'Valid',bio:'x'.repeat(501)}), /Bio/i);
  assert.equal(f.mutations.length, 0, 'Invalid values must not reach Supabase');

  const updated = await f.api.saveCreatorProfile({
    display_name:'New Display',
    username:'Haunt_Creator',
    bio:'I design immersive shows.',
    creator_focus:'Show Control',
    website_url:'https://example.com/'
  });
  assert.equal(updated.username, 'haunt_creator');
  assert.equal(updated.display_name, 'New Display');
  assert.equal(f.mutations.length, 1);
  assert.ok(f.queries.length > 0);
  f.setUser(null);
  await assert.rejects(f.api.saveCreatorProfile({display_name:'Should fail'}), /Sign in/i);
  assert.equal(f.mutations.length, 1, 'Signed-out users must not write profiles');

  const page = fs.readFileSync('profile.html','utf8');
  const dashboard = fs.readFileSync('hauntsync.html','utf8');
  const studio = fs.readFileSync('js/studio-projects.js','utf8');
  assert.ok(page.includes('id="hs-profile-form"'));
  assert.ok(dashboard.includes('media/hauntsync-official-logo.webp'));
  assert.ok(dashboard.includes('js/cloud/supabase-service.js'));
  assert.ok(studio.includes('showduino_open_cloud_project'), 'Dashboard cloud-open action must be supported by Studio');
  assert.ok(studio.includes('showduino_active_project_id'), 'Dashboard local-open action must be supported by Studio');
  assert.match(fs.readFileSync('js/hauntsync-dashboard.js','utf8'), /Cloud copies are not affected/);
  console.log('PASS: HauntSync profile validation, owner-scoped saves and dashboard navigation contract.');
})().catch((error)=>{ console.error(error); process.exitCode=1; });
