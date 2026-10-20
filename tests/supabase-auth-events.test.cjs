// A listener loading its profile must never hold the auth event lock needed by logout.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let listener,unsubscribed=false,locked=false;const timers=[],seen=[];
const auth={
 onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};},
 async getSession(){return {data:{session:{user:{id:'synthetic-showduino38'}}}};},
 async getUser(){assert.equal(locked,false,'profile reads must run outside the auth lock');return {data:{user:{id:'synthetic-showduino38'}}};},
 async signOut(){await emit('SIGNED_OUT',null);return {error:null};}
};
const client={auth};const ctx={console,setTimeout:fn=>{timers.push(fn);return timers.length;},window:{SHOWDUINO_CONFIG:{features:{supabase:true,authentication:true},supabase:{url:'https://example.supabase.co',publishableKey:'test'}},supabase:{createClient:()=>client}}};
vm.runInNewContext(fs.readFileSync('js/cloud/supabase-service.js','utf8'),ctx);
const api=ctx.window.ShowduinoSupabase;
async function emit(event,user){locked=true;try{const result=listener(event,user?{user}:null);assert.equal(result,undefined,'auth callback must return immediately without the UI promise');}finally{locked=false;}}
async function flush(){while(timers.length){timers.shift()();await new Promise(r=>setImmediate(r));}}
(async()=>{
 const stop=api.onAuthChanged(async(user,event)=>{seen.push(event);if(user)await api.getCurrentUser();});
 await emit('INITIAL_SESSION',{id:'synthetic-showduino38'});assert.equal(seen.length,0,'callbacks must be deferred');await flush();assert.deepEqual(seen,['INITIAL_SESSION']);
 await emit('SIGNED_IN',{id:'synthetic-showduino38'});await flush();await api.signOut();await flush();assert.deepEqual(seen,['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT']);
 await emit('TOKEN_REFRESHED',{id:'synthetic-showduino38'});stop();await flush();assert.equal(unsubscribed,true);assert.equal(seen.length,3,'unsubscribe cancels pending notifications');
 console.log('Auth event lock regression: profile-loading listeners, initial session, logout and unsubscribe passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
