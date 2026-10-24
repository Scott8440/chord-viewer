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
    and which way round the circle of fifths; `latencyMs`; and `latencyCalibrated`) + `transport` (where the beats are, while a clock
    runs; see "Metronome") + `page` ("practice" or "progress"; not saved). `createAppState(saved)`
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
  note-on in any octave; tracks wrong attempts, answered and right-first-time counts; skip counts as answered; no
  mode uses `makeNotePrompt` any more, since sight reading replaced note practice).
  `sightReading.ts`: sight reading (see "Sight reading" below): `ReadingOptions`, `READING_RANGES`, `readingPool`,
  `makeReadingPrompt` (generated lines), `keyFifths`, `makeExcerptPrompt` (a song's passage in a key, as steps) and
  `excerptLevel`; `reduceReading` judges playing back, a note or chord at a time.
  `chordAttempt.ts`: the one place chords are judged from the held keys (`trackAttempt`): a match as soon as the
  held keys form the target (rolled, or legato with common tones held); a miss only when keys were newly pressed
  and then all released; letting go of keys already held is never an attempt. Used by chord practice,
  progressions and chord steps in sequence exercises.
  `chordPrompt.ts`: the shared prompt types (`ChordPrompt`, `RomanPrompt`, `InversionPrompt`, `PromptStyle`).
  `chordMatch.ts`: `isChord` (every tone present in any voicing/inversion/octave, nothing extra; a left-out 5th
  fails unless `allowOmissions`; with a required inversion also that note lowest: `hasChordTones` + `hasBass`) and
  `chordCorrections` (a wrong attempt as replace/add/remove steps; a wrong note within a whole step of a missing
  tone is a "replace"). `chordPractice.ts`: `CHORD_PRACTICE_GROUPS` (the types offered in the filter: triads,
  sixths/sevenths, ninths; ids are chord template ids), `makeChordPrompt` (random root + allowed type, never the
  same chord twice; root spelled from the key, else conventionally) and `reduceChordPractice` (fed the held keys:
  correct via `chordAttempt.ts`). Its Key option (`CHORD_KEYS`, `Settings.chordKey`, saved): "none" (chord names:
  any chord; Roman numerals: a new key each prompt, as before), "random" (a new key every `PROMPTS_PER_KEY` = 10
  prompts, as in ear training) or one of the 24 keys; with a key, both styles ask for that key's diatonic chords
  (`makeDiatonicNamePrompt` for names, flagged `inKey`, shown "in C major"), and the staff draws in it.
  `romanPrompts.ts`: `DIATONIC` lists each key's triads and sevenths (minor uses
  harmonic minor for V, V7, vii°, vii°7); `makeRomanPrompt` picks one in the given key, or a random key per prompt
  when none (the mode always passes none), limited to the selected chord types (if none occur in the key, any
  diatonic triad, flagged `filterIgnored`). A test checks that `analyze` + `romanFor` give back the same numeral for
  every diatonic chord in all 24 keys. `inversions.ts`: `withInversion` adds a random required inversion (root
  position included; the bass is a chord tone up to the 7th, never a 9th; `atInversion` asks for a specific one).
  `earTraining.ts`: ear training by scale degree (see "Ear training" below): `EAR_DEGREES`, options, `pickTonic`,
  `tonicMidi`, `makeEarPrompt` and `degreeName`; answers are judged by `reduceNotePractice`, which is generic in its
  prompt for this.
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
- `src/timing/`: pure. `transport.ts` (`Transport`, `beatAt`, `timeOfBeat`, `retempo`), `grid.ts` (judging a
  step against the metronome: `judgeTime`, `timingVerdict`, `timingSummary`) and `calibration.ts` (tap-along latency). See "Metronome" below.
- `src/progress/`: practice history (see "Practice history" below): `records.ts` (record types, pure builders,
  reading back and export files), `store.ts` (the `ProgressStore` interface and an in-memory one), `idbStore.ts`
  (IndexedDB), `recorder.ts` (stamps and stores records; `uuid`), `stats.ts` (what the Progress view charts, worked
  out from records; pure).
