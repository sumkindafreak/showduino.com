# Showduino Studio — Pre-Test Acceptance Checklist

This checklist is the repeatable gate before handing Showduino Studio to outside testers. It focuses on what a non-technical attraction user actually experiences while protecting the current Showduino architecture: Studio authors and previews production data; the ESP32-P4 remains runtime and safety authority.

## Test rules

- Run the checklist on at least one Android phone and one desktop browser.
- Start once from a completely empty production and once from an existing `.shdo` project.
- Do not explain the interface to the tester during the first pass. Record where they hesitate, mis-tap, or ask what a word means.
- A failure that risks lost work, corrupted timing, an invalid `.shdo`, misleading deployment state, or accidental live behaviour is a release blocker.
- Emergency behaviour is never authored as a normal cue. Any UI that implies otherwise is a blocker.

## 1. First-open comprehension

- [ ] Studio opens without console-breaking JavaScript errors.
- [ ] The tester can identify where to build a show without instruction.
- [ ] The tester understands that Studio creates the show and the P4 runs it.
- [ ] The empty-show state clearly tells the tester what to do first.
- [ ] Technical terms are not required for the first cue.
- [ ] DMX authoring is not exposed in the current Studio workflow.

Pass condition: a new tester can start building without being told where to click.

## 2. Mobile — build a simple show

Create a new production on a phone containing at least:

1. Sound at 00:00
2. Lighting at 00:03
3. Prop / Switch at 00:05
4. Pixels / LEDs at 00:08
5. Trigger at 00:12

Check:

- [ ] Add Cue is obvious and reachable one-handed.
- [ ] Cue choices use attraction-friendly names: Sound, Lighting, Prop / Switch, Pixels / LEDs, Trigger, Other Effect.
- [ ] Each cue editor explains only the controls relevant to that cue.
- [ ] Start time accepts simple seconds and timecode entry.
- [ ] “After previous”, +1 sec and +5 sec controls behave predictably.
- [ ] Saving a cue returns to the show sequence without losing the edit.
- [ ] Cue cards show useful time, action and routing information.
- [ ] The sequence remains usable with at least 20 cues.
- [ ] Scrolling does not accidentally edit or reorder cues.

Pass condition: the tester can build the five-cue show from the phone without opening the advanced timeline.

## 3. Mobile — reorder and recover mistakes

- [ ] Dragging the ↕ handle moves a cue earlier or later in the visible sequence.
- [ ] Reordering preserves the existing set of cue time slots rather than inventing random times.
- [ ] Tapping a cue still edits it; dragging the handle does not accidentally open the editor.
- [ ] Undo restores the state before the last cue edit or reorder.
- [ ] Redo restores the undone change.
- [ ] Undo/Redo never produces an invalid or empty project unexpectedly.
- [ ] Delete followed by Undo restores the cue.
- [ ] Duplicate followed by Undo removes only the duplicate.

Pass condition: common finger mistakes can be recovered without reloading or rebuilding the show.

## 4. Mobile keyboard and focus

Test on Android with the on-screen keyboard.

- [ ] Opening the keyboard does not close the cue editor.
- [ ] Typing a cue name does not lose focus between characters.
- [ ] Typing a Wi-Fi-independent project field does not trigger unwanted redraws.
- [ ] Numeric/time fields remain visible while typing.
- [ ] Closing the keyboard leaves the editor in the same state.
- [ ] Rotating the phone with no unsaved edit does not corrupt the project.

Pass condition: a full cue can be edited using only the phone keyboard without fighting the UI.

## 5. Mobile preview

- [ ] Preview clearly states that it is browser preview, not live runtime authority.
- [ ] Play, Pause and Stop work repeatedly.
- [ ] The time slider seeks reliably.
- [ ] Simultaneous cues are represented correctly.
- [ ] “Now” and “Next cue” remain sensible at boundaries.
- [ ] Preview ending does not alter authored cue times.

Pass condition: preview helps the tester understand the sequence without implying that it is the real P4 show engine.

## 6. Desktop — cue-first building

Using a mouse/trackpad:

- [ ] The Add Action shelf is visible without consuming most of the timeline.
- [ ] Sound, Lighting, Prop / Switch, Pixels / LEDs, Trigger and Other Effect are understandable without electronics knowledge.
- [ ] Clicking an action adds it at the playhead.
- [ ] Dragging an action visibly indicates valid and invalid target lanes.
- [ ] Dropping on a valid lane creates the cue at the intended time.
- [ ] Invalid drops do not silently create the wrong cue type.
- [ ] Empty lanes tell the user what belongs there.
- [ ] The timeline remains the dominant working area.

Pass condition: the interaction matches the obvious expectation that cue/action cards can be dragged onto the timeline.

## 7. Desktop — timeline editing

- [ ] Playhead movement is obvious.
- [ ] Dragging a cue changes its start time correctly.
- [ ] Vertical dragging only moves a cue to compatible tracks.
- [ ] Resize handles change duration without moving the wrong edge.
- [ ] Snap ON/OFF is predictable.
- [ ] Zoom and Fit remain available through Advanced tools.
- [ ] Selecting a cue opens the correct inspector.
- [ ] Editing inspector values updates the selected cue only.
- [ ] Undo and Redo buttons reflect whether history is available.
- [ ] Ctrl+Z and Ctrl+Y still match the visible Undo/Redo actions.

