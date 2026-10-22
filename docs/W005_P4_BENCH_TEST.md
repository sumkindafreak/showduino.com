# W005: P4 bench test for website Studio exports

**Status: not yet performed.** Host tests prove that the firmware's SHDO compiler accepts
website Studio exports once new_showduino PR #35 is merged. Nothing here has run on a P4.
Complete this before telling users that website exports install on hardware.

## What the host tests already prove

| Check | Evidence |
|---|---|
| A fresh website export (P4 pixels, Pixel Node `LED-01`, two Audio Node sounds) compiles to 28 cues with the expected commands and times | `tests/browser/studio-p4-limits.cjs` in CI with the firmware compiler built from new_showduino; `tools/production-tests/test_shdo.cpp` in new_showduino |
| 17 pixel cues on one device are refused (`TOO_MANY_CUES`), and Studio flags it first | Same tests |
| The old parser rejected every website export (`invalid clip object`) | Same fixtures fail on new_showduino `main` before PR #35 |
| Studio's RAM-timeline deploy only sends `PIXEL:` and `AUDIO:NODE:` families | `tests/studio-firmware-upload-policy.test.cjs` |

## Bench set-up

- P4 Show Engine flashed from new_showduino `main` **after** PR #35 is merged. Record the
  commit and the firmware version shown by the Director.
- Communications S3, Director, one Pixel Node (`LED-01`) with a short strip, one Audio Node with
  `thunder.wav` and `scream.wav` on its SD card, Emergency input wired and tested.
- Isolated test loads only. No people inside any moving or powered effect.

## Steps

1. In website Studio import `tests/fixtures/shdo/website-studio-export.shdo` (or build the same
   four cues) and export it. Project check must show **P4 production limits: OK**.
2. In the S3 local console: Productions → Persist SHDO v2 to P4 SD → choose the file → Persist.
   **Expect:** P4 accepts it. Record the reply.
3. Load the production (do not start). **Expect:** P4 reports it loaded, 28 runtime cues.
4. Director LIVE → START. **Expect:** P4 strip lightning at 0 s; Pixel Node fire at 0.5 s;
   thunder at 1 s for 4 s; scream at 6 s for 3 s.
5. Press Emergency during the show. **Expect:** timeline stops, pixel outputs go all white, no
   automatic resume after the input is released; recovery needs a manual clear.
6. Persist `tests/fixtures/shdo/website-17-pixel-clips.shdo`. **Expect:** rejected with a
   too-many-cues reason; nothing installed.
7. Export a show whose file is over 48 KB (Studio flags it). **Expect:** the P4 refuses it.

## Record

| Step | Result | Firmware commit | Date | Tester |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
