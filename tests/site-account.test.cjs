const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
 constructor(){this.children=[];this.listeners={};this.hidden=false;}
 append(...items){this.children.push(...items);}
 setAttribute(){} addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(){return null;}
}
const header=new Element();let changed,fail=false,calls=0,redirects=[];
const context={console:{error(){}},document:{readyState:'complete',querySelector:()=>header,createElement:()=>new Element()},window:{location:{assign:x=>redirects.push(x)},ShowduinoSupabase:{enabled:()=>true,onAuthChanged:fn=>{changed=fn;fn(null);},signOut:async()=>{calls++;if(fail)throw Error('Offline');}}}};
vm.runInNewContext(fs.readFileSync('js/site-account.js','utf8'),context);
const [account,button,message]=header.children[0].children;
(async()=>{
 assert.equal(account.textContent,'Sign in');assert.equal(button.hidden,true);
 changed({id:'test-user'});assert.equal(button.hidden,false);assert.equal(account.textContent,'Account');
 fail=true;await button.listeners.click();assert.equal(calls,1);assert.equal(button.disabled,false);assert.equal(button.hidden,false);assert.match(message.textContent,/Could not log out/);assert.equal(redirects.length,0);
 fail=false;await button.listeners.click();assert.equal(calls,2);assert.equal(button.hidden,true);assert.deepEqual(redirects,['account.html']);
 for(const page of fs.readdirSync('.').filter(x=>x.endsWith('.html'))){const html=fs.readFileSync(page,'utf8');if(!html.includes('js/site-nav.js'))continue;assert.ok(html.includes('js/site-account.js'),page);assert.ok(html.includes('js/cloud/supabase-service.js'),page);}
 console.log('Site account controls: signed-out, signed-in, failed logout/retry, successful logout and shared-page coverage passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
