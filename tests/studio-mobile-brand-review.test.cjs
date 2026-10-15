// Regression guard for the actual visual split and native mobile workflow.
// Static assertions complement (but do not replace) real-device browser review.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const pages = [
  'index.html','system.html','hauntsync.html','tools.html',
  'aboutme.html','docs.html','support.html','privacy.html','terms.html',
  'account.html','404.html','preview/hauntsync.html'
];
for (const file of pages) {
  const s = fs.readFileSync(file,'utf8');
  assert.match(s, /<span class="brand-show">SHOW<\/span><span class="brand-duino">DUINO<\/span>/,
    'Missing accurate white/green wordmark on '+file);
  assert.match(s, /showduino-stage-theme\.css/, 'Theme not loaded on '+file);
}
const studio = fs.readFileSync('studio.html','utf8');
assert.match(studio, /<span class="brand-show">SHOW<\/span><span class="brand-duino">DUINO<\/span>/,
  'Missing desktop Studio brand');
const stage = fs.readFileSync('css/showduino-stage-theme.css','utf8');
const theme = fs.readFileSync('css/showduino-studio-theme.css','utf8');
const mobileCss = fs.readFileSync('css/studio-mobile-simple.css','utf8');
const mobile = fs.readFileSync('js/studio-mobile.js','utf8');
const wizard = fs.readFileSync('js/studio-first-show.js','utf8');
const projects = fs.readFileSync('js/studio-projects.js','utf8');
for (const x of [stage,theme]) {
  assert.ok(x.includes('.brand-duino'), 'Green DUINO color rule missing');
  assert.ok(!x.includes('linear-gradient(90deg,#fff 0 45%'), 'Broken percentage-based branding restored');
}
assert.ok(stage.includes('.hero-kicker,.showduino-stage-note{max-width:100%'), 'Long mobile kicker still overflows');
assert.ok(stage.includes('.hero{width:min(100% - 1.6rem'), 'Mobile hero layout fix absent');
assert.ok(stage.includes('.product-proof{grid-template-columns:minmax(0,1fr)}'), 'Mobile proof cards still cramped');
assert.match(mobileCss, /--sm-accent:#78ff43/, 'Mobile still has obsolete turquoise accent');
assert.ok(!mobileCss.includes('--sm-accent:#00ffc8'), 'Old mobile accent returned');
assert.ok(mobileCss.includes('.brand-duino'), 'Mobile wordmark colour missing');
assert.ok(mobile.includes('showduino:first-show-created'), 'Phone builder does not re-render after wizard');
assert.ok(mobile.includes('showBuild:'), 'Phone wizard still sends users into hidden desktop timeline');
assert.ok(mobile.includes('?v=20261015-stage-green'), 'Mobile stylesheet cache may remain stale');
assert.ok(wizard.includes('pixelNodeIdOk?.(clean(d.pixelNode))'), 'Wizard lacks reserved-ID check');
assert.ok(wizard.includes('const saved=window.ShowduinoProjects.loadLocalProject(nextProject.project.id)'), 'New show is not verified against saved active project');
assert.ok(projects.includes('An already-active authored show takes precedence'), 'Restore can overwrite the current authored show');
assert.ok(wizard.includes('inertTargets.forEach(({node})=>{node.inert=true;})'), 'Background focus still reachable');
assert.ok(wizard.includes("ev.key!=='Tab'"), 'Wizard does not trap keyboard focus');
console.log('Mobile theme, responsive layout and wizard review guards passed.');
