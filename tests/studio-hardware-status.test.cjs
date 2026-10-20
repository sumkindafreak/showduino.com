const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const status={},p4={}; let target='',reply=null,failure=false;
const context={console,AbortController,document:{querySelector:s=>s==='.connection-status'?status:p4,addEventListener(){}},fetch:async()=>{if(failure)throw Error('blocked');return {ok:true,json:async()=>reply};}};
context.window={location:{origin:'https://show-duino.com'},ShowduinoLanConnection:{getSavedTarget:()=>target,normaliseLocalTarget:()=>''},setTimeout,clearTimeout,addEventListener(){}};
vm.runInNewContext(readFileSync('js/studio-hardware-status.js','utf8'),context);
(async()=>{
 const refresh=context.window.ShowduinoHardwareStatus.refresh;
 await refresh(); assert.match(status.textContent,/NOT VERIFIED/);
 target='http://192.168.1.50';reply={ok:true};await refresh();assert.match(status.textContent,/NOT VERIFIED/);
 reply={capability:'studio-ram-timeline-upload',state:'ready'};await refresh();assert.equal(status.textContent,'S3 CONNECTED');assert.match(p4.textContent,/NOT VERIFIED/);
 failure=true;await refresh();assert.match(status.textContent,/NOT VERIFIED/);
 failure=false;reply={capability:'studio-ram-timeline-upload',state:'busy'};await refresh();assert.match(status.textContent,/NOT VERIFIED/);
 console.log('Hardware indicators: unset target, arbitrary JSON, verified S3, connection loss and non-ready responses passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
