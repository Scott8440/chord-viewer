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
  - `app.ts`: `AppState` = performance + history of the last 512 input events + settings (the header key, which
    is for free play only; pedal-notes-count option; active mode; chord types, prompt style and inversions for chord
    practice; `exercise`, the `ExerciseOptions` shared by the prescriptive exercises; `routine`, which routine
    and which way round the circle of fifths; and `latencyMs`) + `transport` (where the beats are, while a clock
    runs; see "Metronome"). `createAppState(saved)`
    takes saved settings and validates each one; `reduceApp` over `AppAction`s.
  - `store.ts`: minimal store; subscribers get `(state, prev)` only when the state object changed. A subscriber
    that unsubscribes during a dispatch is not called for the rest of it (the old mode on a mode switch).
- `src/theory/`: theory engine, pure functions with no DOM and no globals. The key is always passed in explicitly.
  `spelling.ts` (note names, `spellNote`, `prettyAcc`), `key.ts` (`buildKey`, `KeyContext`, the circle of fifths
  `CIRCLE_OF_FIFTHS_MAJOR`/`_MINOR` and `circlePosition`, `keySignature` counted from the key's scale so F♯ major
  is 6♯ and its relative E♭ minor 6♭), `chordTemplates.ts`
  (chord types and scoring weights: data only), `chords.ts` (`matchTemplate`, `chordReadings`, `analyze`),
  `roman.ts` (`romanFor`), re-exported from `index.ts`.
