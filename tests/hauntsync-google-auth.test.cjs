// Google OAuth contract. No real Google credentials or users are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let lastRequest = null;
let providerFailure = null;
const auth = {
  async signInWithOAuth(settings) {
    lastRequest = settings;
    return {data:{url:'https://accounts.google.com/test'},error:providerFailure};
  }
};
const client = {auth};
const context = {
  window:{
    location:{ hostname:'show-duino.com' },
    SHOWDUINO_CONFIG:{
      features:{supabase:true,authentication:true},
      supabase:{url:'https://example.supabase.co',publishableKey:'test-publishable'}
    },
    supabase:{createClient:()=>client}
  },
  console
};
vm.runInNewContext(fs.readFileSync('js/cloud/supabase-service.js','utf8'),context);
const api = context.window.ShowduinoSupabase;
assert.equal(typeof api.signInWithGoogle, 'function');
assert.match(fs.readFileSync('account.html','utf8'),/id="google-signin-button"/);
assert.match(fs.readFileSync('js/account-page.js','utf8'),/addEventListener\('click',handleGoogleSignIn\)/);
assert.match(fs.readFileSync('account.html','utf8'),/id="google-signin-button"[^>]*disabled/);
assert.match(fs.readFileSync('js/account-page.js','utf8'),/settings\?\.external\?\.google === true/);
assert.match(fs.readFileSync('welcome.html','utf8'),/Continue with Google/);

(async()=>{
  const data = await api.signInWithGoogle();
  assert.equal(data.url,'https://accounts.google.com/test');
  assert.equal(lastRequest.provider,'google');
  assert.equal(lastRequest.options.redirectTo,'https://show-duino.com/welcome.html');
  assert.deepEqual(Object.keys(lastRequest.options),['redirectTo']);
  providerFailure=new Error('Unsupported provider');
  await assert.rejects(()=>api.signInWithGoogle(),/Unsupported provider/);
  console.log('PASS: Google OAuth request, fixed redirect, account button and error propagation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
