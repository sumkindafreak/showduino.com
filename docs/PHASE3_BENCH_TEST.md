# Phase 3 bench test: Studio export to the P4 Show Engine

**Status: not run.** Everything in Phase 3 was checked on a host computer. Nothing here has
been done on hardware. Fill in the result column; do not call the path working until it is full.

## Rules

- Isolated bench. No guests, no unprotected loads, MOSFET outputs on a dummy load.
- Test the physical emergency control first (step 0). Stop if it fails.
- Flash nothing from an unreviewed branch onto the show P4. Use a bench P4.
- Keep the current working SD card aside; use a copy.

## Record before starting

| Item | Value |
|---|---|
| P4 firmware branch and commit | |
| Does it include firmware PR 63 (parser fix)? PR 64 (segment rule)? | |
| Communications S3, Audio Node, MOSFET Node, Pixel Node, Emergency Node firmware commits | |
| Website commit used for Studio | |
| Date, operator | |

## Steps

| # | Do | Expect to see | Serial log to look for | Result |
|---|---|---|---|---|
| 0 | Press the physical emergency control with nothing loaded. Clear it with the approved two-step sequence | All show pixels white; outputs safe; after clearing, pixels off and nothing resumes | `[PIXEL] GLOBAL EMERGENCY OVERRIDE → ALL P4 SHOW PIXELS WHITE`, then `Emergency override cleared → show pixels remain OFF` | |
| 1 | In website Studio make show **B1**: P4 pixel cue LIGHTNING 0–2 s on pixels 0–29; Audio Node `thunder.wav` at 1 s for 4 s. Diagnostics all OK. Export `.shdo` | File downloads; Studio Log has no errors | — | |
| 2 | Persist B1 to SD through the commissioning page | Commit succeeds; nothing starts by itself | No `INVALID_JSON`. (On firmware without PR 63 this step fails with `invalid clip object`: stop and record it) | |
| 3 | `PRODUCTION:LIST`, then `PRODUCTION:LOAD:<id>` | B1 is listed and loads | `PRODUCTION:ITEM:<id>`, `PRODUCTION:LOAD:OK:<id>` | |
| 4 | `SHOW:START`, let it finish | Pixels flash at 0 s and go dark at 2 s; thunder plays 1–5 s and stops | `SHOW:START:OK`; cue times in the timeline log match 0, 1000, 2000, 5000 ms | |
| 5 | Show **B2** (simultaneous pixels): cue A 0–6 s pixels 0–9 green; cue B 2–6 s pixels 10–19 blue; cue C 8–10 s pixels 0–9 red. Persist, load, start | 0–2 s only green; 2–6 s green **and** blue together; 6–8 s dark; 8–10 s red on 0–9 only, blue stays dark | Segment commands for A and B use different segment numbers | |
| 6 | Run B2 again by live upload from Studio instead of Persist | Same visible result as step 5 | Studio Log warning that B uses another segment because A is still running | |
| 7 | Show **B3** (MOSFET, dummy load): OUT1 hold 100% 1–3 s; OUT2 50% 0–1.5 s; OUT3 pulse 500 ms at 4 s; OUT4 fade in 1 s to 80%, hold, fade out 1 s over 6–10 s. Persist, load, start | Each output does exactly that and is OFF at the end | `MOSFET:NODE:MOSFET-01:OUT:n:` LEVEL / PULSE / FADE / OFF at those times | |
| 8 | Start B2. At about 3 s press the emergency control | Timeline pauses; all show pixels white at once; audio and MOSFET outputs go to their safe state | Emergency override line as in step 0 | |
| 9 | Clear emergency with the approved sequence. Wait 30 s | Pixels off. **The show does not resume.** `SHOW:RESUME` or `SHOW:START` is needed and works only after clearing | `show pixels remain OFF`; no cue fires on its own | |
| 10 | Start B1. At 1.5 s send `SHOW:STOP` | Pixels dark, audio stops, no later cue fires | `SHOW:STOP:OK` | |
| 11 | Start B1. Power off the Audio Node at 0.5 s, power it on at 3 s | Pixels unaffected; show continues; node rejoins; next audio cue plays if one remains | Node offline then online lines; no P4 restart | |
| 12 | Start B2. Power off the Communications S3 for 5 s | Loaded P4 timeline keeps running P4 pixels; Director shows link lost then recovers | No emergency unless the firmware defines one for this case: record what happens | |
| 13 | Try to persist a show with a 48-character audio file name | Refused; nothing installed | `COMMAND_TOO_LONG` | |
| 14 | Re-load a production persisted **before** this firmware | Loads and runs as it did | `PRODUCTION:LOAD:OK` | |

## Pass criteria

Steps 0, 8 and 9 must pass before any other result counts. Steps 2–7 and 10 must pass for the
Studio-to-P4 path to be called verified. Steps 11–14 are recorded; a failure there is a defect
to file, not a reason to mark the others failed.
