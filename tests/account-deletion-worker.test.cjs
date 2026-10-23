const assert = require('node:assert/strict');
(async () => {
 const {processDeletions} = await import('../supabase/functions/account-deletion-worker/worker.mjs');
 function fixture({unauthorized=false, storageFailure=false, deleteFailure=false}={}) {
  const calls=[]; const files={ 'hauntsync-avatars': Array.from({length:105},(_,i)=>({id:String(i),name:`avatar-${i}.png`})), 'community-images':[{id:'post',name:'post-test.png'}] };
  const client={rpc:async(n,p)=>{calls.push(['claim',p]);return {data:unauthorized?null:['test-user'],error:unauthorized?{}:null}},auth:{admin:{updateUserById:async(...a)=>{calls.push(['ban',...a]);return {}},deleteUser:async(...a)=>{calls.push(['delete',...a]);return {error:deleteFailure?{}:null}}}},storage:{from:bucket=>({list:async()=>({data:files[bucket].slice(0,100)}),remove:async paths=>{calls.push(['remove',bucket,paths]);if(storageFailure)return {error:{}};files[bucket].splice(0,paths.length);return {}}})}};
  return {client,calls,files};
 }
 let f=fixture({unauthorized:true});assert.equal((await processDeletions(f.client,'bad')).status,403);assert.equal(f.calls.length,1);
 f=fixture();assert.equal((await processDeletions(f.client,'secret')).processed,1);assert.equal(f.calls[1][0],'ban');assert.deepEqual(f.calls.at(-1),['delete','test-user',false]);assert.equal(f.calls.filter(c=>c[0]==='remove').length,3);
 f=fixture({storageFailure:true});assert.equal((await processDeletions(f.client,'secret')).status,503);assert(!f.calls.some(c=>c[0]==='delete'));
 f=fixture({deleteFailure:true});assert.equal((await processDeletions(f.client,'secret')).failed,1);
 console.log('PASS: worker authenticates, bans before cleanup, removes every page, hard-deletes last, and retries failures without premature Auth deletion.');
})().catch(e=>{console.error(e);process.exitCode=1});
