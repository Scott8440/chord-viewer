# Chord Display → music theory practice app

## What this is
An offline replacement for Chordie (which phones home and crashes). It listens to MIDI notes from any input,
shows them on a grand staff, and names the most likely chord. The user plays a Komplete Kontrol S88 MK3 with a
sustain pedal on Windows, and often routes MIDI through loopMIDI because Ableton holds the device port.

v1 is feature complete. **The next goal is to turn it into a broader music theory learning and practice app.**
Do the architecture refactor (below) before adding features.

## Current layout
Vite + TypeScript, built to one self-contained offline file with `vite-plugin-singlefile`.
- `index.html`: page markup (Vite entry).
- `src/style.css`: all styles.
- `src/theory.ts`: pure theory module with no DOM and no globals. It holds `buildKey`, `analyze(notes, key)`,
  `romanFor`, `spellNote(midi, result, key)` and `prettyAcc`. The key is always passed in explicitly.
- `src/main.ts`: app shell with note state, Web MIDI, QWERTY input, VexFlow staff, chord name rendering and the key
  selector. It owns `currentKey` and passes it to the theory functions.
- `vite.config.ts`: single-file build. A small plugin renames the output to `dist/chord-display.html`.
- `tests/voicings.json`: regression corpus of notes, key and expected chord name / Roman numeral.
- `tests/voicings.test.ts`: Vitest runs the corpus directly against `src/theory.ts`, with no browser.

```
npm install
npm run dev        # Vite dev server
npm run build      # typecheck, then write dist/chord-display.html
npm test           # Vitest: 42/42 should pass
npm run typecheck
```
In the browser console, `__chord.analyze([60,64,67])`, `__chord.setKey("C:major")`, `__chord.noteOn(n, src)` and
`__chord.noteOff(n, src)` are exposed for testing.

## Libraries
- **tonal 6.5.1**: note, interval, key and scale primitives, plus `Chord.detect` as the candidate generator.
- **VexFlow 4.2.5** (Bravura build): staff rendering.

Both are bundled into the single output file so the app never touches the network. Keep that property: no server, no telemetry, works offline.

## Behavior and decisions so far
- **MIDI:** Web MIDI, all inputs on by default, with a per-input toggle chip in the header. Note-on with velocity 0
  counts as a note-off. A note's held state is tracked per `source:channel`, so multiple sources don't clobber each
  other. CC 120/123 clear notes. Esc and the Clear button do a full panic.
- **Sustain (CC64):** notes released while the pedal is down stay "sounding" and are drawn grey. A footer checkbox
  decides whether they count toward the chord.
- **Debounce:** the staff redraws on every animation frame. The chord name waits about 40 ms of stillness so rolled
  chords don't flicker.
- **Computer keyboard input** for testing: A–K plus W/E/T/Y/U, Z/X for octave, Space for pedal.
- **Staff layout is fixed:** room is always reserved for the full A0–C8 range so the staff never moves. Both chords
  share one VexFlow `TickContext` pinned at a fixed x, so noteheads never shift sideways and accidentals extend
  left. Treble/bass split is at middle C (≥ 60 goes on the treble staff).
- **Key selector:** None plus 12 major and 12 minor keys, saved in localStorage. A key adds a key signature,
  accidentals relative to it (including naturals), key-based spelling, scoring bias and Roman numerals.
- **Errors:** a MIDI-denied error shows a Retry button, and a separate message when the page is stuck in an iframe or
  preview.

## Chord recognizer (`analyze` / `interpret` in `src/theory.ts`)
1. Reduce the notes to unique pitch classes, ordered from the bass up.
2. Get candidates from `Chord.detect(names)`, plus `{assumePerfectFifth:true}` (penalty +0.5) to allow an omitted 5th.
3. Score each candidate (lower is better):
   - Type cost from the `TYPE_COST` tiers: triads 0; 7, maj7, m7 and 5 cost 1; common colors 2; extended or
     altered chords 3; anything else 4.5.
   - Slash chord (bass is not the root): +1.5.
   - With a key set: root outside the key +1.0, +0.4 per out-of-key chord tone, −0.7 if the root is the tonic.
     Harmonic minor's raised 7th counts as in-key.
4. **Upper-structure slash chords** (G/C, B♭/C, C/D): tonal never makes these, so we detect a chord from the notes
   above the bass and append `/bass`. This is only tried when the best exact reading costs more than 3
   (`HYBRID_TRY_ABOVE`). The chord on top must have type cost ≤ 2, and the extra cost is +0.5 on top of the slash
   cost. This keeps D7/C from becoming D/C and Cmaj7 from becoming Em/C.
5. If nothing fits and there are 4+ notes, try dropping one non-bass note (penalty +3) and label the result
   "with added X".
6. Reject anything costing more than 6 (`MAX_COST`). Clusters show "?" rather than an absurd name.
7. A power chord (`5`) is only valid with its root in the bass; an inverted fifth falls through to interval naming.
   Dyads with no match show the interval (C–F, Perfect 4th).
8. Display tweaks: `TYPE_DISPLAY` maps tonal aliases to lead-sheet names (`7add6` → 13, `m7add11` → m11,
   `M9` → maj9, and so on). Alternatives within +2.5 of the best are shown as chips.
9. **Spelling:** the root is spelled from the key if one is set, otherwise from conventional root tables. Chord tones
   are spelled relative to the root. Non-chord tones use the key's spelling, or sharps/flats by context.

**Known limits:**
- Roman numerals ignore inversions (C/E reads as I).
- "I6" means an added-6th chord, as on lead sheets, not classical first inversion.
- Rootless and quartal voicings are only as good as the candidate list.

## Planned architecture (agreed direction; do this first)
1. ✅ **Done.** **Port to Vite + TypeScript** in this repo with identical behavior. Keep single-file offline output
   (`vite-plugin-singlefile`), and possibly a PWA later. Move the voicing corpus to Vitest and run it against the
   pure theory module, not through a browser.
2. **Split into layers that only talk through data:**
   - **Input sources** (Web MIDI, QWERTY, a future on-screen piano, recorded-MIDI playback) all emit a normalized
     `NoteEvent {type, note, velocity, time, source, channel}`. Use MIDI event timestamps, not handler time.
   - **Performance state:** a pure reducer for held, sustained and pedal, plus a history buffer of recent events.
   - **Theory engine:** pure functions with no DOM and no globals. Pass the key and other context explicitly. Split
     into spelling, chord recognition, key context and Roman analysis. Plan to **replace `Chord.detect` with our own
     template-plus-scoring recognizer** whose weights live in a data table, so it can handle omissions, voicing
     matching and explaining why a reading won. Keep tonal for primitives.
   - **Views and modes:** subscribe to state. Free play is just one mode.
3. **Exercises as data:** a prompt generator, a matcher with configurable tolerances (any voicing or a specific
   inversion, octave sensitivity, timing window) and feedback.
4. **Audio** for ear training and a metronome: Web Audio with a look-ahead scheduler and a small sampled piano.
   Keep it switchable, since the user often monitors through Ableton.
5. **Persistence:** IndexedDB with schema versioning and JSON export/import. Local-first, no accounts.
6. **Tests:** the voicing corpus, recorded MIDI performances replayed through the whole pipeline, and occasional
   notation screenshot tests.

**Open question for the user:** desktop browser only, or tablet too? Safari has no Web MIDI, so iPad support would
mean a native wrapper (Tauri or Capacitor) later. The layering above keeps that to swapping the input layer.
