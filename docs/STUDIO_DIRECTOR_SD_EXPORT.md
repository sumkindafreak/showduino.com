# Director SD package export (initial compatibility release)

Studio's desktop overflow menu and mobile Projects panel now offer **Export Director SD Package (.zip)**, separate from the unchanged **Export .shdo** authoring export.

Extract all four files into `/showduino/shows/packages/<show.json id>/` on the Director SD card, using a new folder or backing up the existing one first. The ZIP contains the canonical project, show.json, cues.json and timeline.json. The two command arrays are identical, the metadata counts runtime commands, and the last runtime marker fixes the intended end time. Audio STOP is explicit. Audio assets are not bundled.

The offline Director SD exporter supports the existing Studio PIXEL, AUDIO:NODE and addressed MOSFET compiler paths. Browser live timeline upload remains restricted to its existing PIXEL/AUDIO allowlist. Unsupported enabled clips, authoring-only projects, overlapping timed audio, disabled-track/device conflicts and invalid times are rejected. Disabled clips are reported and remain in the SHDO. Commands are limited to 63 ASCII characters and 2048 total including termination commands. No firmware is changed, no upload or start is performed, and the P4 retains emergency authority. This is distinct from the newer P4 persistent production import workflow.

Verify paths, node binding and pixel ranges against actual hardware. Ensure the authored final pixel state is appropriate. A successfully exported ZIP is not evidence of successful deployment or safe operation. Bench acceptance: extract a new package; verify Director discovery and metadata, load and confirm Stage cue count, run with safe bench outputs, verify emergency handling and repeat playback. Do not replace a working production until these checks pass.

Automated checks: `node tests/studio-director-export.test.cjs` (also wired into Studio validation CI). Physical acceptance and browser ZIP download testing remain required.

## MOSFET Node settings and commissioning

Use a MOSFET track (desktop) or Powered output (mobile). Enter the actual commissioned logical ID (MOSFET-01 through MOSFET-08); select OUT1–OUT4, Hold/Pulse/Fade, level 0–100%, duration and applicable pulse/fade times. A pulse must fit the cue; combined fade times must fit the cue. Overlaps on the same physical node/output, invalid settings and disabled safe OFF are refused by SD export; different outputs may overlap. Each authored output receives a final explicit OFF. Use the Director SD ZIP path, not browser live upload. No node configuration or command is transmitted by exporting.

Source compatibility checked against firmware repository new_showduino commit 83f21db5ead2f53576fa671b60aa7544650a0a45: Director timeline delivery, P4 ShowRuntimeOwner handleTlCue, timelineDispatchCommand and MosfetNodeLink. Actual flashed firmware and loads remain unverified. Test all four channels on safe bench loads, hold/pulse/fade, emergency and STOP, then repeat playback before using a production.

## Deferred: Lamp Node V3

TODO: compile and bench-test ESP32-C3, seven NeoPixels and physical pushbutton; verify standalone/group operation, node identity, P4 authorisation and emergency response; define the supported command contract; then add Lamp authoring, diagnostics and SD compiler tests. Enabled lamp cues remain rejected by SD export until that work is complete.
