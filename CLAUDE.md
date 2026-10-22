# Chord Display → music theory practice app

## What this is
An offline replacement for Chordie (which phones home and crashes). It listens to MIDI notes from any input,
shows them on a grand staff, and names the most likely chord. The user plays a Komplete Kontrol S88 MK3 with a
sustain pedal on Windows, and often routes MIDI through loopMIDI because Ableton holds the device port.

v1 is feature complete. **The next goal is to turn it into a broader music theory learning and practice app.**
Do the architecture refactor (below) before adding features.

## Current layout
Vite + TypeScript, built to one self-contained offline file with `vite-plugin-singlefile`. The code is split into
layers that only talk through data: input sources emit `InputEvent`s, a pure reducer turns them into state, and the
mode and views subscribe to the store.
- `index.html`: page markup (Vite entry). `src/style.css`: all styles.
- `src/input/`: input sources.
  - `events.ts`: the normalized `InputEvent` union: `noteOn`/`noteOff` `{note, velocity, time, source, channel}`,
    `pedal`, `allNotesOff` (one source, all its channels) and `panic`. `time` comes from the originating event's
    `timeStamp` (performance.now() clock), not handler time.
  - `midi.ts`: `parseMidiMessage` (pure: raw bytes to event) and `createMidiSource` (access, per-input on/off,
    hot-plug, status).
  - `keyboard.ts`: computer-keyboard source (source `"kbd"`, channel 0).
- `src/state/`: state, no DOM.
  - `performance.ts`: pure reducer for held notes (per `source:channel`), pedal-sustained notes and pedals, plus
    `soundingNotes` and `pedalOnlyNotes`. Returns the same object when nothing changed.
  - `app.ts`: `AppState` = performance + history of the last 512 input events + settings (key, pedal-notes-count
    option, active mode); `reduceApp` over `AppAction`s.
  - `store.ts`: minimal store; subscribers get `(state, prev)` only when the state object changed.
- `src/theory/`: theory engine, pure functions with no DOM and no globals. The key is always passed in explicitly.
  `spelling.ts` (note names, `spellNote`, `prettyAcc`), `key.ts` (`buildKey`, `KeyContext`), `chordTemplates.ts`
  (chord types and scoring weights: data only), `chords.ts` (`matchTemplate`, `chordReadings`, `analyze`),
  `roman.ts` (`romanFor`), re-exported from `index.ts`.
- `src/exercises/`: exercises as pure data and functions. `notePractice.ts`: `makeNotePrompt` (random pitch class,
  never the same twice; spelled from the key, else sharp or flat at random) and `reduceNotePractice` (judges each
  note-on in any octave; tracks wrong attempts, answered and right-first-time counts; skip counts as answered).
- `src/views/`: DOM rendering only: `staff.ts` (VexFlow), `chordName.ts`, `noteList.ts`, `practice.ts` (prompt,
  feedback, score), `header.ts` (MIDI status and input chips, pedal light, octave, key selector).
- `src/modes/`: exactly one mode runs at a time (header Mode selector, saved in localStorage) and owns the right-hand
  card; each returns `{stop, skip?}`. `performance.ts` is the shared once-per-frame staff and note-list redraw.
  `freePlay.ts` adds the chord name with the 40 ms debounce. `notePractice.ts` feeds each new note-on from the
  history to the exercise reducer and moves to the next prompt 700 ms after a correct answer.
- `src/main.ts`: wiring only. Creates the store, views, mode and input sources; owns localStorage for the key.
- `vite.config.ts`: single-file build. A small plugin renames the output to `dist/chord-display.html`.
- `tests/`: Vitest, no browser. `voicings.test.ts` runs `voicings.json` against the theory engine;
  `chords.test.ts` covers template matching, cost explanations and transposition consistency;
  `performance.test.ts`, `midi.test.ts` and `app.test.ts` cover the reducers and MIDI parsing.

```
npm install
npm run dev        # Vite dev server
npm run build      # typecheck, then write dist/chord-display.html
npm test           # Vitest: 95 tests (54 voicings) should pass
npm run typecheck
```
In the browser console, `__chord` is exposed for testing: `analyze([60,64,67])`, `setKey("C:major")`,
`noteOn(n, source?, channel?)`, `noteOff(n, source?, channel?)`, `setPedal(source, down)`, `allOff(source?)` (no
argument means panic) and `getState()`.

## Libraries
- **tonal 6.5.1**: note, interval, key and scale primitives only. Chord recognition is our own.
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

