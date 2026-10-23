/* W005 (W5-24): only show-duino.com and local test servers use the production Supabase.
 * Preview deployments (*.pages.dev) and look-alike hosts run local-only. */
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const source = fs.readFileSync('js/cloud/supabase-service.js', 'utf8');
function load(hostname) {
  let created = 0;
  const window = {
    location: { hostname },
    SHOWDUINO_CONFIG: { features: { supabase: true, authentication: true }, supabase: { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' } },
    supabase: { createClient() { created += 1; return { auth: {} }; } }
  };
  vm.runInNewContext(source, { window, console, URL, setTimeout, clearTimeout });
  return { service: window.ShowduinoSupabase, created: () => created };
}
for (const host of ['show-duino.com', 'www.show-duino.com', 'localhost', '127.0.0.1']) {
  assert.strictEqual(load(host).service.enabled(), true, `${host} may use account services`);
}
for (const host of ['showduino-com.pages.dev', 'w005-auth-launch.showduino-com.pages.dev', 'showduinoweb.pages.dev', 'show-duino.com.evil.example', 'showduino.com', '192.168.1.50', '']) {
  const { service, created } = load(host);
  assert.strictEqual(service.enabled(), false, `${host || '(no host)'} runs local-only`);
  assert.throws(() => service.client(), /not configured/, `${host || '(no host)'} cannot create a client`);
  assert.strictEqual(created(), 0, `${host || '(no host)'} never creates a Supabase client`);
}
console.log('PASS: production account services only on show-duino.com and local test servers; previews run local-only.');
