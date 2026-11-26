# Director SD package export (initial compatibility release)

Studio's desktop overflow menu and mobile Projects panel now offer **Export Director SD Package (.zip)**, separate from the unchanged **Export .shdo** authoring export.

Extract all four files into `/showduino/shows/packages/<show.json id>/` on the Director SD card, using a new folder or backing up the existing one first. The ZIP contains the canonical project, show.json, cues.json and timeline.json. The two command arrays are identical, the metadata counts runtime commands, and the last runtime marker fixes the intended end time. Audio STOP is explicit. Audio assets are not bundled.

The initial exporter intentionally supports only the existing Studio PIXEL and AUDIO:NODE compiler paths. Unsupported enabled clips, authoring-only projects, overlapping timed audio, disabled-track/device conflicts and invalid times are rejected. Disabled clips are reported and remain in the SHDO. Commands are limited to 63 ASCII characters and 2048 total including termination commands. No firmware is changed, no upload or start is performed, and the P4 retains emergency authority. This is distinct from the newer P4 persistent production import workflow.

Verify paths, node binding and pixel ranges against actual hardware. Ensure the authored final pixel state is appropriate. A successfully exported ZIP is not evidence of successful deployment or safe operation. Bench acceptance: extract a new package; verify Director discovery and metadata, load and confirm Stage cue count, run with safe bench outputs, verify emergency handling and repeat playback. Do not replace a working production until these checks pass.

Automated checks: `node tests/studio-director-export.test.cjs` (also wired into Studio validation CI). Physical acceptance and browser ZIP download testing remain required.