- `src/audio/`: `context.ts` (the one shared AudioContext and the autoplay unlock on any click, tap or key; a MIDI
  note isn't a gesture), `click.ts` (the metronome click: Web Audio look-ahead scheduler that follows the transport),
  `tones.ts` (ear training: a synthesised drone and piano-ish note, no samples; `blocked()` while audio waits for a
  gesture).
- `src/views/`: DOM rendering only: `beat.ts` (the beat light), `staff.ts` (VexFlow; also `staffCorner`), `staffCorner.ts`
  (`fitToStaffCorner`), `charts.ts` (line and column time charts: pure SVG builders + `mountChart` with the hover
  layer), `progressView.ts` (the Progress view), `chordName.ts` (also `chordSymbolHtml`),
  `practice/` (the practice panel, one file per job: `view.ts` renders a `PracticeDisplay`; `drills.ts`,
  `sequence.ts` and `routine.ts` are the presenters that turn exercise state into one; `chords.ts` holds chord
  notation and corrections, `steps.ts` the step rows, `text.ts` small helpers; `index.ts` re-exports the public
  names. `sightReadingDisplay` and `chordPracticeDisplay` turn exercise state into it, including "That was C. Replace E with E♭" feedback; Roman prompts show the key, reveal the chord when
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
  key; chord-name practice none (or its Key option's key); sight reading the line's key; Roman numeral and progression prompts the prompt's key; exercises the
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
  `freePlay.ts` adds the chord name with the 40 ms debounce. `sightReading.ts` (mode id "notes") feeds each new
  note-on to `reduceMelody` and moves to the next line 900 ms after its last note. `chordPractice.ts`
  feeds the held keys to its reducer (900 ms before the next prompt) and asks again if the filter rules out the
  current chord. `progressionPractice.ts` feeds the held keys to the progression reducer and starts a new
  progression 1.2 s after the last chord. The chord filter, the prompt style (chord names or Roman numerals, shared
  by chord and progression practice) and the "Specific inversions" option are saved in localStorage.
  `sequencePractice.ts` runs any exercise in `PRESCRIPTIVE` (modes "scales" and "diatonic"): builds it from the
  shared exercise options, feeds note-ons and held keys with their times to the sequence reducer, and swaps in a
  fresh exercise when the options change. `routinePractice.ts` runs a routine (mode "routines"): restarts when the
  routine or direction changes, applies other exercise settings from the item in progress on; Skip skips an item
  (and starts again at the end), Restart routine starts over.
- `src/main.ts`: wiring only: creates the store, views, modes and input sources and connects them. The larger
  pieces of wiring live in `src/app/`: `storage.ts` (settings loaded into `createAppState` and saved on every
  change, in localStorage; the device id), `controls.ts` (binds each control to its setting with
  `bindSelect`/`bindCheckbox`/`bindNumber`, which blur so the computer keys keep working; `showControls` shows the
  controls the mode uses: exercise options are tagged `data-option` and shown when the exercise lists them),
  `history.ts` (opens practice history and runs the footer's count, Export and Import), `calibration.ts` (the
  calibration dialog, from the button or by itself) and `dom.ts` (`$`).
- `vite.config.ts`: single-file build. A small plugin renames the output to `dist/chord-display.html`.
- `tests/`: Vitest, no browser. `voicings.test.ts` runs `voicings.json` against the theory engine;
  `chords.test.ts` covers template matching, cost explanations and transposition consistency;
  `performance.test.ts`, `midi.test.ts` and `app.test.ts` cover the reducers and MIDI parsing.

```
npm install
npm run dev        # Vite dev server
npm run build      # typecheck, then write dist/chord-display.html
npm test           # Vitest: 346 tests (54 voicings) should pass
npm run typecheck
```
In the browser console, `__chord` is exposed for testing: `analyze([60,64,67])`, `setKey("C:major")`,
`noteOn(n, source?, channel?)`, `noteOff(n, source?, channel?)`, `setPedal(source, down)`, `allOff(source?)` (no
argument means panic) and `getState()`.

## Libraries
- **tonal 6.5.1**: note, interval, key and scale primitives only. Chord recognition is our own.
- **VexFlow 4.2.5** (Bravura build): staff rendering.

Both are bundled into the single output file. **Offline is no longer a requirement** (decided by the user, Oct 2026):
the app may fetch its own static data, such as the sight-reading excerpts (`public/reading/`, copied next to the
page on GitHub Pages). Still no server of our own and no telemetry.

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
  every run and shows the best (fewest mistakes, then most on time if timed, else most even). Results show tempo and
  evenness (or timing), not how long the run took.
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
- **Click** (`src/audio/click.ts`): a look-ahead scheduler (every 25 ms, schedule clicks that must start within the
  next 120 ms of the audio clock, so the horizon covers any output latency: Bluetooth can add 300 ms), accented on beat 1 of the 4/4 bar, mapped from performance time with `getOutputTimestamp()` so
  output latency is included (falling back to an estimate if a browser's timestamp disagrees by >250 ms, so clicks
  are never silently scheduled in the past). It tracks the last click by time, so a tempo change never doubles a
  click. Audio starts on the first click, tap or key press (browser autoplay rules; unlocked in the capture phase on
  pointerdown/touchend/click/keydown, with a silent buffer for older iOS), and the beat light says so while it's
  blocked. On iOS, `navigator.audioSession.type = "playback"` lets it sound with the silent switch on. It reports
  the output latency the browser gives (`outputLatency + baseLatency`); above 60 ms the metronome options show a
  note (likely Bluetooth). Browsers can't say what kind of device it is (names need microphone permission), and
  can under-report Bluetooth delay.
- **Judging** (`src/timing/grid.ts`): a grid = transport + notes per beat (1, 2 or 4) + strictness (±50 ms strict,
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
- **Latency calibration**, in a dialog (`src/views/calibrationDialog.ts`; Calibrate, next to Latency, or by itself
  the first time the metronome starts while `latencyCalibrated` is false: set by calibrating, typing a latency, or
  Cancel, and saved; a latency saved before the flag existed counts unless it's 0): play any note on each click; 4 warm-up taps, then 12
  measured; taps over 150 ms from the beat are strays; the median offset becomes the latency (− = the player is
  ahead, e.g. rushing), applied only if steady (median absolute deviation ≤ 25 ms). It covers the click's real
  arrival, MIDI delay and playing ahead of a click in one number. `AppState.calibrating` makes `onPlayerInput`
  report nothing meanwhile, so exercises ignore the taps; the metronome stopping cancels it
  (`src/modes/calibrate.ts`).
- **Next:** a tempo-ladder routine (raise the tempo after a clean run); an external
  clock driver (Ableton).

## Circle of fifths (`src/views/circleOfFifths.ts`)
A visual shown in the top-right corner of the staff card when relevant, hidden otherwise; main hides it on every
mode switch and modes that use it draw it.
- **Size:** it scales with the window. `staffCorner()` (staff.ts) gives the corner the staff leaves free, in viewBox
  units: right of the note column (with a cluster's displaced noteheads and ledger lines; no key signature) and
  above the treble staff. `fitToStaffCorner` (views/staffCorner.ts) converts it to pixels on every resize (allowing
  for the drawing being letterboxed in a short window) and sizes the circle to fill it, 10 px clear, at least 110 px.
  A key signature moves the note column right, so very high notes in keys with many accidentals can reach into it.
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

## Ear training (mode "ear", `src/modes/earTraining.ts`)
First mode: scale degrees over a drone. A drone sounds the tonic (an octave below, plus the octave above it), the
app plays one note over it (the tonic F♯3–F4, the note in either of the two octaves above it, `EAR_OCTAVES`; never
the same note twice running, though a degree may repeat in the other octave, so two degrees don't just alternate),
and the player plays that note in any octave, or presses its degree on the number keys (1–7, no controller needed:
`src/input/degreeKeys.ts`, a source the mode turns on, emitting the degree's note as source `"deg"`). The circle is the only display: the practice
card shows no prompt (an empty `promptHtml` hides it) and no feedback text, just the instruction, score and buttons. **No staff and no note names here, only degrees:** `PAGE_SETUP.stage: "degrees"` puts the scale-degree
circle (`src/views/degreeCircle.ts`: 1–7 round a circle, 1 at the top, the degrees on offer solid) in the staff's
place. Each time the drone starts (a new key, Start, or new options) it plays the root, the degrees on offer and
the octave, pinging each node in turn (amber; each ping waits the output latency, `tones.latency()`, so it lands when the note
is heard, not sent: Bluetooth adds a few hundred ms), then the note to find; every note played pings its degree, green if
right, red if wrong (a note outside the scale pings between its neighbours with its name, e.g. ♭3). After a wrong note the note plays again 1 s later (another wrong note in that second pushes it back).
Replay plays the note again; Skip moves on; Stop silences the drone and ignores played notes until Start,
which brings the drone back (with its lead-in) and plays the note again. Leaving the window (another app, another
tab) stops it the same way, with the drone fading over 3 s (`AWAY_FADE_S`), and coming back starts it again. The note rings about 3 s. Options (saved, `Settings.ear`): the drone's tonic, or Random
(a new key every `PROMPTS_PER_KEY` = 10 prompts, with 1.5 s of drone before the first note in a key); and the
degrees on offer (1–7 of the major scale), starting with 1 and 5, added by the player as they get easy. Each
prompt is a drill record (`drill: "ear"`, prompt "Degree 5", key and degrees in `detail`), charted with the other
drills (4th series colour). Sound comes from the browser
here (unlike the user's keyboard, which they monitor through Ableton); audio waits for a click or computer key
after a reload: both ear modes then open stopped ("Ready", click anywhere or press a key) and start once audio
unlocks, instead of queueing sound to burst out on the first click.
The drone's low pass and detune are constants in `tones.ts` (`DRONE_LOWPASS_HZ`, `DRONE_DETUNE_CENTS`).

**Melodies** (mode "earMelody", `src/modes/earMelody.ts`; `makeMelodyPrompt` and `reduceMelody` in
`earTraining.ts`): the root, then N notes (Notes: 2–8, default 3) from the allowed degrees within one octave, from
the root up to the next root (that one only when degree 1 is allowed), no note straight after itself if anything
else is in reach, never the same melody twice running. No drone. The player plays it all back in order, root first
(the root is step 0 of `prompt.notes`), at the exact pitch (the right note in another octave is wrong: "Right note,
wrong octave: too low"); a wrong note holds the step and the whole melody plays again 1 s later. Steps show as dots with the degree
revealed once played (the root's from the start). The staff draws the melody as it's played back, left to right
(`StaffRow` in `staff.ts`, passed through `createPerformanceDrawer`'s `rowOf`): the root grey from the start,
each note once played, and the held keys at the next step. Shares `Settings.ear` with
scale degrees (its tonic picker reads "Key" here). Recorded as `drill: "melody"`, prompt "Root + 3 notes" (the
degrees in `detail.melody`), charted as a 5th series. `tones.stopNotes()` cuts off a melody still playing
(skip, replay, stop).

**Next:** minor and chromatic degrees, a drone on/off and volume, resolving the note to the tonic after answering,
intervals and chord qualities.

## Sight reading (mode "notes", `src/modes/sightReading.ts`)
Replaced note practice. Two sources, chosen by **Level** (`ReadingOptions.level`, saved in `Settings.reading`):
- **Songs, levels 1–5 (default 1):** a passage from a song (see "Sight-reading excerpts"). **Read**
  (`ReadingOptions.part`, `READING_PARTS`): Melody (the voice part, default), or the piano part's right hand, left
  hand, or both hands on a grand staff. Rhythm as written, transposed into the Key (any of the 24, or Random: a new
  key every `PROMPTS_PER_KEY` = 10 passages; default C major; a passage moves by signature, so G major also reads as
  E minor, and the sub says "G major / E minor"). The Level list names the part's own levels (melody and piano
  differ). Each part and level's excerpts are dealt in a shuffled order, all before any repeats. The files are
  fetched the first time they're needed (`src/app/excerpts.ts`: `reading/lieder.json` for melodies,
  `reading/lieder-piano.json` only when piano is chosen; the mode shows "Loading songs…", or "Couldn't load the
  songs": choosing the level again retries). Drawn by `src/views/staffMusic.ts` on one staff, or a grand staff with
  a brace for both hands (clef, key and time signature, bars as written, chords, up to four voices a staff with stems
  up/down and rests raised/lowered, hidden space where a voice sits out, beams by the time signature's default groups
  within a voice, dots, ties, tuplet brackets, rests, accidentals per bar and staff via VexFlow's
  `applyAccidentals`), passed to the staff view as a `StaffMusic` (`"staves" in row`). Title and composer show as
  the prompt, with "from OpenScore Lieder" as the credit.
- **Generated notes (level 0):** a line of N notes (Notes: 1–8, default 4) drawn as quarter notes across the grand
  staff (`StaffRow`), on a staff (Treble C4–A5, Bass E2–C4, or Both E2–A5; Notes and Staff only show for this, Read
  only for songs). Notes are the key signature's only (natural minor), each a different note from the last and at
  most a 6th away, steps twice as likely as leaps; never the same line twice running.

**Playing back** (`reduceReading`, `ReadingState` in `src/exercises/sightReading.ts`): a prompt is `steps`, each the
notes struck at one moment (one note, or a chord across voices and both hands; a tied-over note isn't struck again).
Each note-on is judged against the current step at the exact pitch: one of its notes counts (a chord's in any order,
rolled or together, `struck`), and the step is done when all are; any other note is a mistake and holds the step
(what was struck still counts). A note of the step just finished within `CHORD_SPILL_MS` (300 ms) of finishing it is
ignored, not wrong: playing a whole chord again after a mistake finishes it on its first new note, and the rest of it
follows a moment later (note-on times come from `onPlayerInput`). Played notes turn green, a chord's notes as they're struck; after a mistake the
current step's other notes turn red (a generated line draws the wrong note red just right of the step). Feedback:
"That was E4", ", not in this chord", or "Right note, wrong octave: too low". No timing yet. The held keys aren't
drawn (they'd cover the notes to read). Recorded as `drill: "reading"`, prompt "Songs, level 2" (melody), "Piano,
right hand, level 2" … (detail: key, part, level, excerpt id, notes, chords as "C4+E4") or "4 notes, treble",
charted as a 6th series (`--series-6`, the palette's green); old note-practice records (`"notes"`) still chart, as
"Note names (old)".
**Next:** judging rhythm against the metronome; more easy piano (see the level counts below).

## Sight-reading excerpts (`src/exercises/excerpts.ts`, `scripts/corpus`)
Passages from real songs, rhythm as written: the singer's melody, and the piano part. **Not all rhythm is quarter
notes**: excerpts keep every note value, dot, tie, rest, tuplet, chord and voice, and the drawing shows them.
- **Source:** the OpenScore Lieder corpus (CC0; https://github.com/OpenScore/Lieder; credit asked, not required:
  `credit` in the file). The Essen folksong collection was ruled out: its licence is personal single-user use only, no
  redistribution or teaching materials. Fetch the corpus (not committed, `corpus/` is git-ignored) with
  `git clone --depth 1 --filter=blob:none --sparse https://github.com/OpenScore/Lieder corpus/lieder`, then
  `git -C corpus/lieder sparse-checkout set --no-cone '/scores/**/*.mscx' '/LICENSE.txt'` (about 500 MB).
- **Import:** `node scripts/corpus/import.ts` (Node 24 runs the TypeScript directly; about 20 s) writes
  `public/reading/lieder.json` (melodies; 8 MB, 0.5 MB gzipped) and `public/reading/lieder-piano.json` (15.5 MB,
  0.9 MB gzipped), both committed, and prints, per part, how the excerpts spread over the levels, which single limit
  holds most back from levels 1–3, and the main measures. `scripts/corpus/xml.ts` is a small XML parser.
  `mscx.ts` reads the voice part's staff and the piano's two staves (each staff's clef from its `defaultClef` or the
  instrument's `<clef staff="n">`; a clef before a bar's first note is that bar's) of a MuseScore 2 or 3 score into bars of voices: version 3 `<voice>` wrappers,
  each with a position cursor (`<location>` jumps; a gap becomes hidden space, `hide`; running back over itself is
  "overlap"); version 2 only its first voice (`<track>` mod 4; other voices are placed by absolute ticks, so a bar
  with notes in them is "second voice"). Chords low to high, a unison once; tuplets by id or open until
  `<endTuplet/>`; ties as `<Tie>` or a Tie spanner with `<next>`; grace notes left out. Flags what can't be used:
  cross-staff notes, tremolos, a clef change mid-bar, time jumps, nested tuplets, bars that don't add up (the first
  voice fills the bar; others may stop early). `excerpts.ts`: melodies (`asMelody` adds "chord" and "second
  voice") are cut into phrases (runs of notes ended by a rest; one cut short by an unusable bar or a key/time/clef
  change is dropped), each phrase and each neighbouring pair within 4 bars with at least 4 notes, a neighbour's
  notes in the same bars turned into tidy rests (`restsFor`: on the beat, dotted only in compound time, never across
  the middle of 4/4), tenor parts written as written (treble, an octave up). **Piano** (`cutPianoExcerpts`): both
  staves over the same whole bars as each melody excerpt (the song's phrases make musical places to start and
  stop), when every bar of both is clean, the right hand in treble and the left in bass throughout (a hand in the
  other clef is left out: a reader expects them there); offered as the right hand or left hand when
  it has at least 4 strikes, and both when each hand has 2. Duplicates (strophic verses) are dropped.
  `scripts/corpus/import.ts` isn't typechecked (no Node types); the rest is, and tested in `tests/corpus.test.ts`.
- **Format** (version 2, `src/exercises/excerpts.ts`, shared): an `Excerpt` is key (fifths), time, `staves` (one for
  a melody; right and left hand for piano), each a clef and `voices[voice][bar]` of `ExcerptEvent`s
  `{v: "w"|"h"|"q"|"8"|…, d?: dots, t?: [actual, normal], n?: [{p: MIDI, s: tpc spelling, tie?}] (absent: a rest),
  bar?: whole-bar rest, hide?: space}`, and `parts`: the `ExcerptFeatures` for each part it can be read as (`voice`,
  or `rh`, `lh`, `both`): strikes, bars, key accidentals, chromatic notes, range (the widest staff), ledger lines (the
  most any note needs, `ledgerLines`), widest leap and share of steps (each voice's top line in treble, bottom in
  bass), note values, shortest value, dotted, ties, tuplets, rests inside, syncopations, compound time, chord (most
  notes struck at once in a hand), span (its widest) and voices (most in a staff). `partStaves` picks a part's staves.
- **Steps and ties** (`excerptTimeline`, `excerptSteps`): a tied note lands on the same pitch starting as it ends, in
  its own voice or else another voice of the same staff (piano parts often tie from one voice into another); the
  steps are every untied note starting at each moment, and `stepOf` gives each event's step (a tied-over chord's is
  the step it continues) for colouring. The drawing uses the same ties.
- **Levels** (`levelsFor(part)`, `readingLevel(features, part)`: the first level whose limits an excerpt fits, worked
  out in the app so the cut-offs can change without re-importing). Melody (`READING_LEVELS`, single notes): 1 steps,
  simple rhythm; 2 small leaps, dotted notes; 3 wider range, compound time; 4 accidentals, triplets; 5 anything.
  Piano (`PIANO_LEVELS`, wider ranges, plus chord size, span, voices and strikes a bar): 1 single notes, simple
  rhythm; 2 two-note chords; 3 triads, two voices; 4 fuller chords, triplets; 5 anything. The key signature isn't a
  limit: excerpts are transposed. Current counts (levels 1–5): melody 140 / 1,291 / 3,445 / 4,320 / 2,669 of 11,865;
  right hand 12 / 317 / 1,604 / 2,049 / 2,881; left hand 51 / 728 / 1,355 / 1,665 / 2,754; both hands 0 / 116 / 828 /
  1,604 / 4,429. Lieder accompaniments are rarely single notes, so piano level 1 is thin.
- **Transposing** (`transposeStaves`): all staves by the same interval, by key signature (fifths), respelling each
  tpc, in the octave with the fewest ledger lines over all of them (then the smallest move); null if a note would
  need more than a double sharp/flat. `tupletGroups` splits a bar's tuplet runs into brackets.

## Practice history
Everything practised is recorded, and the **Progress** page charts it.
- **Records, not stats:** plain JSON, only ever added. `run` (one per finished exercise run, alone or in a routine:
  exercise, `exerciseId` with the settings that change what's played, key, metronome settings or null, mistakes,
  duration, BPM, evenness, timing, routine session), `routine` (one per session, finished or left part-way: routine,
  direction, start, first-to-last-note time, each item's outcome, total mistakes, metronome), `drill` (one per note,
  chord or progression prompt answered or skipped: the prompt as asked, grouping details such as chord type and
  inversion, firstTry/corrected/skipped, time to answer). Charts are worked out from these, so new charts don't need
  new records.
- **Ready to move to a server later:** every record has a random UUID, a schema version (`RECORD_VERSION`; readers go
  through `upgradeRecord`, which drops malformed records and ones from a newer version), a UTC time and a device id
  (a UUID kept in localStorage). Everything goes through the `ProgressStore` interface (`add`, `all`, `merge` by id,
  `count`); only `idbStore.ts` knows about IndexedDB (database `chordDisplay` v1, store `records` keyed by id, index on
  `at`). A server would be another `ProgressStore`, or a sync step behind IndexedDB.
- **Recording:** modes hand finished things to a `Recorder` (passed in by main; tests use `noRecorder`), which stamps
  and stores in the background. Sequence practice records each run; routine practice each item's run (with the
  session id) and the session when it finishes or is left (restart, another routine, another mode); drills each
  prompt when answered or skipped (a new prompt from a settings change isn't a skip).
- **Footer:** the record count, Export (a `chord-display-history-<date>.json` file) and Import (merges by id, so
  importing twice adds nothing; says how many were new). If IndexedDB won't open, history is kept in memory and the
  footer says it isn't saved.
- **Progress page:** not a mode. A Progress button in the header (shown pressed while open) sets `AppState.page`;
  "← Back to practice", the button again, or choosing any mode returns to practising (`setMode` always leaves the
  page). What's on screen is `viewOf(state)`: the mode, or "progress", which main starts like a mode (so the mode in
  progress stops: no metronome, a routine left part-way is recorded) with `pageSetup("progress")` (panel "progress"
  hides the staff and practice card, and the page area scrolls). The app always opens on practice. The page has one filter row (range: last 7/30/90 days or all time; routine and exercise, defaulting to the most
  played; the selection lasts while the page is open), summary tiles (days practised, practice time, exercise runs
  and how many clean, routines finished, drill prompts), and cards: practice time per day (columns); the routine's
  time to complete and mistakes per finished session; the exercise's mistakes and on-time share (metronome runs) or
  evenness, each run a faint dot with a line through the day's median; drills' share right first time per day (one
  line per drill, legend) and the trickiest prompts (asked twice or more, least often right first time). Each chart
  has a Table. Practice time = runs outside routines + routine sessions + drill prompts capped at a minute each.
  Imports refresh it (`Mode.refresh`).
- **Charts** (`src/views/charts.ts`): hand-written SVG (no library; the build stays one small offline file), redrawn
  to the container's width. Dataviz rules: 2px lines, ≥8px markers with a surface ring, hairline grid, columns ≤24px
  with a 4px rounded end, no dual axes (two measures = two charts), text never in series colours. Series colours are
  the reference palette's first three dark steps (`--series-1..3`: #3987e5, #d95926, #199e70), validated against the
  panel surface (#1d2026). Hover: a crosshair snaps to the nearest day and the tooltip (value first) lists every
  series there, beside the crosshair and level with the pointer; columns lift.
- **Storage is per address:** the GitHub Pages site and a local file each have their own history; export/import moves
  it. The user plans to practise on GitHub Pages.

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
3. **Started:** sight reading (a line of notes on the staff, played back at pitch) and chord practice (a chord name or a Roman
   numeral in a key, from a filtered set of types, played in any voicing or a required inversion) and progression
   practice (a popular progression in a key, chord by chord), all with right/wrong feedback and a first-try score.
   Prescriptive exercises (above): scales and diatonic chords, and routines of them round the circle of fifths.
   **Exercises as data:** a prompt generator, a matcher with configurable tolerances (any voicing or a specific
   inversion, octave sensitivity, timing window) and feedback.
4. **Audio:** the metronome is **built** (see "Metronome"), and ear training's synthesised drone and notes (see
   "Ear training"). Maybe later: a small sampled piano. Keep it switchable, since the user often monitors through
   Ableton.
5. **Persistence:** practice history is **built** (see "Practice history"): IndexedDB with schema versioning and
   JSON export/import, and the Progress view. Local-first, no accounts.
6. **Tests:** the voicing corpus, recorded MIDI performances replayed through the whole pipeline, and occasional
   notation screenshot tests.

**Platform:** desktop browser only (Chrome or Edge), decided by the user. Tablet is out of scope for now; Safari has
no Web MIDI, so an iPad version would need a native wrapper (Tauri or Capacitor), and only the input layer would change.
