# Showduino Studio v4 — current feature map

This document is the concise feature inventory for the current Studio creator.

## Main workspaces

- **Dashboard** — project stats and current Director -> Comms -> P4 -> Nodes architecture.
- **Timeline** — DAW-style tracks, drag/drop cue library, snapping, markers, clip inspector, preview and autosave.
- **Pixel FX Lab** — reusable segmented pixel effects and emergency-rule visualisation.
- **Audio** — project/show audio asset management.
- **Projects** — local `.shdo` projects and optional cloud sync.
- **Deploy** — readiness summary and capability-gated P4 installation/export.
- **Nodes** — authored logical device-ID map and current hardware-role reference.
- **Diagnostics** — project authoring validation before deployment.
- **Settings / Help** — Studio configuration and current-system guidance.

## Current authoring track/cue types

- Mixed Lane
- Audio
- Relay
- MOSFET
- Pixel
- FX
- Trigger

Legacy DMX, generic Lighting and Prop clips can be preserved when importing older files but cannot be newly authored in Studio v4.

## Pixel FX library

Studio v4 ships with 25 pixel effects:

1. Solid
2. Fade
3. Pulse
4. Breathe
5. Flash
6. Strobe
7. Lightning
8. Flicker
9. Fire
10. Ember
11. Sparkle
12. Twinkle
13. Chase
14. Comet
15. Scanner
16. Meteor
17. Colour Wipe
18. Theatre Chase
19. Wave
20. Ripple
21. Rainbow
22. Confetti
23. Red / Blue
24. UV Flicker
25. Blackout

Pixel clips support:

- pixel line selection;
- named logical segments;
- normal start-pixel + length ranges;
- repeating marker groups such as pixel 0 of every 10-pixel emergency-sign block;
- primary/secondary colour;
- brightness, speed and fade parameters;
- blackout-at-end behaviour;
- browser visual preview.

Emergency-white is **not** an effect in this library. It is a locked P4 safety override across every pixel.

## `.shdo` v2

Studio v4 writes package version 2 and stamps the current architecture/runtime authority into the project. Compatible older projects are migrated before export, including translating older pixel `count` data into the new segment-length model.

## Validation

The repository includes `.github/workflows/studio-validate.yml`, which syntax-checks the Studio JavaScript, verifies referenced local assets exist, and checks key current-scope requirements when Studio changes are pushed or reviewed.
