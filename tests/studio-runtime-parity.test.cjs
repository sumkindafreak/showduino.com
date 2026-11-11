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
assert.ok(overlap.warnings.some((w) => /overlaps another cue/.test(w)), 'Studio says that it moved the cue');
// Cues that do not overlap keep the segment they asked for.
const sequential = ShowduinoDeploy.compileShdoForStage(exportShow('pixel-sequential-same-output'));
assert.ok(sequential.commands.every((c) => !/SEGMENT:[1-9]/.test(c.command)), 'sequential cues stay on segment 0');
assert.strictEqual(sequential.warnings.filter((w) => /overlaps another cue/.test(w)).length, 0);

console.log(`Studio/P4 compiler parity passed: ${accepted} shows compile to the same commands, ${refused} are refused by both (firmware ${verdicts.firmware.ref} @ ${verdicts.firmware.commit.slice(0, 7)}, host compile).`);
