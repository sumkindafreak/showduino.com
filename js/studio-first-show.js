/* First Show: non-destructive offline SHDO v2 builder. No hardware control. */
(function firstShowScript(){
'use strict';
const THEMES = Object.freeze({
  haunt: { label:'Halloween scare',effect:'FLICKER',colour:'#ff7425',name:'My Halloween Show' },
  ambient: { label:'Atmospheric scene',effect:'BREATHE',colour:'#73adff',name:'My Atmospheric Show' },
  party: { label:'Party lights',effect:'RAINBOW',colour:'#78ff40',name:'My Party Show' }
});
const EFFECTS=['FLICKER','FIRE','LIGHTNING','PULSE','BREATHE','SOLID','RAINBOW'];
let root=null, draft=null, step=0, busy=false, error='', previousFocus=null;
let inertTargets=[];
function clean(v,n=120){return String(v??'').trim().slice(0,n)}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function num(v,min,max,fallback){const x=Number(v);return Number.isFinite(x)?Math.min(max,Math.max(min,Math.round(x))):fallback}
function initial(){return {name:'My Halloween Show',theme:'haunt',p4:false,p4Count:10,pixel:false,pixelNode:'PIXEL-01',pixelCount:10,audio:false,audioNode:'audio-1',audioFile:'',mosfet:false,mosfetNode:'MOSFET-01',mosfetOut:'out1',pulseMs:400,effect:'FLICKER',colour:'#ff7425',duration:15000}}
function selected(d){return Number(!!d.p4)+Number(!!d.audio)+Number(!!d.pixel)+Number(!!d.mosfet)}
function validate(d,through=3){
  const issues=[];
  if(!clean(d.name,80))issues.push('Give your show a name.');
  if(through>=1&&!selected(d))issues.push('Choose at least one connected output.');
  if(through>=2){
    if(d.pixel && (!/^[a-z][a-z0-9_-]{1,11}$/i.test(clean(d.pixelNode)) || !window.ShowduinoPixelAuthoring?.pixelNodeIdOk?.(clean(d.pixelNode))))issues.push('Enter a dedicated Pixel Node ID, for example PIXEL-01. P4, Audio and Emergency IDs are reserved.');
    if(d.audio&&!/^[a-z0-9][a-z0-9 _/.-]*\.wav$/i.test(clean(d.audioFile)))issues.push('Enter the WAV filename already on your Audio Node, for example scare.wav.');
    if(d.audio&&!/^[a-z0-9_-]{2,32}$/i.test(clean(d.audioNode)))issues.push('Enter your Audio Node ID, for example audio-1.');
    if(d.mosfet&&!/^MOSFET-0*[1-8]$/i.test(clean(d.mosfetNode)))issues.push('Enter a MOSFET Node ID from MOSFET-01 to MOSFET-08.');
  }
  return issues;
}
function events(d){
  const list=[];
  if(d.p4)list.push({at:0,name:'Main LED strip',detail:d.effect+' / '+d.p4Count+' LEDs'});
  if(d.pixel)list.push({at:0,name:'Extra LED strip',detail:d.pixelNode+' / '+d.effect});
  if(d.audio)list.push({at:2000,name:'Scare sound',detail:d.audioFile});
  if(d.mosfet)list.push({at:4000,name:'Prop trigger',detail:d.mosfetNode+' '+d.mosfetOut.toUpperCase()+' / '+d.pulseMs+' ms'});
  return list;
}
function createProject(d,Model=window.SHDOModel,Package=window.ShowduinoPackage){
  const problems=validate(d);if(problems.length)throw Error(problems.join(' '));
  if(!Model||!Package)throw Error('Studio is still starting.');
  const project=Model.createProject(clean(d.name,80)); 
  project.project.description='Created with First Show: '+(THEMES[d.theme]?.label||'Custom');
  project.project.duration=num(d.duration,10000,120000,15000);
  project.tracks=[];project.clips=[];project.devices=[];project.assets=[];
  project.metadata={firstShowWizard:{version:1,hardwareVerified:false}};
  const rgb=/^#[a-f0-9]{6}$/i.test(d.colour)?d.colour:'#ff7425';
  const colour=[1,3,5].map(i=>parseInt(rgb.slice(i,i+2),16));
  function add(type,label,start,duration,id,out,params,device){
    const track=Model.createTrack(type,label,project.tracks.length);
    const clip=Model.createClip(track.id,type,start,duration,label);
    clip.routing={nodeId:id,output:out||''};Object.assign(clip.params,params||{});
    project.tracks.push(track);project.clips.push(clip);project.devices.push(device);
  }
  function hardware(id,name,type,route,nodeId,out){
    return {id,name,type,enabled:true,binding:{route,nodeId,...(out?{outputLabel:out}:{})},metadata:{configuredBy:'first-show-wizard',hardwareVerified:false}};
  }
  function pixels(label,id,count,kind){
    const local=kind==='p4';
    add('pixel',label,0,project.project.duration,id,'',{
      line:1,segment:0,segmentMode:'range',segmentName:label,
      startPixel:0,length:num(count,1,local?1024:512,10),
      r:colour[0],g:colour[1],b:colour[2],effect:d.effect,
      brightness:180,speed:50,blackoutAtEnd:true
    },hardware(local?'p4-show-pixels':'wizard-pixel-'+id.toLowerCase(),label,local?'p4-pixel-line':'pixel-node',local?'p4-show-pixels':'pixel-node',id));
  }
  if(d.p4)pixels('Stage LED strip','p4',d.p4Count,'p4');
  if(d.pixel)pixels('Extra LED strip',clean(d.pixelNode),d.pixelCount,'pixel');
  if(d.audio){
    const id=clean(d.audioNode);
    add('audio','Scare sound',2000,5000,id,'',{file:clean(d.audioFile),volume:85,loop:false},
      hardware('wizard-audio-'+id,'Show Audio Node','audio-node','audio-node',id));
  }
  if(d.mosfet){
    const id=clean(d.mosfetNode).toUpperCase(),out=/^out[1-4]$/.test(d.mosfetOut)?d.mosfetOut:'out1';
    const pulse=num(d.pulseMs,100,3000,400);
    add('mosfet','Prop trigger',4000,pulse,id,out,{out,mode:'pulse',pulseMs:pulse,duty:100,state:true,safeOff:true},
      hardware('wizard-'+id.toLowerCase()+'-'+out,'Prop '+out.toUpperCase(),'mosfet-node','mosfet-node',id,out));
  }
  const scene=Model._uuid(),cue=Model._uuid();
  project.scenes=[{id:scene,name:clean(d.name,80),description:'Starter scene',order:0,
    cues:[{id:cue,name:'Show sequence',trigger:'Timeline',notes:'P4 show playback is started by an operator.',clipIds:project.clips.map(c=>c.id)}]}];
  Package.ensurePackageMetadata(project);
  const shdo=Package.toShdo(project),check=Package.validateShdo(shdo);
  if(!check.valid)throw Error(check.errors[0]||'SHDO validation failed.');
  return project;
}
function field(key,label,type,extra=''){
  return `<label class="fsw-field"><span>${esc(label)}</span><input name="${key}" type="${type}" value="${esc(draft[key])}" ${extra}></label>`;
}
function check(key,label,detail){
  return `<label class="fsw-pick"><input name="${key}" type="checkbox" ${draft[key]?'checked':''}><span><strong>${esc(label)}</strong><small>${esc(detail)}</small></span></label>`;
}
function body(){
  if(step===0)return `<p>Build a real show in four easy steps. No JSON, programming or complicated timeline required.</p>
    ${field('name','Name your show','text','maxlength="80" required')}
    <fieldset class="fsw-fieldset"><legend>What are you creating?</legend>${Object.entries(THEMES).map(([k,t])=>`<label><input type="radio" name="theme" value="${k}" ${draft.theme===k?'checked':''}> ${esc(t.label)}</label>`).join('')}</fieldset>`;
  if(step===1)return `<p>Tick what you actually own. Your main Showduino already contains the Director, Comms and P4. This is <strong>planning</strong>, not automatic device discovery.</p>
    ${check('p4','LED strip on main Showduino','Show pixels on the P4 (GPIO23)')}
    ${draft.p4?field('p4Count','How many LEDs?','number','min="1" max="1024"'):''}
    ${check('audio','Show Audio Node','Play a sound already stored as WAV on this node')}
    ${draft.audio?field('audioNode','Audio Node ID','text','maxlength="32"'):''}
    ${check('pixel','Extra Pixel Node','A separate C3-controlled LED strip')}
    ${draft.pixel?field('pixelNode','Pixel Node ID','text','maxlength="12"')+field('pixelCount','How many LEDs?','number','min="1" max="512"'):''}
    ${check('mosfet','MOSFET prop output','Pulse an appropriately wired low-voltage prop')}
    ${draft.mosfet?field('mosfetNode','MOSFET Node ID','text','maxlength="12"'):''}
    <p class="fsw-tip">Other modules remain available through Advanced Studio. Emergency outputs are never programmable show effects.</p>`;
  if(step===2)return `<p>Choose a couple of actions. We'll create the tracks and time them for you.</p>
    ${(draft.p4||draft.pixel)?`<label class="fsw-field"><span>Lighting effect</span><select name="effect">${EFFECTS.map(f=>`<option value="${f}" ${draft.effect===f?'selected':''}>${f}</option>`).join('')}</select></label>${field('colour','LED colour','color')}`:''}
    ${draft.audio?`${field('audioFile','WAV filename on Audio Node','text','maxlength="120" placeholder="scare.wav"')}<p class="fsw-tip">Copy this WAV to the Audio Node separately. Studio does not invent or upload sound files.</p>`:''}
    ${draft.mosfet?`<label class="fsw-field"><span>Prop output</span><select name="mosfetOut">${[1,2,3,4].map(n=>`<option value="out${n}" ${draft.mosfetOut==='out'+n?'selected':''}>Output ${n}</option>`).join('')}</select></label>${field('pulseMs','Pulse length (ms)','number','min="100" max="3000"')}`:''}
    ${field('duration','Scene length (milliseconds)','number','min="10000" max="120000" step="1000"')}`;
  return `<p>Here's your show! Create it, then open the standard timeline to preview, fine-tune and export a genuine .shdo file.</p>
    <div class="fsw-summary"><strong>${esc(draft.name)}</strong><small>${(draft.duration/1000)} seconds</small>
      <ol>${events(draft).map(e=>`<li><span>${e.at/1000}s</span><strong>${esc(e.name)}</strong><small>${esc(e.detail)}</small></li>`).join('')}</ol></div>
    <p class="fsw-tip">Before deploying, check the actual node IDs, SD audio filenames and output wiring. The P4 must confirm deployment. Emergency remains P4-controlled.</p>`;
}
function render(){
  if(!root)return;
  const heads=['Name your show','Choose your hardware','Design your scene','Review and create'];
  root.innerHTML=`<div class="fsw-shade" data-fsw="close"></div><section class="fsw-dialog" role="dialog" aria-modal="true" aria-labelledby="fsw-title">
    <header><span>SHOWDUINO · FIRST SHOW</span><button type="button" data-fsw="close" aria-label="Close First Show wizard">×</button></header>
    <div class="fsw-progress">${[0,1,2,3].map(i=>`<i class="${i<=step?'current':''}"></i>`).join('')}</div>
    <div class="fsw-body"><small>STEP ${step+1} OF 4</small><h2 id="fsw-title">${heads[step]}</h2>${body()}
      ${error?`<p class="fsw-error" role="alert">${esc(error)}</p>`:''}</div>
    <footer><button type="button" data-fsw="back" ${step===0?'disabled':''}>Back</button>
      <button type="button" class="fsw-primary" data-fsw="${step===3?'create':'next'}" ${busy?'disabled':''}>${busy?'Saving…':step===3?'Create my show':'Continue'}</button></footer>
    </section>`;
  const target=root.querySelector('.fsw-dialog button[data-fsw="close"]');
  target?.focus({preventScroll:true});
}
function sync(input){
  const key=input.name;
  if(!key||!Object.prototype.hasOwnProperty.call(draft,key))return;
  const prior=draft[key];
  draft[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
  if(key==='theme'&&prior!==draft.theme){
    const next=THEMES[draft.theme],old=THEMES[prior];
    if(next){
      if(draft.name===old?.name)draft.name=next.name;
      draft.effect=next.effect;draft.colour=next.colour;
    }
  }
  if(input.type==='checkbox'||key==='theme')render();
}
function close(){
  if(busy)return;
  root?.remove();root=null;document.body.classList.remove('fsw-open');
  inertTargets.forEach(({node,old})=>{node.inert=old;});
  inertTargets=[];
  previousFocus?.focus?.();
}
function open(){
  if(root)return;
  if(!window.SHDOModel||!window.ShowduinoPackage||!window.ShowduinoProjects){
    window.alert('Studio is still loading. Try First Show again in a moment.');return;
  }
  previousFocus=document.activeElement;step=0;error='';busy=false;draft=initial();
  root=document.createElement('div');root.id='showduino-first-show';root.className='fsw-root';
  document.body.appendChild(root);document.body.classList.add('fsw-open');
  // Hide all non-dialog focus targets from keyboard and assistive technology.
  inertTargets=Array.from(document.body.children).filter(node=>node!==root)
    .map(node=>({node,old:node.inert}));
  inertTargets.forEach(({node})=>{node.inert=true;});
  render();
}
async function create(){
  const problems=validate(draft);if(problems.length){error=problems[0];render();return;}
  if(!window.state){error='Studio has not finished loading.';render();return;}
  if(window.state.project?.clips?.length&&!window.confirm('Start a new show? Your current show will stay saved locally and can be reopened from Projects.'))return;
  busy=true;error='';render();
  try{
    if(window.state.project)await window.ShowduinoProjects.saveCurrentProject({cloud:false});
    const project=createProject(draft);
    const nextProject=window.ShowduinoProjects.normaliseProject(project);
    window.state.project=nextProject;
    await window.ShowduinoProjects.saveCurrentProject({cloud:false});
    // Restore from the exact newly-saved project ID so no stale in-memory
    // timeline snapshot or prior local active ID can replace this new show.
    const saved=window.ShowduinoProjects.loadLocalProject(nextProject.project.id);
    if (!saved || saved.project.id!==nextProject.project.id) throw Error('New show verification failed.');
    window.state.project=saved;
    window.dispatchEvent(new CustomEvent('showduino:first-show-created',{detail:{projectId:window.state.project.project.id}}));
    busy=false;close();
    window.ShowduinoStudioV4?.refreshProjectStats?.();
    if (document.body.classList.contains('studio-mobile-native')) {
      // Phone layout hides the desktop timeline; render the populated native
      // Build screen instead of navigating into an obscured panel.
      window.ShowduinoMobileStudio?.showBuild?.();
    } else {
      const timeline=document.querySelector('.sidebar-nav li[data-panel="timeline-editor"]');
      if(timeline)timeline.click();else window.loadPanel?.('timeline-editor');
    }
  }catch(e){busy=false;error=e.message;render();}
}
document.addEventListener('click',ev=>{
  const action=ev.target.closest?.('[data-fsw]');if(!action)return;
  const mode=action.dataset.fsw;
  if(mode==='open'){open();return;}
  if(!root||!root.contains(action))return;
  if(mode==='close'){close();return;}
  if(mode==='back'){step=Math.max(0,step-1);error='';render();return;}
  if(mode==='next'){
    const problem=validate(draft,step);
    if(problem.length){error=problem[0];render();return;}
    step=Math.min(3,step+1);error='';render();return;
  }
  if(mode==='create'&&!busy)void create();
});
document.addEventListener('input',ev=>{if(root?.contains(ev.target)&&ev.target.type!=='checkbox'&&ev.target.type!=='radio')sync(ev.target)});
document.addEventListener('change',ev=>{if(root?.contains(ev.target)&&(ev.target.type==='checkbox'||ev.target.type==='radio'))sync(ev.target)});
document.addEventListener('keydown',ev=>{
  if(!root)return;
  if(ev.key==='Escape'){ev.preventDefault();close();return;}
  if(ev.key!=='Tab')return;
  const focusable=Array.from(root.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'))
    .filter(el=>el.getClientRects().length>0);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(ev.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){ev.preventDefault();last.focus();}
  else if(!ev.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){ev.preventDefault();first.focus();}
});
window.ShowduinoFirstShow=Object.freeze({open,close,createProject,validate,initial,events});
})();
