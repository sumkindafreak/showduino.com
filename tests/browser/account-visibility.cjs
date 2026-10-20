const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');const root=process.cwd();
const server=http.createServer((req,res)=>{const f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';const browser=await chromium.launch({headless:true,...(process.env.SHOWDUINO_BROWSER_CHANNEL?{channel:process.env.SHOWDUINO_BROWSER_CHANNEL}:{})});
for(const width of [390,1366]){
 const c=await browser.newContext({viewport:{width,height:900}});
 await c.route('**/js/cloud/supabase-service.js',r=>r.fulfill({contentType:'application/javascript',body:`const listeners=[];window.emitAuth=(user,event)=>Promise.all(listeners.map(fn=>fn(user,event)));window.ShowduinoSupabase={enabled:()=>true,onAuthChanged(fn){listeners.push(fn);setTimeout(()=>fn(null,'INITIAL_SESSION'),0);return ()=>{};},getProfile:async()=>window.profileGate?await window.profileGate:{display_name:'Test Creator'},listProjects:async()=>[],signOut:async()=>{await emitAuth(null,'SIGNED_OUT');}};`}));
 await c.route('https://**/*',r=>r.abort());const p=await c.newPage();await p.goto(base+'account.html');await p.waitForFunction(()=>/Sign in or create/.test(document.getElementById('account-status').textContent));
 const card=p.locator('#account-panel'),forms=p.locator('#auth-forms');assert.equal(await card.isVisible(),false,'signed-out card invisible');assert.equal(await forms.isVisible(),true,'signed-out forms visible');
 await p.evaluate(()=>emitAuth({id:'test',email:'creator@example.test'},'SIGNED_IN'));assert.equal(await card.isVisible(),true,'signed-in card visible');assert.equal(await forms.isVisible(),false,'signed-in forms invisible');
 await p.locator('#sign-out-button').click();await p.waitForFunction(()=>document.getElementById('account-panel').hidden);assert.equal(await card.isVisible(),false,'logout card invisible');assert.equal(await forms.isVisible(),true,'logout forms visible');
 await p.evaluate(()=>{window.profileGate=new Promise(resolve=>window.releaseProfile=resolve);void emitAuth({id:'test',email:'creator@example.test'},'SIGNED_IN');});
 await p.evaluate(()=>emitAuth(null,'SIGNED_OUT'));await p.evaluate(()=>window.releaseProfile({display_name:'Stale Creator'}));await p.waitForTimeout(50);
 assert.equal(await card.isVisible(),false,'late profile cannot redisplay signed-in card');assert.equal(await p.locator('#account-status').textContent(),'Sign in or create a free Showduino account.','late profile cannot claim signed-in status');
 console.log('PASS '+width+'px: rendered signed-out, signed-in, logout and delayed-profile states');await c.close();}
 await browser.close();server.close();})().catch(e=>{console.error(e);server.close();process.exit(1);});
