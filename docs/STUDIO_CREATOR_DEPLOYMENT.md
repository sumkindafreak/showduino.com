# Showduino Studio v4 creator/deployment contract

`show-duino.com/studio.html` is the production creator. It can create, preview, save, cloud-sync, import and export `.shdo` projects without a physical Showduino connected.

Studio is **not** part of the live runtime path. A running show must not depend on the browser, Studio, Wi-Fi, the Director or the public Internet.

Reviewed 20 October 2026 against firmware `f4c9aeaabdcf939417f9891fb01d98e1e5d8aec2` and website `41d3c753491a60212b855019712d342e1eed030c`.

## Current system roles

The production architecture is:

`Director (ESP32-S3) -> ESP-NOW -> S3 Communications Controller -> UART -> ESP32-P4 Show Engine -> Specialist Nodes`

Responsibilities are deliberately separated:

- **Director** — operator requests and state display.
- **S3 Communications Controller** — message transport only; ESP-NOW <-> UART bridge.
- **ESP32-P4 Show Engine** — authoritative runtime, state, safety, timeline, cue dispatch and local project/assets.
- **Specialist Nodes** — Audio, S3 Lamp, Pixel, Emergency and software-implemented MOSFET roles with separate physical acceptance. Relay is legacy; editable cue types do not establish a supported installed device.

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

## Website Studio → installed production

1. Open [Website Studio](https://show-duino.com/studio.html). Create a show, use **Create my first show** if helpful, then build and preview a simple Pixel or Audio cue. Save locally and export a `.shdo` backup. Browser preview does not operate the hardware.
2. In **Deploy**, save the **Communications S3** LAN address (not the P4 address). Use the same local network. A saved IP, a creator/cloud label or a lit screen does not verify the P4 or any Node.
3. On the public HTTPS website, **Prepare for P4** prepares a file. Use **Open Local Console** for the S3-hosted interface. Browser private-network/mixed-content restrictions may prevent website verification even when the local console works.
4. In that console, open **Productions → Persist SHDO v2 to P4 SD**, choose the exported file and select **Persist to SD**. Wait for the P4 result. Persistence compiles only supported cues; a rejected file is not installed. Copying an editable SHDO onto SD is not this deployment process.
5. Persisting does **not** load or start the production. Select the intended production and **Load**, verify P4-confirmed loaded state, then use the Director **LIVE → START** when the test area is ready.
6. Confirm actual Node outputs, stop behaviour and Emergency/recovery on isolated test loads. Save the firmware identifiers and physical test results before guest operation.

Public Studio, the embedded `/studio/` snapshot and the S3 system console can be different builds. The local console's **Persist to SD** workflow writes SD; `/api/studio-timeline` is a separate temporary RAM commissioning path and does not persist a production.

### Accounts, membership and indicators

A free Showduino ID provides community/account access; optional Starter, Pro and Studio memberships are proposed, with no published feature/price promise or payment activation. Hardware-owner entitlements are separate and require confirmed terms; registering a browser inventory entry does not activate access or prove a device is connected. Existing Studio authoring tools remain available without paid membership.

Website hardware status starts **HARDWARE NOT VERIFIED**. **S3 CONNECTED** requires a ready Showduino capability response at the configured/local address; it establishes S3 reachability only. **P4 · NOT VERIFIED** does not establish runtime health. Check authoritative P4 and required Node states in the Director/local console. **LOCAL** describes saving, and **CREATOR · TESTING** describes browser mode.

## Authoring validation

Before deployment Studio can check the production for issues such as:

- output cues without logical node IDs;
- audio clips without a file reference;
- pixel segment/group problems;
- relay or MOSFET cues that do not request safe-OFF stop behaviour;
- imported legacy/out-of-scope clip types;
- ambiguous track names.

These are project checks only. P4/node commissioning and live hardware diagnostics remain separate from browser authoring validation.
