/* W005 (W5-15): Studio on the public HTTPS site never probes plain-HTTP hardware addresses
 * (the browser would block them); on a LAN console (HTTP) it still does. */
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const source = fs.readFileSync('js/connection_detector.js', 'utf8');
async function run(protocol, hostname, configured) {
  const fetched = [];
  const sandbox = {
    window: { location: { protocol, hostname }, localStorage: { getItem: (k) => (k === 'showduino_target_url' ? configured || '' : null) } },
    fetch: async (url) => { fetched.push(String(url)); return { ok: false }; },
    AbortController, setTimeout, clearTimeout, console
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox);
  const detector = new sandbox.window.ConnectionDetector();
  const mode = await detector.detectMode();
  return { mode, fetched };
}
(async () => {
  const pub = await run('https:', 'show-duino.com', 'http://192.168.1.50');
  assert.deepStrictEqual(pub.fetched, [], 'no plain-HTTP probes from the HTTPS website');
  assert.strictEqual(pub.mode, 'offline');
  const httpsTarget = await run('https:', 'show-duino.com', 'https://console.example.test');
  assert.deepStrictEqual(httpsTarget.fetched, ['https://console.example.test/status'], 'an HTTPS target is still tried');
  const lan = await run('http:', '192.168.1.20', 'http://192.168.1.50');
  assert.ok(lan.fetched.includes('http://192.168.1.50/status') && lan.fetched.includes('http://192.168.4.1/status'), 'LAN console still probes hardware');
  console.log('PASS: no mixed-content hardware probes from the HTTPS website; LAN consoles unchanged.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
