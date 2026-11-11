#!/usr/bin/env node
/* Re-run the P4 firmware's SHDO compiler over the parity fixtures and record its verdicts.
 *
 *   g++ -std=c++17 -w -I <new_showduino>/protocol -o /tmp/shdo_host tools/p4-parity/shdo_host.cpp
 *   node tools/p4-parity/regenerate.cjs /tmp/shdo_host "<branch or tag>" "<commit>"
 *
 * Needs a checkout of sumkindafreak/new_showduino. Nothing here talks to hardware. */
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const { FIXTURES, exportShow } = require('../../tests/fixtures/p4-parity/shows.cjs');
const [binary, ref, commit] = process.argv.slice(2);
if (!binary || !ref || !commit) { console.error('usage: regenerate.cjs <shdo_host binary> <firmware ref> <firmware commit>'); process.exit(2); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-parity-'));
const cases = {};
for (const name of Object.keys(FIXTURES)) {
  const file = path.join(dir, `${name}.shdo`);
  fs.writeFileSync(file, JSON.stringify(exportShow(name), null, 2));
  const lines = execFileSync(binary, [file], { encoding: 'utf8' }).trim().split('\n');
  const [, status] = lines[0].split('\t');
  cases[name] = { status, cues: lines.filter((l) => l.startsWith('CUE\t')).map((l) => { const [, time, , command] = l.split('\t'); return `${time} ${command}`; }) };
}
const out = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'p4-parity', 'firmware-verdicts.json');
fs.writeFileSync(out, JSON.stringify({ firmware: { repository: 'sumkindafreak/new_showduino', ref, commit, source: 'protocol/showduino_shdo.h shdoCompile(), compiled on a host computer' }, cases }, null, 2) + '\n');
console.log(`Wrote ${Object.keys(cases).length} firmware verdicts to ${path.relative(process.cwd(), out)}`);
