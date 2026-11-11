/* Phase 2: Studio's browser cue compiler against the P4 firmware's own SHDO compiler.
 *
 * tests/fixtures/p4-parity/firmware-verdicts.json holds what shdoCompile() from
 * sumkindafreak/new_showduino returned for each fixture when built on a host computer
 * (tools/p4-parity/). This test exports the same shows with Studio's packager and checks
 * that Studio's live-upload compiler accepts and refuses the same shows and produces the
 * same commands at the same times, in the same order.
 *
 * One difference is known and allowed: the P4 gives every persisted pixel cue the next
 * segment number on its output, while Studio reuses a segment once it is free. Segment
 * numbers are therefore compared by pattern, and a separate check makes sure cues that
 * overlap never share a segment on either side.
 *
 * A host compile is not a hardware test. docs/W005_P4_BENCH_TEST.md is still required. */
const assert = require('assert');
const { FIXTURES, exportShow } = require('./fixtures/p4-parity/shows.cjs');
const verdicts = require('./fixtures/p4-parity/firmware-verdicts.json');

/**
 * Replace each segment number with the order in which that segment first appears for
 * its output, so two command lists using different but equivalent numbering compare equal.
 * @param {string[]} lines "timeMs COMMAND" lines.
 * @returns {string[]} The lines with canonical segment numbers.
 */
function canonicalSegments(lines) {
  const seen = new Map();
  return lines.map((line) => line.replace(/^(\d+) (.*?)SEGMENT:(\d+)/, (_, time, prefix, slot) => {
    const key = `${prefix}|${time}|${slot}`;
    if (!seen.has(key)) seen.set(key, [...seen.keys()].filter((k) => k.startsWith(`${prefix}|${time}|`)).length);
    return `${time} ${prefix}SEGMENT:#${seen.get(key)}`;
  }));
}

/**
 * Check that no two pixel cues share a segment on one output while both are running.
 * @param {string[]} lines "timeMs COMMAND" lines.
 * @param {string} label Name used in the failure message.
 * @returns {void}
 */
function assertNoSegmentCollision(lines, label) {
  const running = new Map();
  for (const line of lines) {
    const match = /^(\d+) (.*?SEGMENT:\d+):(START|DURATION:(\d+))$/.exec(line);
    if (!match) continue;
    const [, time, segment, , duration] = match;
    if (duration) { running.set(`${segment}@${time}`, Number(time) + Number(duration)); continue; }
    for (const [key, end] of running) {
      const [otherSegment, otherTime] = key.split('@');
      if (otherSegment === segment && Number(otherTime) < Number(time)) assert.ok(end <= Number(time), `${label}: ${segment} is reused at ${time} ms while the cue from ${otherTime} ms runs until ${end} ms`);
    }
  }
}

assert.deepStrictEqual(Object.keys(verdicts.cases).sort(), Object.keys(FIXTURES).sort(), 'every fixture has a firmware verdict; re-run tools/p4-parity/regenerate.cjs after changing fixtures');
assert.match(verdicts.firmware.commit, /^[0-9a-f]{40}$/, 'firmware verdicts name the exact firmware commit');

let accepted = 0; let refused = 0;
for (const name of Object.keys(FIXTURES)) {
  const shdo = exportShow(name);
  const plan = ShowduinoDeploy.compileShdoForStage(shdo);
  const firmware = verdicts.cases[name];
  const studioLines = plan.commands.map((c) => `${c.timeMs} ${c.command}`);

  assert.strictEqual(plan.ok, firmware.status === 'OK', `${name}: Studio ${plan.ok ? 'accepts' : 'refuses'} but the P4 returns ${firmware.status} (${plan.errors.join(' ')})`);
  if (firmware.status !== 'OK') { refused += 1; assert.ok(plan.errors.length > 0, `${name}: a refused show explains why`); continue; }
  accepted += 1;

  assert.deepStrictEqual(canonicalSegments(studioLines), canonicalSegments(firmware.cues), `${name}: Studio and the P4 compile different commands`);
  assertNoSegmentCollision(studioLines, `${name} (Studio)`);
  assertNoSegmentCollision(firmware.cues, `${name} (P4)`);
  for (let i = 1; i < studioLines.length; i++) assert.ok(parseInt(studioLines[i], 10) >= parseInt(studioLines[i - 1], 10), `${name}: cue times never go backwards`);
  plan.commands.forEach((c) => assert.ok(c.command.length <= 63, `${name}: "${c.command}" fits the 63-character P4 command`));

  // Every accepted show must also survive Studio's own export → import round trip unchanged.
  const again = ShowduinoPackage.toShdo(ShowduinoPackage.fromShdo(JSON.parse(JSON.stringify(shdo))));
  const replan = ShowduinoDeploy.compileShdoForStage(again);
  assert.deepStrictEqual(replan.commands.map((c) => `${c.timeMs} ${c.command}`), studioLines, `${name}: commands change after export and re-import`);
}

