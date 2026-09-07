# Studio v4 PR notes

This branch is the current-system Studio revamp.

Key review points:

- browser Studio remains creator/preview only;
- P4 is explicitly described as runtime authority throughout the shell;
- new authoring is limited to Audio, Relay, MOSFET, Pixel, FX and Trigger cues plus Mixed lanes;
- DMX/generic Lighting/Prop are import-compatible legacy types only;
- Pixel FX Lab provides 25 effects plus arbitrary range segments and repeating marker groups;
- emergency white is shown only as a locked system override, never as a timeline cue;
- `.shdo` package format is v2 and older compatible data migrates before export;
- deployment requires an explicitly advertised P4 production-import capability and otherwise exports the same `.shdo` package;
- project diagnostics check logical routing, audio references, pixel data, safe-output settings and legacy clips;
- mobile preset insertion understands the new cue metadata;
- the new validation workflow checks JavaScript syntax, local Studio asset references and current-scope preset requirements.
