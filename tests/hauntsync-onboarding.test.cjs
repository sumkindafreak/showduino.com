// HauntSync registration/onboarding static and behaviour tests. Run: node tests/hauntsync-onboarding.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = file => fs.readFileSync(file, 'utf8');
for (const [file, required] of [
  ['index.html',['href="welcome.html"','Join HauntSync']],
  ['hauntsync.html',['href="welcome.html"','<option>Emergency Node</option>','<option>Lamp Node</option>']],
  ['welcome.html',['id="hs-onboarding-status"','id="hs-onboarding-join"','js/hauntsync-onboarding.js']],
  ['account.html',['id="register-form"','minlength="12"','id="hauntsync-account-next"']],
  ['profile.html',['id="hs-profile-publish"','id="hs-profile-unpublish"']],
  ['community.html',['id="hs-show-preview"']],
  // W005 rewrite: the creator page is a separate public copy; data requests are under Your rights.
  ['privacy.html',['Publishing creates a public copy','id="rights"','id="deletion"']]
]) {
  const markup = html(file);
  for (const marker of required) assert.ok(markup.includes(marker), file+' missing '+marker);
}
const legacy = html('hauntsync.html');
assert.ok(!legacy.includes('<option>Relay Node</option>'),'Retired relay must not be a new inventory option');
assert.match(html('js/account-page.js'),/registerPassword\.value\.length < 12/);
assert.match(html('js/account-page.js'),/hauntsyncNext\.hidden/);
assert.match(html('js/hauntsync-library.js'),/URLSearchParams\(window\.location\.search\)\.get\('show'\)/);
assert.match(html('js/hauntsync-public-creators.js'),/community\.html\?show=/);

function stubElement() {
  const classes = new Set();
  return {
    textContent:'', href:'', hidden:false, className:'',
    classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name);},
      contains(name){return classes.has(name);}}
  };
}
const ids = [
  'hs-onboarding-status','hs-onboarding-join','hs-onboarding-account-action',
  'hs-onboarding-account-state','hs-onboarding-profile-state','hs-onboarding-share-state'
];
const nodes = Object.fromEntries(ids.map(id=>[id,stubElement()]));
let ready, authChanged, userProfile=null, publication=null;
const service = {
  enabled:()=>true,
  onAuthChanged:(callback)=>{authChanged=callback;return ()=>{};},
  getCreatorProfile:async()=>userProfile,
  getOwnCreatorPublication:async()=>publication
};
const document = {
  getElementById:id=>{assert.ok(nodes[id],'Unexpected onboarding element '+id);return nodes[id];},
  addEventListener:(name,cb)=>{assert.equal(name,'DOMContentLoaded');ready=cb;}
};
vm.runInNewContext(html('js/hauntsync-onboarding.js'),{document,window:{ShowduinoSupabase:service},console});
ready();
assert.equal(typeof authChanged,'function');

async function settle(){await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
  authChanged(null); await settle();
  assert.match(nodes['hs-onboarding-join'].textContent,/Create your free/);
  assert.match(nodes['hs-onboarding-profile-state'].textContent,/Sign in/);
  userProfile={username:'hauntbuilder'};
  publication=null;
  authChanged({id:'test-user'}); await settle();
  assert.match(nodes['hs-onboarding-account-state'].textContent,/Signed in/);
  assert.match(nodes['hs-onboarding-profile-state'].textContent,/Private creator profile saved/);
  publication={username:'hauntbuilder'};
  authChanged({id:'test-user'}); await settle();
  assert.match(nodes['hs-onboarding-profile-state'].textContent,/published as @hauntbuilder/);
  authChanged(null); await settle();
  assert.match(nodes['hs-onboarding-profile-state'].textContent,/Sign in/);
  console.log('PASS: HauntSync signup CTAs, privacy contract, link routing and onboarding state changes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