// The overlap case is the regression this file was written for: before the fix Studio put
// both cues on segment 0, so the second replaced the first on a live upload.
const overlap = ShowduinoDeploy.compileShdoForStage(exportShow('pixel-overlapping-same-output'));
assert.ok(overlap.commands.some((c) => c.command === 'PIXEL:SEGMENT:0:RANGE:0:4'));
assert.ok(overlap.commands.some((c) => c.command === 'PIXEL:SEGMENT:1:RANGE:4:3'), 'the overlapping cue gets its own segment');
assert.ok(overlap.warnings.some((w) => /segment 0 on this pixel output is still running "Green", so this cue uses segment 1/.test(w)), 'Studio says which cue holds the segment and where this one went');
// Cues that do not overlap keep the segment they asked for.
const sequential = ShowduinoDeploy.compileShdoForStage(exportShow('pixel-sequential-same-output'));
assert.ok(sequential.commands.every((c) => !/SEGMENT:[1-9]/.test(c.command)), 'sequential cues stay on segment 0');
assert.strictEqual(sequential.warnings.filter((w) => /still running/.test(w)).length, 0);

// ---- Phase 3: the shared pixel segment rule --------------------------------------------
// firmware-verdicts-unified.json comes from firmware that carries the same rule
// (new_showduino shdoAllocatePixelSlot). Against that firmware nothing is canonicalised:
// segment numbers must be identical, for the 21 original shows and the segment cases.
const { SEGMENT_FIXTURES } = require('./fixtures/p4-parity/shows.cjs');
const unified = require('./fixtures/p4-parity/firmware-verdicts-unified.json');
const allNames = [...Object.keys(FIXTURES), ...Object.keys(SEGMENT_FIXTURES)];
assert.deepStrictEqual(Object.keys(unified.cases).sort(), allNames.slice().sort(), 'every show has a verdict from the unified firmware');
let exact = 0;
for (const name of allNames) {
  const plan = ShowduinoDeploy.compileShdoForStage(exportShow(name));
  const firmware = unified.cases[name];
  assert.strictEqual(plan.ok, firmware.status === 'OK', `${name}: Studio ${plan.ok ? 'accepts' : 'refuses'}, unified firmware returns ${firmware.status}`);
  if (!plan.ok) continue;
  assert.deepStrictEqual(plan.commands.map((c) => `${c.timeMs} ${c.command}`), firmware.cues, `${name}: commands and segment numbers differ from the unified firmware`);
  assertNoSegmentCollision(firmware.cues.filter((line) => !/DURATION:0$/.test(line)), `${name} (unified P4)`);
  exact += 1;
}
const segmentsUsed = (name) => [...new Set(ShowduinoDeploy.compileShdoForStage(exportShow(name)).commands.filter((c) => /:RANGE:/.test(c.command)).map((c) => Number(/SEGMENT:(\d+)/.exec(c.command)[1])))];
assert.deepStrictEqual(segmentsUsed('segments-explicit-distinct'), [2, 5], 'chosen segments are honoured');
assert.deepStrictEqual(segmentsUsed('segments-explicit-conflict'), [3, 0], 'a busy chosen segment moves the later cue');
assert.deepStrictEqual(segmentsUsed('segments-explicit-reuse-after-end'), [4], 'a segment is reused once its cue has ended');
assert.deepStrictEqual(segmentsUsed('segments-hold-then-timed'), [0, 1], 'a cue with no duration keeps its segment for the rest of the show');
assert.deepStrictEqual(segmentsUsed('segments-no-param-sequential'), [0, 1, 2], 'cues with no segment field keep the old 0, 1, 2 numbering');
assert.deepStrictEqual(segmentsUsed('segments-independent-outputs'), [0], 'each output has its own segments');
assert.strictEqual(segmentsUsed('segments-sixteen-simultaneous').length, 16);
{
  const refused = ShowduinoDeploy.compileShdoForStage(exportShow('segments-seventeen-simultaneous-refused'));
  assert.strictEqual(refused.ok, false, '17 simultaneous cues on one output are refused');
  assert.ok(refused.errors.some((e) => /more than 16 pixel segment slots/.test(e)));
  const hold = ShowduinoDeploy.compileShdoForStage(exportShow('segments-timed-then-hold'));
  assert.ok(hold.commands.some((c) => c.timeMs === 2000 && c.command === 'PIXEL:SEGMENT:0:DURATION:0'), 'a held cue on a reused timed segment clears the old duration');
  const conflict = ShowduinoDeploy.compileShdoForStage(exportShow('segments-explicit-conflict'));
  assert.ok(conflict.warnings.some((w) => /segment 3 .* still running "First on three"/.test(w)), 'a genuine conflict names both cues');
  const clean = ShowduinoDeploy.compileShdoForStage(exportShow('segments-explicit-distinct'));
  assert.strictEqual(clean.warnings.filter((w) => /still running/.test(w)).length, 0, 'no warning when nothing conflicts');
  // Emergency signage cannot be reached from a lighting cue on any output.
  for (const name of allNames) {
    for (const c of ShowduinoDeploy.compileShdoForStage(exportShow(name)).commands) {
      assert.ok(!/^(EMERGENCY|SHOW:|PRODUCTION:)/.test(c.command) && (!/^ESTOP/.test(c.command) || /^ESTOP:NODE:PIXEL:SEGMENT:\d+:/.test(c.command)), `${name}: "${c.command}" is not a control command`);
    }
  }
}
console.log(`Unified segment rule: ${exact} shows compile to identical commands and segment numbers (firmware ${unified.firmware.ref} @ ${unified.firmware.commit.slice(0, 7)}, host compile).`);

console.log(`Studio/P4 compiler parity passed: ${accepted} shows compile to the same commands, ${refused} are refused by both (firmware ${verdicts.firmware.ref} @ ${verdicts.firmware.commit.slice(0, 7)}, host compile).`);
