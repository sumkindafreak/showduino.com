# Showduino Website

Public website, creator tools and HauntSync workspace for Showduino.

## Current Showduino architecture

Showduino now uses four fixed hardware roles:

1. **Director — ESP32-S3 touchscreen**
   - Operator requests and system status.
   - Communicates over ESP-NOW.

2. **Communications Controller — dedicated ESP32-S3**
   - ESP-NOW ↔ UART transport bridge.
   - Does not own show logic or safety decisions.

3. **Show Engine — ESP32-P4**
   - Authoritative runtime for show state, safety, timeline and cue dispatch.
   - A running show must not depend on the Director, browser, Wi-Fi or internet.

4. **Specialist ESP32 Nodes**
   - Relay, MOSFET, pixel and audio roles.
   - Perform commanded work and report results/faults.

The earlier SUE / IAN / C3 bridge architecture is superseded. The onboard P4 C6 remains reserved/unused in the current design.

## Website structure

- `index.html` — public landing page
- `system.html` — current hardware/runtime architecture
- `studio.html` — Showduino Studio creator environment
- `hauntsync.html` — local project + hardware workspace
- `tools.html` — current hardware stack
- `aboutme.html` — Showduino project background
- `support.html` — current-system support and FAQ
- `css/site-pages.css` — shared public-site design system
- `js/site-motion.js` — Anime.js-powered public-site motion layer

## Motion

The public site uses **Anime.js 4.5.0** for presentation-only animations. Animation never participates in the live Showduino runtime. Reduced-motion preferences are respected.

## Current development scope

Current work focuses on:

- authoritative ESP32-P4 runtime
- persistent project/timeline storage
- relay and MOSFET node completion
- segmented NeoPixel effects and emergency-white override
- dedicated audio node support plus P4 system audio
- logical device addressing and completion/fault reporting
- Studio and HauntSync authoring/project workflows

DMX is deliberately outside the current implementation scope.

## Safety principle

Emergency behaviour is an override, not a show effect. The Show Engine owns emergency state and recovery rules; normal playback must not silently resume just because an initiating input has been released.

---

© 2026 Showduino
