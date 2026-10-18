# Studio audio integration (W004 phase 2)

How Studio decides whether an audio cue will play on the Audio Node, and what it can and
cannot confirm. Firmware references are to `sumkindafreak/new_showduino`, branch `main`.

## 1. File-name rule (matches the firmware)

`js/studio-audio-check.js` applies the same rule as `showduino_audio_resolve_path()` in
`protocol/showduino_audio_node.h`:

| Rule | Value |
|---|---|
| Folder on the SD card | `/showduino/audio/` (a cue may give `scream.wav` or `/showduino/audio/scream.wav`) |
| Characters | `A–Z a–z 0–9 _ - . /` only. **Spaces are refused.** |
| Refused sequences | `..`, `\`, `//` |
| Extension | `.wav` (any case), 16-bit PCM, mono or stereo, 8/16/22.05/32/44.1/48 kHz |
| Longest name the firmware accepts | 62 characters (79-character path limit minus `/showduino/audio/`) |
| Longest name in a timeline cue | 47 characters (`AUDIO:NODE:PLAY:<file>` must fit 63) |

`tests/studio-audio-check.test.cjs` holds 31 names whose expected results came from compiling
the firmware header with gcc and running `showduino_audio_resolve_path()`. Studio agrees with
the firmware on every name. It is stricter only for names that fit the firmware but not the
timeline command.

Before W004, Studio accepted names with spaces such as `My Scream.wav`. The Audio Node refuses those names (`BAD_PATH`), so the cue would have stayed silent at show time.

## 2. Cue status

Every audio cue has one of four states. You see it in:
- the Inspector, under the file field;
- the phone cue editor;
- **Sounds → Audio cues in this show**;
- the Studio log when you deploy or prepare a show.

| State | Meaning |
|---|---|
| **On Audio Node** | The Audio Node listed this file, and the time is shown. Names are compared case-insensitively, because the card is FAT. |
| **Only on this computer** | Imported into this browser's sound library but not seen on the device. Studio never copies sounds to the Showduino. |
| **Not confirmed** | Neither of the above. |
| **Will not play** | The Audio Node will refuse the name; the reason is shown. Deploy refuses such a cue. |

A file counts as on the Audio Node only when a device listing actually returned it. That listing is stored in this browser with its time. **Forget Audio Node list** returns every cue to unconfirmed.

`.shdo` export and import keep the cue's file name exactly, including case and sub-folder. `tests/browser/studio-audio-confirmation.cjs` verifies this.

## 3. What the current firmware does not provide (open items)

These are firmware or integration gaps. Studio reports them honestly and does not work around
them. No firmware was changed in W004.

| # | Gap | Evidence | Effect today |
|---|---|---|---|
| A1 | No firmware serves `/audio/list`, `/audio/upload` or `/audio/play`, which `js/api.js` calls | `git grep` over `firmware/` on `main` finds no such routes | **Sounds on your Showduino** reports that the firmware does not give Studio a file list. The legacy upload buttons (`js/audio_browser.js`, `app.js` `uploadAudio`) fail with HTTP 404 and say "Upload failed"; they never report success. **No cue can show On Audio Node with current firmware.** |
| A2 | The Audio Node's own `GET /api/library` returns `{"files":[...]}`, but it is on the Audio Node's address, not the Comms S3 that Studio talks to | `AudioWeb.cpp` `handleLibrary` | Studio could read it only if it knew the Audio Node address and that page allowed cross-origin requests. Not implemented. |
| A3 | The P4 receives `AUDIO:INVENTORY:` pages from the Audio Node and forwards them to the Director, but neither the P4 nor the S3 exposes them over HTTP | `AudioNodeLink.cpp`, S3 `ProtocolBridge.cpp` | A single S3 endpoint returning the last inventory (for example `GET /api/audio/inventory`) would let Studio confirm files. This needs a firmware change and bench testing. |
| A4 | The inventory lists at most 48 files and cuts names to 39 characters (`char names[][40]`). It only scans the card root and `ambience/`, `effects/`, `dialogue/`, `music/`, `stingers/`, `test/` | `AudioStorage.cpp` `collectDir` | Such files still play, but they can never be confirmed. Studio warns about long names and other folders. |

Recommended firmware follow-up, owner decision and bench test required:
- **A3:** have the S3 serve the cached inventory, with full names and a total count.
- **A4:** widen the inventory name buffer to 63 characters, or flag truncated entries.
- **A1:** once A3 exists, point `listAudioFiles()` at the real route, and remove or fix the legacy upload buttons. There is no upload route in firmware.

## 4. Verification

| Level | What |
|---|---|
| Automated (CI) | `tests/studio-audio-check.test.cjs` (firmware-derived names); `tests/studio-sounds.test.cjs`; `tests/browser/studio-audio-confirmation.cjs` (10 checks); `tests/browser/studio-device-filenames.cjs` |
| Compiled firmware comparison | Done once, locally, with gcc against firmware `main`; results embedded in the unit test |
| Real hardware | **Not done.** Bench check: put files on an Audio Node card, play cues with names from the table above, and confirm the refused ones log `BAD_PATH` |
