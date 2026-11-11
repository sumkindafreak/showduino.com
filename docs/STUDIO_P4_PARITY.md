# Studio and the P4 Show Engine: what has been checked

Status on 11 November 2026. Host computer results only. **Nothing here was run on a P4.**
`docs/W005_P4_BENCH_TEST.md` is still the test that decides whether a show runs.

## Two compilers

| Path | Compiler | Where |
| --- | --- | --- |
| Live upload from the browser (RAM timeline) | `compileShdoForStage()` | `js/studio-deploy.js` |
| Persist to SD (`.shdo` sent to the P4) | `shdoCompile()` | `new_showduino/protocol/showduino_shdo.h` |

`tests/studio-runtime-parity.test.cjs` exports 33 shows (21 original, 12 pixel segment cases) with Studio's packager and compares
the first compiler with what the second one returned for the same files
(`tests/fixtures/p4-parity/firmware-verdicts.json`).

## Firmware used

| Firmware ref | Commit | Result for website Studio exports |
| --- | --- | --- |
| `main` | `c23a801` | **Refuses every export** (`INVALID_JSON: invalid clip object`) |
| `integration/flashed-baseline-shdo-20261102` (PR 51) | `7e23730` | Compiles them. `firmware-verdicts.json` comes from this ref |
| `fix/phase3-shdo-studio-export-compat` (firmware PR 63, on `main`) | `f295f36` | Identical to the flashed baseline for all 21 shows |
| `feat/phase3-pixel-segment-policy` (firmware PR 64, on PR 63) | `cb4b73a` | Identical to Studio including segment numbers, 33 shows. `firmware-verdicts-unified.json` comes from this ref |

Why `main` fails, in order of discovery:

1. `action.value` was read and then a second value skipped. Every Studio clip has a value.
2. With only that fixed, overlapping clips compiled to cue times out of order, which the
   P4 timeline loader refuses. `qsort()` could also reorder clips that start together.
3. Over-long commands were cut short without an error.

Firmware PR 63 carries those three repairs for `main`, plus one more: `productionCannotDisable:
false` inside `safety.emergency`, where Studio writes it, was accepted.

One gap remains on `main` and PR 63: Emergency Node pixel cues compile, but that tree's
timeline loader has no `ESTOP` cue type, so such a show persists and is refused at load. The
flashed-baseline branch has the type.

## Checked and matching (same commands, same times, same order)

| Cue | Cases |
| --- | --- |
| Pixel on the P4 line | One cue; with blackout at end; with second colour, brightness, intensity, randomness, reverse |
| Pixel on a Pixel Node | `PIXEL:NODE:LED-01:` |
| Pixel on the Audio Node ring | `AUDIO:NODE:PIXEL:` |
| Pixel on the Emergency Node ring | `ESTOP:NODE:PIXEL:` |
| Audio Node | Play with volume and stop; loop; one-shot with no stop |
| MOSFET Node | Hold; level 50%; pulse; fade |
| Timing | Cues authored out of order; two cues at the same time keep their authored order; a disabled cue is skipped |
| Mixed show | Pixel, audio, MOSFET and Pixel Node together |
| Refused by both | Trigger, Relay, DMX |

Each accepted show also compiles to the same commands after export and re-import.

## Found and fixed in Studio

Two pixel cues that overlap on one output both compiled to segment 0, so the second replaced
the first on a live upload. The P4 gives each its own segment. Studio now moves the later cue
to the lowest free segment and says so in the deploy warnings.

## Pixel segments: one rule (Phase 3)

Studio and firmware PR 64 use the same rule:

1. A cue that names a segment gets it when it is free at the cue's start.
2. A cue with no `segment` field gets the next number on its output.
3. A segment still running an earlier cue is not replaced; the lowest free one is used, and
   Studio warns, naming both cues.
4. A cue with no duration holds its segment for the rest of the show.

Against PR 64 firmware the commands are identical, segment numbers included, for the P4 line,
a Pixel Node, the Audio Node ring and the Emergency Node ring.

Against firmware **without** PR 64 (including the flashed baseline) the old difference stands:
the P4 numbers segments by cue order and ignores the cue's `segment`. The visible result is
the same for the tested shows, but more than 16 pixel cues on one output cannot be persisted.
Diagnostics still reports that limit because it describes the firmware on the bench today.

The file format cannot tell a chosen segment 0 from the default 0. Under the rule they behave
the same, so the format is unchanged. Files with no `segment` field compile exactly as before.

## Not checked

| Item | Why |
| --- | --- |
| Any behaviour on real hardware | No P4 available to this work |
| What a node does with a command | Only command text and timing were compared |
| Lamp Node cues | The firmware compiles `LAMP:` cues; Studio has no Lamp cue type |
| The Communications S3 upload policy on a device | Compared in `tests/studio-firmware-upload-policy.test.cjs` against the header only |
| Audio files actually present on the Audio Node SD card | Needs the node |

## Re-running the firmware side

```bash
git clone https://github.com/sumkindafreak/new_showduino && cd new_showduino && git checkout <ref>
g++ -std=c++17 -w -I protocol -o /tmp/shdo_host <website>/tools/p4-parity/shdo_host.cpp
cd <website> && node tools/p4-parity/regenerate.cjs /tmp/shdo_host "<ref>" "<full commit>"
node tools/p4-parity/regenerate.cjs /tmp/shdo_host "<ref>" "<full commit>" unified   # only for firmware with PR 64
node tests/studio-runtime-parity.test.cjs
```

Re-run when `protocol/showduino_shdo.h` changes, and before each release.
