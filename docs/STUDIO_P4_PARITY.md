# Studio and the P4 Show Engine: what has been checked

Status on 11 November 2026. Host computer results only. **Nothing here was run on a P4.**
`docs/W005_P4_BENCH_TEST.md` is still the test that decides whether a show runs.

## Two compilers

| Path | Compiler | Where |
| --- | --- | --- |
| Live upload from the browser (RAM timeline) | `compileShdoForStage()` | `js/studio-deploy.js` |
| Persist to SD (`.shdo` sent to the P4) | `shdoCompile()` | `new_showduino/protocol/showduino_shdo.h` |

`tests/studio-runtime-parity.test.cjs` exports 21 shows with Studio's packager and compares
the first compiler with what the second one returned for the same files
(`tests/fixtures/p4-parity/firmware-verdicts.json`).

## Firmware used

| Firmware ref | Commit | Result for website Studio exports |
| --- | --- | --- |
| `integration/flashed-baseline-shdo-20261102` | `7e23730` | Compiles them. **Verdicts on file come from this ref.** |
| `fix/w005-shdo-command-truncation` (PR #36, open) | `e4df5e0` | Compiles them, same commands |
| `main` | `c23a801` | **Refuses every export** (`INVALID_JSON: invalid clip object`) |

`main` still has the parser fault that firmware PR #35 fixes: a cue's `action.value` is read
twice. A P4 flashed from `main` cannot persist any show exported by website Studio. This is a
firmware matter and was not changed here. Record which firmware is on the bench P4 before
testing.

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

## Known difference that remains

The P4 gives every persisted pixel cue the next segment number on its output and ignores the
`segment` stored in the cue. Studio's live upload uses the cue's `segment` and reuses a
segment once it is free. The visible result is the same for the cases above. Two consequences:

- More than 16 pixel cues on one output cannot be persisted (Diagnostics already reports this),
  but can be uploaded live.
- A show that relies on a particular segment number behaves differently on the two paths.

Deciding which rule is correct is a firmware and product decision.

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
node tests/studio-runtime-parity.test.cjs
```

Re-run when `protocol/showduino_shdo.h` changes, and before each release.
