# Studio — physical device test checklist

Automated tests run in Chromium with touch emulation (`tests/browser/*.cjs`). They do **not**
prove behaviour on real phones and tablets, especially iPad Safari. Work through this list on
real devices before launch, and record the device, OS and browser version for every row.

Open `https://show-duino.com/studio` in each browser. Hard-refresh first so the latest
JavaScript is loaded.

## Devices to cover

| # | Device class | Example | Browser |
|---|---|---|---|
| D1 | iPad (portrait and landscape) | iPad 10th gen / iPad Air | Safari |
| D2 | Android tablet | Samsung Galaxy Tab | Chrome |
| D3 | iPhone | any iOS 17+ | Safari |
| D4 | Android phone | any Android 13+ | Chrome |
| D5 | Touchscreen laptop (touch and mouse) | Windows touch laptop | Chrome or Edge |
| D6 | Desktop with mouse | Windows / macOS | Chrome, Firefox, Safari |

## Timeline (tablets D1, D2, D5)

| ✓ | Step | Expected |
|---|---|---|
| ☐ | Swipe sideways over a cue you have not selected | Timeline scrolls; the cue does not move |
| ☐ | Tap a cue | It is selected; the Inspector slides in from the right |
| ☐ | Drag the selected cue sideways, then onto another lane | It follows the finger; the timeline does not scroll |
| ☐ | Drag the selected cue's right edge, then its left edge | Trims the end, then the start; the other end stays put |
| ☐ | Turn Snap on and drag a cue | It lands on the grid |
| ☐ | Press Undo, then Redo | The drag is reverted, then reapplied |
| ☐ | Pinch out and pinch in on the timeline | Timeline zooms around your fingers; the page itself does not zoom (watch on iPad Safari) |
| ☐ | Lock a lane and try to drag its cue | Nothing moves |
| ☐ | Close the Inspector with × | It slides away and the timeline gets the full width |
| ☐ | Rotate the tablet with the Inspector open | Layout recovers; nothing is cut off |
| ☐ | Touch laptop: use the mouse, then a finger | Both work; the mouse behaves as before |

## Phone (D3, D4)

| ✓ | Step | Expected |
|---|---|---|
| ☐ | Open any public page, then tap **Menu** | Menu opens; links are easy to tap; Escape or an outside tap closes it |
| ☐ | Open Studio | The phone cue list loads (not the desktop timeline) |
| ☐ | Add a cue, edit it with the on-screen keyboard open, save | The edit panel stays visible above the keyboard; the cue is saved |
| ☐ | Sounds panel: import a WAV from Files / Downloads | Listed with an Audio Node badge; Preview plays |

## Sounds panel (all devices)

| ✓ | Step | Expected |
|---|---|---|
| ☐ | Import a 16-bit 44.1 kHz WAV, a 24-bit WAV and an MP3 | First is marked playable on the Audio Node; the others are marked as won't play |
| ☐ | Select an audio cue, then press "Use in selected cue" | The cue's file name changes to the imported file |
| ☐ | Reload the page | The imported sounds are still listed (stored in this browser only) |
| ☐ | Copy the same WAV onto the Audio Node SD card under `/showduino/audio/`, connect on the local network, open "Sounds on your Showduino" | The file is listed from the device (requires a bench Audio Node) |

## Desktop regression (D6)

| ✓ | Step | Expected |
|---|---|---|
| ☐ | Drag, trim, then Ctrl+Z | Each change is undone |
| ☐ | Import `new_showduino/examples/productions/first-audio-test.shdo`, edit, export, re-import | Same cues come back |
| ☐ | Sign in, save to cloud, sign out | Account page shows signed in, then signed out |
| ☐ | Inspector at 1280 px and wider | Fixed column on the right, as before |

## Recording results

Add a row per device to `docs/WEBSITE_ACCEPTANCE_RESULTS.md` with: date, device, OS, browser,
which rows passed, and a screenshot or short screen recording of any failure.