Pass condition: ten minutes of active editing produces no lost cues, unexplained jumps or broken inspector state.

## 8. Cue-specific authoring

### Sound

- [ ] Missing audio is clearly reported by Check Show.
- [ ] File path and volume remain after save/reload.
- [ ] Loop state remains after save/reload.

### Lighting / MOSFET

- [ ] Friendly “Lighting” language is shown to the user while the underlying cue remains compatible with the MOSFET model.
- [ ] Output, mode, level/duty and pulse settings remain after save/reload.
- [ ] Safe-off behaviour remains enabled unless deliberately changed.

### Prop / Switch / Relay

- [ ] Friendly prop/switch wording is shown without changing relay compatibility.
- [ ] Output, hold/pulse/toggle and pulse timing remain after save/reload.

### Pixels / LEDs

- [ ] Segment/range controls are understandable.
- [ ] Pixel effect selection updates the preview.
- [ ] 10-pixel exit-sign helper creates the intended repeat-marker pattern.
- [ ] Emergency bright-white behaviour is shown only as a locked safety rule, never as a selectable show effect.

### Trigger / Other Effect

- [ ] Logical triggers save event/payload/scope correctly.
- [ ] Other Effect remains available for current non-DMX specialist effects without pretending unsupported hardware is implemented.

## 9. Check Show / readiness

Create deliberate faults and confirm they are caught.

- [ ] Unrouted output cue is reported.
- [ ] Sound cue with no file is reported.
- [ ] Invalid pixel configuration is reported.
- [ ] Legacy/out-of-scope cue types are not silently treated as current supported authoring.
- [ ] Check Show is reachable directly from the desktop build workflow.
- [ ] A clean show receives a clear ready state.
- [ ] Warnings are understandable to a non-programmer and identify the cue that needs attention where practical.

Pass condition: the tester can fix a deliberately broken show using the messages without looking at source code.

## 10. Save, resume and project integrity

- [ ] Autosave survives a normal refresh.
- [ ] Explicit Save survives closing and reopening Studio.
- [ ] Project name survives reload.
- [ ] Mobile and desktop edit the same SHDO project model.
- [ ] No duplicate project is silently created during ordinary editing.
- [ ] 25+ cues survive repeated save/reload cycles.
- [ ] Simultaneous cue timing survives save/reload.

Pass condition: no authored work is lost during normal browser use.

## 11. Import / export round trip

- [ ] Export produces a `.shdo` file.
- [ ] A freshly exported file imports successfully.
- [ ] Imported cue count matches the source.
- [ ] Track count and types remain correct.
- [ ] Cue labels, start times, durations, params and routing survive the round trip.
- [ ] Pixel segments/effects survive the round trip.
- [ ] Existing compatible older projects migrate without destroying content.
- [ ] A malformed/unsupported file fails clearly rather than partially loading.

Pass condition: export → new browser session → import recreates the same production.

## 12. Deployment preparation

- [ ] Send / prepare for Showduino never claims a transfer occurred when it only exported a file.
- [ ] Blocking readiness issues prevent misleading deployment success.
- [ ] Offline creator mode remains usable for show authoring.
- [ ] Browser/Wi-Fi loss does not imply that an already-running P4 show depends on Studio.
- [ ] No Studio action can clear or fake the P4 emergency state.

Pass condition: the deployment UI tells the truth about what happened.

## 13. Stress pass

Build a production with at least 50 cues including simultaneous cues and several pixel effects.

- [ ] Phone build list remains responsive.
- [ ] Desktop timeline remains usable while scrolling and zooming.
- [ ] Undo/Redo remains consistent after repeated edits.
- [ ] Save/reload preserves all cues.
- [ ] Export/import preserves all cues.
- [ ] Check Show completes without freezing the UI.

Pass condition: no corruption, major slowdown or unrecoverable editor state.

## 14. Tester observation sheet

For each tester record:

- Device/browser
- First thing they clicked
- First thing they did not understand
- Any word they asked about
- Any control they expected to drag, tap or swipe differently
- Any point they thought work had been lost
- Any point they were unsure whether an action was browser preview or real hardware
- Time to create the five-cue reference show
- Number of interventions/help prompts required
- Bugs found
- “Would you trust this to build a real attraction scene?” — Yes / Not yet, with reason

## Release gate for proper testing

Studio is ready for the wider hands-on test when:

- Studio Validate is green.
- The five-cue reference show can be built on phone and desktop without assistance.
- Import/export round trip passes.
- Save/reload passes.
- Undo/Redo passes on both workflows.
- Check Show catches deliberate faults.
- No blocker exists around lost work, false deployment state, runtime authority or emergency behaviour.

Anything cosmetic can enter the tester feedback backlog. Anything that risks show data, routing, safety understanding or truthful deployment remains a blocker.
