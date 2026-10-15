# Showduino — first-time-owner experience

The product test is simple: a person who builds a Halloween prop but has never used show-control software should create and run a small show without writing code, JSON or manual network commands.

## Golden path (target)

1. **Plug in** the Showduino Director/Base, power the required nodes and connect the Communications S3 to local Wi-Fi.
2. **Find my Showduino:** the website shows the locally discovered Communications S3 and the authoritative P4 status. Discovery must not invent links or device states.
3. **What have you connected?** show plain-language cards with photos/roles for LED strips, Show Audio, low-voltage outputs and triggers. Advanced logical IDs stay behind a details control, but must be accurately stored.
4. **Build my first show:** name a scene, select a starter atmosphere, choose what happens (light flicker, WAV sound, prop pulse), then show an easy preview.
5. **Check and deploy:** verify selected device IDs, output wiring, files, capabilities and safety. Persist the canonical SHDO v2 document to P4 storage. Show a receipt only after P4 confirmation. Loading, starting and stopping are separate operations.
6. **Run it:** start from Director or P4-authorized controls; web disconnection must never stop a running P4 show. Emergency overrides any show.

## Current implementation

- [x] First Show wizard in Studio (desktop Dashboard and mobile Projects).
- [x] Create real SHDO v2 tracks, cues, device bindings, scene and saved project.
- [x] Preserve standard advanced timeline, browser preview and .shdo export.
- [x] No node auto-discovery claims; unknown hardware cannot be marked online.
- [x] MOSFET starter pulses enforce safe OFF and emergency remains P4-owned.
- [x] Automated test confirms SHDO v2 round trip and cue routing.
- [ ] Guided LAN discovery and verification against the user's powered-on S3/P4.
- [ ] Real node model/name/capability inventory from authoritative API instead of typed IDs.
- [ ] Integrated asset upload/check for audio and previews.
- [ ] End-to-end browser-to-P4 deploy acknowledgment with secure LAN transport from public HTTPS.
- [ ] Physical hardware bench test across Director, Comms, P4 and specialist nodes.
- [ ] Usability sign-off with a genuine first-time builder.

## Rules

- Default to plain language (for example, **Stage LED strip** rather than **GPIO23**); include technical details only when helpful.
- Protect existing projects from accidental overwrites; always retain a local .shdo export.
- No fake connected, deployed, or emergency-cleared statuses.
- No show should require the public website, cloud, Director or Wi-Fi to continue running.
- Never silently auto-start a show after saving or deployment.
- Existing P4, Comms and specialist-node firmware remains authoritative.

## Beginner acceptance scenario

A new owner has the main Showduino, a 10-pixel LED strip, and no audio node. Starting with a blank Studio, they select **First Show**, name a Halloween scene, select **main LED strip**, choose **Flicker**, and press **Create my show**. They should get a saved, valid SHDO v2 project and a previewable timeline without encountering code or JSON. Export should produce the exact same SHDO v2 document that Advanced Studio uses.

The owner should be clearly informed that a valid project is **not** proof that the P4 has accepted or loaded it. The final connected deployment flow is not considered finished until an actual P4 confirmation is shown.