## Chord recognizer (`src/theory/chords.ts`, data in `src/theory/chordTemplates.ts`)
Our own template matcher; tonal is only used for primitives (intervals, transposition, keys).
1. Reduce the notes to unique pitch classes, ordered from the bass up.
2. **Templates** (`CHORD_TEMPLATES`): about 60 chord types, each with intervals, a lead-sheet `symbol`, a long `name` and
   a base `cost` (triads 0; 7, maj7, m7 and 5 cost 1; common colors 2; 13 and m11 2.5; extended or altered chords 3;
   rare ones 4.5). `(5P)` marks a tone that may be left out. The 5th is optional in chords with a 3rd and a 7th;
   the 9th is optional only in 13 and m11. No two templates share a pitch-class set (a test enforces it), and table
   order only breaks exact ties.
3. **Matching:** `matchTemplate(pcs, rootPc, template)` reports omitted optional tones, missing required tones and
   extra notes. It is exported for the exercise matcher. The recognizer tries every template on every played root
   and keeps exact fits (nothing missing, nothing extra).
4. **Scoring** (`RECOGNIZER_WEIGHTS`): base cost, + `omit` per left-out tone (5th 0.5, 9th 0.25), + 1.5 when the bass
   is a chord tone other than the root. With a key: root outside the key +1.0, +0.4 per *played* chord tone outside
   it, −0.7 if the root is the tonic. Harmonic minor's raised 7th counts as in-key.
5. **Upper-structure slash chords** (G/C, B♭/C, C/D): a template with base cost ≤ 2 in root position over the notes
   above the bass, +1.5 +0.5. Only tried when the best plain reading costs more than 3. This keeps D7/C from becoming
   D/C and Cmaj7 from becoming Em/C.
6. If nothing fits and there are 4+ notes, ignore one non-bass note (+3) and label the result "with added X".
7. Reject readings whose **voicing cost** (everything except the key adjustments) is above 6. The key only re-ranks;
   it never turns a real chord into "?". Clusters show "?".
8. Power chords (`5`) need the root in the bass; an inverted fifth falls through to interval naming (C–F, Perfect 4th).
9. Every reading carries `reasons` (label + cost, summing to `cost`), `omitted` degrees and `voicingCost`, so the UI or
   an exercise can explain why it won. `analyze` also returns all accepted readings as `ranked`. Alternatives within
   +2.5 of the best are shown as chips. Ties go to plain readings, then root position, then table order, so results
   are the same in every transposition.
10. **Spelling:** the root is spelled from the key if one is set, otherwise from conventional root tables (minor-family
   templates use C#, G#, not Db, Ab). Chord tones are spelled by transposing the root. Non-chord tones use the key's
   spelling, or sharps/flats by context.

**Known limits:**
- Roman numerals ignore inversions (C/E reads as I).
- "I6" means an added-6th chord, as on lead sheets, not classical first inversion.
- Rootless voicings are not recognized (the root must be played). `matchTemplate` can still score them for exercises.
- Some sets are truly ambiguous (Am11/E vs Cmaj13/E; Ebm6/Gb vs Cm7b5/Gb); the weights pick one consistently.

## Planned architecture (agreed direction; do this first)
1. ✅ **Done.** **Port to Vite + TypeScript** in this repo with identical behavior. Keep single-file offline output
   (`vite-plugin-singlefile`), and possibly a PWA later. Move the voicing corpus to Vitest and run it against the
   pure theory module, not through a browser.
2. ✅ **Done, including the custom recognizer.** **Split into layers that only talk through data:**
   - **Input sources** (Web MIDI, QWERTY, a future on-screen piano, recorded-MIDI playback) all emit a normalized
     `NoteEvent {type, note, velocity, time, source, channel}`. Use MIDI event timestamps, not handler time.
   - **Performance state:** a pure reducer for held, sustained and pedal, plus a history buffer of recent events.
   - **Theory engine:** pure functions with no DOM and no globals. Pass the key and other context explicitly. Split
     into spelling, chord recognition, key context and Roman analysis. Plan to **replace `Chord.detect` with our own
     template-plus-scoring recognizer** whose weights live in a data table, so it can handle omissions, voicing
     matching and explaining why a reading won. Keep tonal for primitives.
   - **Views and modes:** subscribe to state. Free play is just one mode.
3. **Started:** note practice (name a note, play it in any octave, right/wrong feedback and a first-try score).
   **Exercises as data:** a prompt generator, a matcher with configurable tolerances (any voicing or a specific
   inversion, octave sensitivity, timing window) and feedback.
4. **Audio** for ear training and a metronome: Web Audio with a look-ahead scheduler and a small sampled piano.
   Keep it switchable, since the user often monitors through Ableton.
5. **Persistence:** IndexedDB with schema versioning and JSON export/import. Local-first, no accounts.
6. **Tests:** the voicing corpus, recorded MIDI performances replayed through the whole pipeline, and occasional
   notation screenshot tests.

**Platform:** desktop browser only (Chrome or Edge), decided by the user. Tablet is out of scope for now; Safari has
no Web MIDI, so an iPad version would need a native wrapper (Tauri or Capacitor), and only the input layer would change.