- `src/exercises/`: exercises as pure data and functions. `notePractice.ts`: `makeNotePrompt` (random pitch class,
  never the same twice; spelled from the key, else sharp or flat at random) and `reduceNotePractice` (judges each
  note-on in any octave; tracks wrong attempts, answered and right-first-time counts; skip counts as answered).
  `chordAttempt.ts`: the one place chords are judged from the held keys (`trackAttempt`): a match as soon as the
  held keys form the target (rolled, or legato with common tones held); a miss only when keys were newly pressed
  and then all released; letting go of keys already held is never an attempt. Used by chord practice,
  progressions and chord steps in sequence exercises.
  `chordPractice.ts`: `CHORD_PRACTICE_GROUPS` (the types offered in the filter: triads, sixths/sevenths, ninths;
  ids are chord template ids), `makeChordPrompt` (random root + allowed type, never the same chord twice; root
  spelled from the key, else conventionally), `isChord` (every tone present in any voicing/inversion/octave,
  nothing extra; a left-out 5th fails unless `allowOmissions`) and `reduceChordPractice` (fed the held keys: correct
  via `chordAttempt.ts`). `chordCorrections` turns a wrong attempt into
  replace/add/remove steps (a wrong note within a whole step of a missing tone is a "replace"). Roman numeral prompts:
  `DIATONIC` lists each key's triads and sevenths (minor uses harmonic minor for V, V7, vii°, vii°7);
  `makeRomanPrompt` picks one in the given key, or a random key per prompt when none (the mode always passes none), limited to the
  selected chord types (if none occur in the key, any diatonic triad, flagged `filterIgnored`). A test checks that
  `analyze` + `romanFor` give back the same numeral for every diatonic chord in all 24 keys. Inversions:
  `withInversion` adds a random required inversion (root position included; the bass is a chord tone up to the
  7th, never a 9th; `atInversion` asks for a specific one) and `isChord` then also needs that note lowest
  (`hasChordTones` + `hasBass`).
  `progressions.ts`: `PROGRESSIONS`, the app's shared list of popular progressions (id, name, major/minor, steps of
  numeral + scale degree + chord type, a `weight` for how common it is, and style `tags`: basic, pop, jazz,
  classical; minor uses the natural scale, so VII not vii°). There is deliberately no user selector: other features
  should pick from this list (`progressionById`, `progressionsWhere({mode, tag})`). `progressionChords`,
  `makeProgressionPrompt` (weighted random pick, optionally from a smaller pool; a given key and only
  progressions in its mode, or a random key of the progression's mode, which is what the mode uses) and
  `reduceProgression` (judges each chord via `chordAttempt.ts`). A test checks every progression in every key
  analyzes back to its chords and numerals.
  **Prescriptive exercises** (see "Prescriptive exercises" below): `sequence.ts` is the generic sequence matcher
  (note steps and chord steps; `reduceSequence`, `runResult`, `bestRun`); `scales.ts` builds `scaleExercise`;
  `diatonicChords.ts` builds `diatonicChordsExercise`; `prescriptive.ts` is the registry (`PRESCRIPTIVE`: how each
  exercise builds its sequence from the shared `ExerciseOptions`, which options it uses, a short name and whether it
  has chord steps). `routines.ts`: routines (see "Routines" below): `circleOfFifths(direction)`, `eachKey`, the
  curated `ROUTINES`, the runner `reduceRoutine` (wraps `reduceSequence`), `routineSummary`, and `keyProgress`
  (state per key, shared by the routine row and the circle).
- `src/timing/`: pure. `transport.ts` (`Transport`, `beatAt`, `timeOfBeat`, `retempo`) and `grid.ts` (judging a
  step against the metronome: `judgeTime`, `timingVerdict`, `timingSummary`). See "Metronome" below.
- `src/audio/click.ts`: the metronome click (Web Audio look-ahead scheduler that follows the transport).
- `src/views/`: DOM rendering only: `beat.ts` (the beat light), `staff.ts` (VexFlow), `chordName.ts` (also `chordSymbolHtml`),
  `practice.ts` (renders a `PracticeDisplay`; `notePracticeDisplay` and `chordPracticeDisplay` turn exercise state
  into it, including "That was C. Replace E with E♭" feedback; Roman prompts show the key, reveal the chord when
  answered and add the played chord's numeral; inversions show as slash chords or figured bass (V⁶₅, I⁶₄, V⁴₂), and
  a wrong bass gets "Right notes, wrong bass. Put E in the bass"; rows of steps share `stepHtml` and
  `chordStepHtml` (green when done, current underlined, a chord in the prompt's notation with the other one
  revealed underneath once played); `progressionDisplay` and `sequenceDisplay` both use them; `sequenceDisplay`
  covers note and chord steps: wrong note vs wrong octave, chord corrections, start hints, run results and a session
  summary, and relabels Skip as Restart; `routineDisplay` adds the routine's overview row, one entry per key, amber
  when a key had mistakes, struck through when skipped, and the progress, previous item's result and final
  summary), `circleOfFifths.ts` (see "Circle of fifths" below), `filter.ts`
  (grouped checkboxes, used for the chord-type filter; the last one can't be unchecked), `header.ts` (MIDI
  status and input chips, pedal light, octave, key selector).
- `src/modes/`: exactly one mode runs at a time (header Mode selector, saved in localStorage) and owns the right-hand
  card; each returns `{stop, skip?}`. `performance.ts` holds what modes share: `createPerformanceDrawer` (subscribes
  itself and redraws the staff once per frame, in the key the mode gives it: free play the header
  key; note and chord-name practice none; Roman numeral and progression prompts the prompt's key; exercises the
  exercise's key), `onPlayerInput` (each note-on with its time, then each change of the held keys with the time of
  the event behind it), `timingGrid`/`onTimingGrid` (the grid timed exercises are judged on), `onIdle` (idle after a wait with no input and nothing sounding; active on any input) and
  `heldNotes`.
  **Page setup per mode** (`page.ts`): `PAGE_SETUP` says, as data, which right-hand panel a mode shows, whether the
  header Key picker is shown, and which page-wide behaviours it turns on, so a behaviour is written once and any mode
  can opt in. `metronome` (scales, diatonic chords, routines): `metronome.ts` runs the built-in clock while the
  exercise's Metronome option is on. `fadeChordWhenIdle` (free play): after 10 s idle, main tells the chord view `setIdle(true)` and the view
  fades to "Play something" over 2 s (it owns how that looks); any input brings the chord straight back.
  **Exercises never use the header key**, and the header Key picker is hidden outside free play: a key is either
  part of the prompt ("V7 in G major") or chosen inside the exercise (the scale selector).
  `freePlay.ts` adds the chord name with the 40 ms debounce. `notePractice.ts` feeds each new note-on from the
  history to the exercise reducer and moves to the next prompt 700 ms after a correct answer. `chordPractice.ts`
  feeds the held keys to its reducer (900 ms before the next prompt) and asks again if the filter rules out the
  current chord. `progressionPractice.ts` feeds the held keys to the progression reducer and starts a new
  progression 1.2 s after the last chord. The chord filter, the prompt style (chord names or Roman numerals, shared
  by chord and progression practice) and the "Specific inversions" option are saved in localStorage.
  `sequencePractice.ts` runs any exercise in `PRESCRIPTIVE` (modes "scales" and "diatonic"): builds it from the
  shared exercise options, feeds note-ons and held keys with their times to the sequence reducer, and swaps in a
  fresh exercise when the options change. `routinePractice.ts` runs a routine (mode "routines"): restarts when the
  routine or direction changes, applies other exercise settings from the item in progress on; Skip skips an item
  (and starts again at the end), Restart routine starts over.
- `src/main.ts`: wiring only. Loads saved settings into `createAppState` and saves them on every change
  (localStorage), binds each control to its setting (`bindSelect`/`bindCheckbox`, which also blur so the computer
  keys keep working), shows the controls the mode uses (exercise options are tagged `data-option` and shown when the
  exercise lists them), and starts the mode, views and input sources.
- `vite.config.ts`: single-file build. A small plugin renames the output to `dist/chord-display.html`.
- `tests/`: Vitest, no browser. `voicings.test.ts` runs `voicings.json` against the theory engine;
  `chords.test.ts` covers template matching, cost explanations and transposition consistency;
  `performance.test.ts`, `midi.test.ts` and `app.test.ts` cover the reducers and MIDI parsing.

```
npm install
npm run dev        # Vite dev server
npm run build      # typecheck, then write dist/chord-display.html
npm test           # Vitest: 241 tests (54 voicings) should pass
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
- **Key selector (header, free play only):** None plus 12 major and 12 minor keys, saved in localStorage. A key adds
  a key signature, accidentals relative to it (including naturals), key-based spelling, scoring bias and Roman
  numerals. Hidden in practice modes, which name their key in the prompt or have their own selector.
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

## Prescriptive exercises
Repeatable exercises that need precise playing, as opposed to the random-prompt practice modes. The player picks
the exercise and runs it again and again; each run is measured.
- **Model:** a `SequenceExercise` is an ordered list of steps, each a **note** (semitone offset from the
  exercise's base pitch class + spelled name) or a **chord** (a `ChordPrompt`, optionally with a required
  inversion). Note steps are judged on note-ons: the first one played may be in any octave and sets the octave of
  the run, after that each must be exact. Chord steps are judged from the held keys via `chordAttempt.ts` (any
  voicing, rolled or legato). A wrong attempt is a mistake and the step waits for the right one (no restart).
  Steps can be mixed (an arpeggio then its chord); the note that completes a note step doesn't count against a
  chord step that follows.
- **Runs:** finishing gives a `RunResult` (mistakes, duration, tempo in BPM with one step per beat, evenness =
  1 − coefficient of variation of the gaps between steps, using the MIDI event timestamps; and `timing` when played
  to the metronome). Playing the first step again starts the next run; Restart abandons one. The session keeps
  every run and shows the best (fewest mistakes, then most on time if timed, else most even).
- **Options and registry:** the exercises share `ExerciseOptions` (key, minor form, octaves, sevenths, root
  position, and the metronome: on/off, BPM, notes per beat, strictness), with one Key selector inside the exercise. `PRESCRIPTIVE` lists each exercise's builder and the options
  it uses; the UI shows just those. Adding an exercise is a builder, a registry entry, a mode id and a menu item.
- **Scales (built):** any of the 24 keys, up and back down, 1 or 2 octaves; minor scales offer natural, harmonic
  or melodic (melodic comes down natural). The prompt names it ("Play E♭ harmonic minor up and back down…").
  Its steps show as dots, not note names: knowing the notes is the exercise. Wrong notes still name the expected one.
- **Diatonic chords (built):** the key's triads or seventh chords in order, I up to vii° and back to I (minor:
  harmonic minor's V and vii°), in root position or any voicing; shown as chord names or Roman numerals.
- **Next, on the same matcher:** arpeggios and broken chords (note steps, optionally ending on a chord step); hands together (steps with two notes); fingering
  hints; keeping best runs (step 5); drawing the target notes on the staff.

## Metronome
Timed practice for the prescriptive exercises and routines. The click comes from the browser; the design leaves
room to sync with Ableton later.
- **Transport = the one source of truth** (`src/timing/transport.ts`, in `AppState.transport`): "beat *b* falls at
  time *t* (performance.now() clock, the same as the input events), at this BPM". Whatever drives the clock
  dispatches `setTransport`; a tempo change moves the anchor (`retempo`) so no beat jumps. **Everything else only
  reads it:** the click, the beat light and the timing judgement never assume who drives. Today the driver is the
  built-in clock (`src/modes/metronome.ts`, a `PAGE_SETUP` behaviour); an external clock (MIDI clock from Ableton
  via loopMIDI, say) would be another driver updating the same transport, and nothing downstream changes.
- **Click** (`src/audio/click.ts`): a look-ahead scheduler (every 25 ms, schedule clicks due in the next 120 ms on
  the audio clock), accented on beat 1 of the 4/4 bar, mapped from performance time with `getOutputTimestamp()` so
  output latency is included (falling back to an estimate if a browser's timestamp disagrees by >250 ms, so clicks
  are never silently scheduled in the past). It tracks the last click by time, so a tempo change never doubles a
  click. Audio starts on the first click, tap or key press (browser autoplay rules; unlocked in the capture phase on
  pointerdown/touchend/click/keydown, with a silent buffer for older iOS), and the beat light says so while it's
  blocked. On iOS, `navigator.audioSession.type = "playback"` lets it sound with the silent switch on.
- **Judging** (`src/timing/grid.ts`): a grid = transport + notes per beat (1, 2 or 4) + strictness (±40 ms strict,
  ±80 ms loose, never more than 40% of a slot) + `latencyMs` (taken off note times: set it if you're judged
  consistently late). One step per slot. A run may start on any slot; each step is due on the slot after the
  previous one; a step a whole slot away has *slipped*, and the run carries on from there, so one stumble doesn't
  make the rest late. Wrong notes still block the step as before. The summary: share on time, lean (rushing or
  dragging, ms), spread and slips. The click runs continuously, so there's no count-in: join on any beat.
- **Sequence and routines:** `SequenceState.grid` (`setGrid`; a new tempo keeps the run, another subdivision or
  turning the metronome off restarts it) and `timings` per step. Routines pass the grid on to each item, so the
  click flows through a whole routine; the weakest items are the least on time.
- **Display:** the beat light above the prompt, the tempo in the instruction, late steps red and early ones blue,
  and "93% on time · dragging 6 ms" in results.
- **Next:** a tap-along latency calibration; a tempo-ladder routine (raise the tempo after a clean run); an external
  clock driver (Ableton).

## Circle of fifths (`src/views/circleOfFifths.ts`)
A visual shown in the top-right corner of the staff card (space the fixed staff layout always leaves empty) when
relevant, hidden otherwise; main hides it on every mode switch and modes that use it draw it.
- **Drawing:** `circleSvg(model)` is pure: majors on the outer ring, relative minors inside, C at the top, clockwise
  by fifths. The model can focus a key (amber, its name and signature in the middle), shade and number its
  neighbourhood (IV I V outside and ii vi iii inside for major; VI III VII and iv i v for minor; `neighbours: false`
  turns this off), mark a chord (`chordOnCircle(result)`: major-family chords outside, minor-family inside;
  diminished, augmented and sus chords aren't on the circle), and colour routine progress by key with a centre
  text and direction arrow. Labels use the circle's fixed spelling (F♯, E♭m), so E♭ minor's VI shows as B.
- **Where:** free play with a header key (the key, its neighbourhood and the chord being played); scale and
  diatonic chord exercises (the exercise's key); routines (progress, current key, "4 / 12" and ↻/↺). Not in note,
  chord or progression practice: the numerals would give answers away.

## Routines
A set of prescriptive exercises played one after another, e.g. every major scale round the circle of fifths.
- **Data, not code:** a `Routine` is a list of `RoutineItem`s `{exercise, options}` pointing into `PRESCRIPTIVE`.
  Items set only what defines them (the key); every other option comes from the player's exercise settings, so
  "2 octaves" applies to the whole routine. `eachKey(keys, exercises)` builds the usual "for each key, these
  exercises" shape. Routines are a curated list (`ROUTINES`), not a user builder.
- **Order:** `circleOfFifths("sharps")` = C G D A E B F♯ D♭ A♭ E♭ B♭ F; `"flats"` = C F B♭ E♭ A♭ D♭ F♯ B E A D G
  (a setting). F♯ stands in for G♭, as in the key lists. Major keys only, for now.
- **Running:** `reduceRoutine` forwards input to the item's `reduceSequence`; when the item's run finishes (mistakes
  allowed, and recorded) it moves on, carrying held keys over so a scale's last note doesn't count against the
  next item's chord. The previous item's result shows until the next one starts. Skip records "skipped".
- **End:** `routineSummary`: played, clean, mistakes, total time, skipped, and the weakest items (most mistakes,
  then least even; at most three, never clean ones).
- **Built:** major scales; diatonic chords; scale then diatonic chords; each round the circle.

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
3. **Started:** note practice (name a note, play it in any octave) and chord practice (a chord name or a Roman
   numeral in a key, from a filtered set of types, played in any voicing or a required inversion) and progression
   practice (a popular progression in a key, chord by chord), all with right/wrong feedback and a first-try score.
   Prescriptive exercises (above): scales and diatonic chords, and routines of them round the circle of fifths.
   **Exercises as data:** a prompt generator, a matcher with configurable tolerances (any voicing or a specific
   inversion, octave sensitivity, timing window) and feedback.
4. **Audio:** the metronome is **built** (see "Metronome"). Still to do: a small sampled piano for ear training.
   Keep it switchable, since the user often monitors through Ableton.
5. **Persistence:** IndexedDB with schema versioning and JSON export/import. Local-first, no accounts.
6. **Tests:** the voicing corpus, recorded MIDI performances replayed through the whole pipeline, and occasional
   notation screenshot tests.

**Platform:** desktop browser only (Chrome or Edge), decided by the user. Tablet is out of scope for now; Safari has
no Web MIDI, so an iPad version would need a native wrapper (Tauri or Capacitor), and only the input layer would change.
