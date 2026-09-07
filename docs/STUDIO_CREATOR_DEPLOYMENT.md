# Showduino Studio v4 creator/deployment contract

`show-duino.com/studio.html` is the production creator. It can create, preview, save, cloud-sync, import and export `.shdo` projects without a physical Showduino connected.

Studio is **not** part of the live runtime path. A running show must not depend on the browser, Studio, Wi-Fi, the Director or the public Internet.

## Current system roles

The production architecture is:

`Director (ESP32-S3) -> ESP-NOW -> S3 Communications Controller -> UART -> ESP32-P4 Show Engine -> Specialist Nodes`

Responsibilities are deliberately separated:

- **Director** — operator requests and state display.
- **S3 Communications Controller** — message transport only; ESP-NOW <-> UART bridge.
- **ESP32-P4 Show Engine** — authoritative runtime, state, safety, timeline, cue dispatch and local project/assets.
- **Specialist Nodes** — relay, MOSFET, pixel and audio work commanded by the P4, with completion/state reporting as the target behaviour.

## Studio authoring scope

Studio v4 offers new authoring for:

- Audio cues
- Relay cues
- MOSFET cues
- Segmented pixel cues
- General practical-FX cues
- Trigger/event cues

Pixel cues store the target line and a logical segment definition. A segment can be a normal `startPixel + length` range or a repeating marker pattern such as one active pixel inside every 10-pixel emergency-sign group. Pixel effects are reusable authoring presets; emergency override is not one of them.

DMX, legacy generic lighting and old prop clip types can remain readable when importing older project files, but Studio v4 does not offer new authoring for them. DMX is deliberately outside the current Showduino implementation scope.

## Emergency rule

Emergency state is owned by the P4 safety runtime, not Studio. It interrupts normal show effects, latches, and overrides all pixel outputs to bright white. Clearing the initiating condition does not automatically resume the show.

Studio may visually demonstrate this rule, but it cannot author, clear or defeat it as a normal cue.

## `.shdo` v2 package

The `.shdo` payload remains JSON. Studio v4 package metadata identifies:

- format: `showduino-production`
- package version: `2`
- architecture: `director-comms-p4-nodes`
- runtime authority: `esp32-p4-show-engine`

Projects also carry current architecture metadata, tracks, clips, markers, routing data and any available assets/settings. Output routing uses logical node device IDs rather than hard-coded ESP-NOW MAC addresses.

Studio migrates older compatible projects into the v2 data model before writing a v2 package. Legacy clips are preserved instead of silently deleted.

## Deployment behaviour

Direct installation is **capability-gated**.

Studio may probe a local Showduino system only when the browser permits private-network access. A local device must explicitly identify itself as a P4/Show Engine role and advertise a production-import capability before Studio will POST a project to `/api/production/import`.

If any of the following is true, Studio exports the exact same `.shdo` project instead of claiming installation succeeded:

- the HTTPS browser blocks direct local HTTP/private-network access;
- no local Showduino answers the probe;
- a Showduino answers but does not advertise production import;
- the current P4 Web/API layer has not yet implemented that capability.

This fallback is intentional. The creator can keep working before the final P4 import API exists, and Studio never fakes a successful deployment.

## Authoring validation

Before deployment Studio can check the production for issues such as:

- output cues without logical node IDs;
- audio clips without a file reference;
- pixel segment/group problems;
- relay or MOSFET cues that do not request safe-OFF stop behaviour;
- imported legacy/out-of-scope clip types;
- ambiguous track names.

These are project checks only. P4/node commissioning and live hardware diagnostics remain separate from browser authoring validation.
