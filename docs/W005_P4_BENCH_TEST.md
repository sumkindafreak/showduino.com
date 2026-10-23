# W005 bench test: website Studio export → P4 Show Engine

**Status: not yet run.** Nothing in this file has been tested on hardware. Record results in the table at the end. Do not describe the export → Persist to SD path as working until every row passes.

## Why this test exists

The W005 audit compiled website Studio exports with the firmware's own SHDO compiler on a host computer. Every export was refused (`invalid clip object`) because of a parser bug in `protocol/showduino_shdo.h`. Two firmware changes fix the host results:

- new_showduino PR #35: `action.value` parsed exactly once.
- new_showduino PR #36: an over-long command is refused instead of silently cut short.

Host results show the code is right. They do not prove the P4 build on the bench behaves the same, so this physical test is required.

## Before you start

| Item | Record |
| --- | --- |
| P4 firmware commit (must include PRs #35 and #36) | |
| S3 Communications Controller firmware commit | |
| Audio Node firmware commit | |
| Website commit used for Studio (must include `js/studio-firmware-limits.js`) | |
| SD card free space | |

- Isolated bench only. No guests, no unprotected loads.
- Physical emergency control wired and tested first, per `docs/manual/SHOWDUINO_PRE_OPENING_CHECKLIST.md` in new_showduino.
- Put `thunder.wav` and `scream.wav` in `/showduino/audio/` on the Audio Node SD card.

## Test files

Make each in website Studio, then **Export .shdo**. Check **Diagnostics** before exporting; each file's expected Diagnostics result is listed.

| # | File | How to make it | Diagnostics | Expected P4 result |
| --- | --- | --- | --- | --- |
| 1 | `w005-basic.shdo` | P4 pixel cue LIGHTNING at 0 ms (pixels 0–29), Audio Node `thunder.wav` at 1000 ms, Audio Node `scream.wav` at 6000 ms | All P4 checks OK | Persists; Load shows 3 cues' worth of runtime commands; outputs fire at the authored times |
| 2 | `w005-16-pixel.shdo` | 16 pixel cues on the P4 pixel line, 1 s apart | OK | Persists and runs |
| 3 | `w005-17-pixel.shdo` | 17 pixel cues on the P4 pixel line | **Error: Pixel segment slots** | P4 refuses (`TOO_MANY_CUES`); nothing installed |
| 4 | `w005-long-audio.shdo` | One audio cue whose file name is 48 characters | **Error: P4 compatibility** | P4 refuses (`COMMAND_TOO_LONG`); nothing installed |
| 5 | `w005-60-audio.shdo` | 60 audio cues; Studio Log says "Exported without spacing" | OK, file under 48 KB | Persists and loads |
| 6 | Old file | Any `.shdo` exported before W005 and already persisted | — | Re-import into Studio keeps its production ID; re-persist **updates** the same production rather than adding a second one |

## Steps for each file

1. Open the S3 local console → **Productions → Persist SHDO v2 to P4 SD**.
2. Choose the file → **Persist to SD**. Record the P4's reply exactly.
3. For files that should persist: select the production → **Load**. Confirm the P4 reports it loaded. It must **not** start by itself.
4. On the Director, **LIVE → START**. Watch and time the outputs (phone video with a visible clock is enough).
5. Press the physical emergency control during playback. Expected: playback stops, pixels go bright white, show does not resume when the input is released, manual clear required.
6. Record the result and any serial log lines below.

## Results

| # | Persist reply | Loaded? | Outputs at the right times? | Emergency behaved? | Tester, date |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |

When every row passes, update `docs/WEBSITE_RELEASE_CHECKLIST.md` (W-002 / W5-03) with the firmware commits and this file's results.
