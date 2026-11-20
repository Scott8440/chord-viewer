# Etudio (formerly Chord Display): a music theory practice app

**Name** (Nov 2026): Etudio, from étude and studio, shown as the page title and header. Internal names keep the old
one on purpose: the repository, `package.json`, `dist/chord-display.html`, and everything saved: settings keys
(`chordDisplay.*`), the IndexedDB database (`chordDisplay`) and the history export's `format` (`chord-display-history`,
which import checks). Renaming those would lose people's settings and history. Exported files are named
`etudio-history-<date>.json`.

## What this is
Started as an offline replacement for Chordie: it listens to MIDI from any input, shows the notes on a grand staff
and names the most likely chord. It has grown into a music theory practice app: free play, chord and progression
practice, sight reading, prescriptive exercises (scales, diatonic chords, technique) and routines of them,
ear training, a theory quiz (key signatures, the circle of fifths), a metronome, and a practice history with a
Progress page.

The user plays a Komplete Kontrol S88 MK3 with a sustain pedal on Windows, often through loopMIDI because Ableton
holds the device port, and monitors the keyboard's sound through Ableton (the app's own sound is the metronome and
ear training). Desktop Chrome or Edge is the main target, but the page lays out on phones too (Nov 2026), so ear training
works there by tapping; Safari has no Web MIDI, and there's no on-screen piano (not wanted for now). The user practises on the GitHub Pages site.

## Working conventions
- **Work on `main`.** Commit and push straight to `main`; don't create a branch per feature (the user's preference,
  Nov 2026). Run the typecheck, tests and `npm run format:check` before each push.

## Build, deploy, checks
Vite + TypeScript, built to one self-contained file with `vite-plugin-singlefile` (`vite.config.ts` renames it to
`dist/chord-display.html`). `.github/workflows/pages.yml` runs the tests and the build on every push to `main` and
publishes the file as `index.html` plus `reading/` (the excerpt files from `public/reading/`) and `piano/` (the piano
samples from `public/piano/`) to GitHub Pages.
**Offline is no longer a requirement** (Oct 2026): the app may fetch its own static data, but there is still no
server of our own and no telemetry.

```
npm install
npm run dev        # Vite dev server
npm run build      # typecheck, then write dist/chord-display.html
npm test           # Vitest: 578 tests (54 voicings) should pass
npm run typecheck
npm run format     # Prettier, rewriting files; format:check only reports
```
**Formatting:** Prettier 3 (`.prettierrc.json`: printWidth 120, arrowParens "avoid"). `.prettierignore` skips the
generated `public/reading/` data, `tests/voicings.json` (one voicing per line) and Markdown. A pre-commit hook
(simple-git-hooks, installed by `npm install`/`npm ci` through `prepare`) runs lint-staged, which formats the staged
files and stages the result; don't format by hand. The bulk reformat is listed in `.git-blame-ignore-revs`:
`git config blame.ignoreRevsFile .git-blame-ignore-revs`. No ESLint yet: typescript-eslint doesn't support
TypeScript 7.0's native compiler.

Tests (`tests/`) are Vitest with no browser. In the browser console, `__chord` (`src/main.ts`) exposes `analyze`,
`setKey`, `noteOn`, `noteOff`, `setPedal`, `allOff` and `getState` for testing.

Libraries: **tonal 6.5.1** for note, interval, key and scale primitives only (chord recognition is our own);
**VexFlow 4.2.5** (Bravura) for the staff. Both are bundled.

## Architecture
Layers that only talk through data. Read the file before changing a layer; this is the map.
- **Input** (`src/input/`): sources emit the `InputEvent` union (`events.ts`): note-on/off with source and channel,
  pedal, `allNotesOff`, `panic`. `time` is the originating event's `timeStamp` (performance.now() clock), never handler
  time. `midi.ts` (pure `parseMidiMessage` + the Web MIDI source), `keyboard.ts` (computer keys, source `"kbd"`),
  `degreeKeys.ts` (number keys as scale degrees, source `"deg"`), `keys.ts` (`isTypingOrModified`: every computer-key
  handler starts with it).
- **State** (`src/state/`, no DOM): `performance.ts` (pure reducer: held notes per `source:channel`, pedal-sustained
  notes), `app.ts` (`AppState`, `reduceApp`), `settings.ts` (the settings table, below), `store.ts` (subscribers get
  `(state, prev)` only when the state object changed; one that unsubscribes mid-dispatch isn't called again). Reducers
  return the same object when nothing changed, and setters do too when the value is already set, so nothing
  downstream reacts.
- **Theory** (`src/theory/`, pure, no globals; the key is always passed in): spelling, keys and the circle of fifths,
  chord templates (data) and the recognizer, Roman numerals.
- **Exercises** (`src/exercises/`, pure): prompt makers and reducers. `Rng` (`random.ts`) is injected everywhere so
  tests pass a seeded one. `judging.ts` is what every prompt-and-answer reducer shares.
- **Modes** (`src/modes/`): exactly one runs at a time and returns `{stop, skip?}` (plus `refresh` for the Progress
  page). `performance.ts` has what modes share (`createPerformanceDrawer`, `onPlayerInput`, `timingGrid`, `onIdle`,
  `heldNotes`). `page.ts` `PAGE_SETUP` says per mode, as data, which panel and stage it shows, whether the header Key
  picker shows, and which page-wide behaviours (metronome, idle chord fade) it opts into.
- **Views** (`src/views/`): DOM rendering only. `practice/` renders a `PracticeDisplay` that presenters build from
  exercise state; `staff.ts` (VexFlow), `staffMusic.ts` (excerpts), `exerciseRow.ts`, `circleOfFifths.ts`,
  `degreeCircle.ts`, `answerBoard.ts`, `roundViz.ts`, `charts.ts`, `progressView.ts`.
- **Wiring:** `src/main.ts` only connects things; larger wiring is in `src/app/` (`storage.ts`, `controls.ts`,
  `history.ts`, `calibration.ts`, `excerpts.ts`, `midiMap.ts`, `safeStorage.ts`, `dom.ts`). Main starts each view
  through `MODE_REGISTRY` (`src/modes/registry.ts`, a `Record<View, …>` so a mode left out doesn't compile); every
  start function takes one `ModeDeps` object and uses the parts it needs.

## Key mechanisms (where they live, and the rule to respect)
- **Settings table** (`src/state/settings.ts` `SETTINGS`): one entry per setting with its `sanitize` (also its
  default) and, if saved, its localStorage key (`chordDisplay.*`), format and `legacy` keys. Adding a setting: a field
  in `Settings`, an entry in `SETTINGS`, an action. `src/app/storage.ts` saves each setting only when it changes;
  `sameSetting` is the equality used. Controls are bound in `src/app/controls.ts`; exercise options are tagged
  `data-option` and shown only when the exercise lists them.
- **Mode picker** (`src/views/modePicker.ts`): the header's Mode button opens a dialog of tiles; `MODE_INFO` (name,
  one line, 24×24 SVG icon) is typed by mode id, so a new mode needs a tile.
- **Panel look** (Nov 2026, being compared): the footer's "New panel look" toggle (`src/app/panelStyle.ts`, kept in
  `chordDisplay.panelStyle`, not a setting; new unless switched off) puts `polished` on the body. Under it
  (`body.polished` in `src/style.css`) the options sit in a Settings card (`#practiceSettings`) as a grid of fields,
  checkboxes are switches, and the panel's buttons are an action bar with icons. `select[data-seg]` (option
  `data-short` for a shorter name; `data-seg="wide"` takes a whole row) also get segmented buttons
  (`src/views/segmented.ts`) that set the select and fire its change; main re-marks them after each settings change.
  The selects stay the bound controls. Off, `#practiceSettings` is `display: contents` and the panel is as before.
- **Mode registry and page setup:** `src/modes/registry.ts`, `src/modes/page.ts`. The Progress page is a view, not a
  mode (`AppState.page`, not saved; `viewOf`), started like a mode so the running mode stops.
- **Prompt recording** (`src/modes/promptRecords.ts`): times each drill prompt from when it's shown and records it
  once, when answered or skipped (chord practice, sight reading, the ear modes; progression practice records its
  own). A new prompt from a settings change isn't a skip.
- **Chord judging from held keys** (`src/exercises/chordAttempt.ts`, the only place): a match as soon as the held keys
  form the target; a miss only when keys were newly pressed and then all released. `chordMatch.ts` says what counts.
- **Stay close** (chord practice option, setting `stayClose`; `src/exercises/chordPractice.ts`): each chord's top note
  within a whole step of the last chord played right (`lastTop`, kept across prompts), so inversions are needed. A
  diminished triad's tritone gap can leave no tone that near: `stayCloseReach` then allows its nearest tone. The
  right chord played too far is a miss with its own feedback (`jumped`).
- **Key rotation** (`src/exercises/keyRotation.ts`): the "Random" key option shared by drills, a new key every
  `PROMPTS_PER_KEY` (10); each drill's picker only says which keys it allows.
- **Key progression** for exercises (the "Then" option, `src/exercises/keyOrder.ts` `nextKey`): after a run the mode
  sets the next key as the exercise's Key in a microtask, skipped if the mode has stopped by then
  (`tests/sequencePractice.test.ts`). Hidden in routines, which set their own keys.
- **Prescriptive exercises:** `sequence.ts` is the generic matcher (note and chord steps), `prescriptive.ts`
  `PRESCRIPTIVE` the registry of builders and the options each uses. Adding one: a builder, a registry entry, a mode
  id and a menu item. Routines (`routines.ts` `ROUTINES`) are curated data pointing into `PRESCRIPTIVE`; items set only
  their key, every other option comes from the player's exercise settings. `PROGRESSIONS` (`progressions.ts`) is
  likewise a shared list with deliberately no user selector.
- **Hands together** (`handsTogetherExercise` in `src/exercises/scales.ts`; scale practice's `hands` option, "one" by
  default; the old `handsTogether` and `chromatic` mode ids and run records map to scales; option `scale` picks the
  key's scale or chromatic, and routines always use the key's): scales with both hands, parallel an octave apart or contrary from a shared tonic (each hand's minor form by its
  direction). Built from `notes` steps (`src/exercises/sequence.ts`): exact notes together, octave set by the first
  step, done once all are held (keys still down from the step before are fine), a stray note a mistake at once. Runs
  report how far apart the hands landed (`handsApartMs`, the median). On the staff (`exerciseRow`, `StaffRow` `staves`) the left hand's note is on the bass staff and the right's on the
  treble whatever the octave (a shared note on both); a chord step stays on one staff; single notes split at middle C.
- **One Ear training mode** (mode `ear`, setting `earKind`): its types (degrees, melodies, intervals, chords,
  progressions) are views of their own (`EAR_VIEWS` in `src/modes/page.ts`: "ear", "earMelody", "earIntervals",
  "earChords", "earProgressions"), each with its own page setup, start function and MIDI-map scope (the mapper is
  scoped by view). `viewOf` maps mode + type to the view, so changing the type restarts the drill. The old
  per-type mode ids load as `ear` with that type.
- **Shared ear-drill runner** (`src/modes/earDrill.ts` `createEarDrill`): owns answering, recording, rounds, replay
  after a miss, timers, Skip, Stop/Start and waiting for audio; scale degrees (`earTraining.ts`), melodies
  (`earMelody.ts`) and chord qualities (`earChords.ts`) only configure it. `tests/earDrill.test.ts` runs them against
  fakes.
- **Rounds** (`src/exercises/rounds.ts` pure, `src/modes/rounds.ts` `RoundKeeper`): ear prompts come in rounds of
  `ROUND_SIZE` (20); each finished round is a `round` record compared with earlier rounds of the same drill and
  `setup`. The keeper reads rounds once with `ofKind("round")` (cost doesn't grow with history) and adds each round
  only after comparing it; a failed read is logged and retried next time.
- **Ladders** (`src/exercises/ladders.ts` pure; on an ear drill through `src/modes/ladderDrill.ts`: chord qualities and progressions): a drill's
  options as levels (data, like `ROUTINES`). Unlocking is never stored: it's worked out from `round` records tagged
  `ladder: {id, level}` (two rounds in a row at 85%+ at the top level unlock the next; only ever up). Rounds played
  broken, or with free choice, aren't tagged. Changing what a level means needs a new ladder id. The saved level is
  pulled back to the highest unlocked once history is read; after an unlocking round, Next round moves up.
- **Theory quiz** (mode `theory`, for theory knowledge rather than playing; setting `theoryKind` picks the quiz). Its
  quizzes are views of their own, as ear training's types (`THEORY_VIEWS` in `src/modes/page.ts`: "theory" for key
  signatures, "theoryCircle"); `viewOf` maps mode + quiz to the view. Options show per quiz by `data-quiz`.
  - **Key signatures** (`src/exercises/keySignatures.ts` pure, `src/modes/theoryKeySigs.ts`): the staff shows a
    signature and nothing else (stage `staffAnswers`: the staff with a board of smaller boxes under it); the player
    names the key from the board (shuffled per prompt, `choices`: in signature order they'd give the answer away) or
    plays its tonic. Options (setting `keySig`): major, minor or both, up to 3, 5 or 7 sharps or flats. Drill `keySig`.
  - **Key relationships on the circle of fifths** (`src/exercises/circleQuiz.ts` pure, `src/modes/theoryCircle.ts`,
    `src/views/circleQuiz.ts`; the Quiz picker calls it "Circle of fifths"): each question stands alone (an earlier
    version filled the circle in round by round, which got easier as it filled and tested a diagram more than music).
    Both rings (major outside, relative minors inside), turned to a random angle, blank but for what the question
    gives. Kinds (setting `circleQuiz.asks`, or all at random): a key's diatonic neighbour by numeral (V, IV, vi, ii,
    iii; for minor v, iv, III, VI, VII: `DEGREES`); its five closely related keys (the relative shares all seven notes,
    the others six); the key of a signature (a treble staff above the circle, C major given). Those three are
    play-only (`playOnly`): on the circle their answers sit next to the key shown, or a count of steps from C, so
    picking them only tests the drawing (the user found each trivial). The circle isn't picked from at all now: it
    shows the key given and each answer once played; wrong notes are named, not marked on it. Neighbours are spelled
    from the key's side of the circle (D♭'s IV is G♭: `SIDE_SPELLING` in `src/views/practice/theory.ts`). Then a chain of dominants to a
    major tonic, named in order from a board of sevenths (wrong guesses reset after each chord found, since one tried
    early may be the next). Chains are named from the board or by playing each root. Stage
    `circleAnswers`; the signature strip and the board keep their room only while those kinds can come up. Drill
    `circleFifths`, `detail.kind`, guesses kept.
- **Melody ear training** (`src/modes/earMelody.ts`): plays on the sampled piano by default (`ear.melodySound`,
  Piano or Simple; the samples load first, as for intervals). The staff row draws held keys only after a wrong note.
- **Interval ear training** (`src/exercises/intervalEar.ts` pure, `src/modes/earIntervals.ts`): two notes (up, down,
  together or mixed; simple tone or piano), named from a board of intervals m2–P8. A ladder of 7 levels (M3/P5/P8 up to
  all twelve) or free choice with a filter. Records keep wrong answers for the Progress page's mix-ups.
- **Progression ear training** (`src/exercises/progressionEar.ts` pure, `src/modes/earProgressions.ts`): a cadence
  sets up the key, then 3–8 chords play on the sampled piano (bass low, triad above, voice-led to the nearest
  inversion); the player names each by numeral, in any order, on the answer board, whose optional `slots` row shows
  the chords named so far (a slot still to come can be picked, or reached with ← →, to name it next). Numerals are defined by interval and quality (`NUMERALS`), so chords are spelled in any key.
  Half the progressions are common pop loops (`COMMON_LOOPS`), half random. A ladder of 8 levels, I/IV/V up to
  borrowed chords and minor keys; rounds of 10 (a drill can set `roundSize`). Records keep each wrong answer as "played>answered" for the Progress page's mix-ups.
- **Metronome / timing** (`src/timing/`): `AppState.transport` is the one source of truth for where the beats are.
  Only the driver (today the built-in clock, `src/modes/metronome.ts`) dispatches `setTransport`; the click
  (`src/audio/click.ts`, look-ahead scheduler), beat light and judging (`grid.ts`) only read it, so an external clock
  (Ableton MIDI clock) would just be another driver. Tempo changes go through `retempo` so no beat jumps.
- **Latency calibration** (`src/timing/calibration.ts`, `src/views/calibrationDialog.ts`, `src/app/calibration.ts`,
  `src/modes/calibrate.ts`): `latencyMs` is taken off note times. While `AppState.calibrating`, `onPlayerInput` reports
  nothing so exercises ignore the taps.
- **Audio** (`src/audio/`): one shared AudioContext (`context.ts`), unlocked on any click, tap or key (a MIDI note
  isn't a gesture). `tones.ts` synthesises the ear-training sounds (no samples); `tones.latency()` is the output
  latency used to time visuals to what's heard.
- **Piano sound** (`src/audio/piano.ts`, `src/app/piano.ts`, the footer's toggle, setting `pianoSound`): plays
  every note that reaches the store on a sampled grand piano (Salamander Grand Piano V3, CC BY 3.0, credited in
  `public/piano/README.txt`): 30 MP3s, one every three semitones, re-pitched to the nearest; velocity sets level and
  a low-pass cutoff; the sustain pedal holds. The samples load the first time it's on. Off by default (the user
  monitors through Ableton). Chord-quality ear training can also play its prompts on it (option Sound: Piano, with
  `spreadVoicing`: a low bass note and the chord spread above, as in a song) through its own player sharing the
  samples. Sus and sixth chords are never inverted there, and m7/m7♭5 skip the inversion that is 6/m6 when that's an
  answer too: those inversions are other chords, and the honest answer would be marked wrong.
- **MIDI mapping** (`src/input/midiMap.ts` pure, `src/app/midiMap.ts`): maps a key to any control with
  `data-midi-map`, per mode, active only while the control is on screen; a mapped key's note-on/off never reaches the
  performance (main's input asks the mapper first). One key may press several controls that never show together:
  mapping takes the key from controls showing at the time and leaves it on hidden ones; so controls that appear
  together need distinct ids (the board's Next round is `nextRound`, not the panel's `skip`). Saved in
  `chordDisplay.midiMap`.
- **Chord recognizer** (`src/theory/chords.ts`, templates and `RECOGNIZER_WEIGHTS` in `chordTemplates.ts`): template
  matching plus a cost score; every reading carries `reasons`. No two templates share a pitch-class set (a test
  enforces it). The key only re-ranks readings, never turns a real chord into "?". Ties are broken so results are the
  same in every transposition. Known limits: Roman numerals ignore inversions; "I6" is an added-6th chord; rootless
  voicings aren't recognized.
- **Reference pages** (`src/reference/`, `src/views/referenceView.ts`; "Chord forms", "Major and minor scales",
  "Diatonic chords", "Secondary dominants", "Modes"): music theory to read, opened from the header like Progress (`AppState.page` "reference", a view started
  like a mode; nothing plays). A page is an optional intro and sections of HTML, listed in `REFERENCE_PAGES`; the
  sidebar lists them and marks the section in view; clicking a table row picks it out and fades the rest;
  a page can put a key picker (`select[data-key-pick]`) in its intro, showing only rows tagged with that key
  (`simpleTable`'s `rowKeys`) and hiding the sections' introductions; a cell with `data-detail` toggles a short
  reveal in itself and a row under it holding what the page's `detail(id)` builds then (secondary dominants). Diagrams come from `pianoSvg` (`src/views/piano.ts`), and chord
  and scale facts from `chordFormula` (`src/theory/chordFormula.ts`, built on the chord templates) and `scaleFormula`
  (`src/theory/scaleFormula.ts`, tonal's scales and keys; drawn by `src/reference/scaleFigures.ts`), never typed in.
  Prose style: plain and factual, no hype or filler (the user's request).
- **Practice history** (`src/progress/`): records (`run`, `routine`, `drill`, `round`) are plain JSON, only ever
  added, each with a UUID, schema version (`RECORD_VERSION`), UTC time and device id. Charts are worked out from
  records (`stats.ts`), so a new chart needs no new record. Everything goes through the `ProgressStore` interface;
  only `idbStore.ts` knows IndexedDB. Modes record through the `Recorder` they're given (tests use `noRecorder`).
  Export/import merges by id. History is per address (Pages site vs local file).
- **Sight-reading excerpts** (`src/exercises/excerpts.ts`, `scripts/corpus/`): from the OpenScore Lieder corpus (CC0;
  the Essen collection was ruled out by its licence). Fetch the corpus (git-ignored, about 500 MB) with
  `git clone --depth 1 --filter=blob:none --sparse https://github.com/OpenScore/Lieder corpus/lieder` then
  `git -C corpus/lieder sparse-checkout set --no-cone '/scores/**/*.mscx' '/LICENSE.txt'`, and regenerate the
  committed `public/reading/lieder-{voice,rh,lh,both}.json` with `node scripts/corpus/import.ts` (Node 22.18+ runs the
  TypeScript directly). The files are `ExcerptFile`s at `EXCERPT_FILE_VERSION` (3), read strictly by
  `checkExcerptFile` (this version, this part), so a format change means re-importing. Levels are worked out in the
  app (`levelsFor`, `readingLevel`) so cut-offs can change without re-importing; `tests/excerptFiles.test.ts` checks
  the committed files' level counts. `scripts/corpus` is typechecked (Node APIs declared in `node.d.ts`; no
  @types/node). The app fetches each part's file on first use (`src/app/excerpts.ts`); opened as a local file it
  can't.

## Invariants and gotchas
- **Saved data stays loadable.** Old localStorage settings and history records must keep working: settings fall back
  through `legacy` keys (exercise options read `chordDisplay.scale`); sight reading's mode id was `"notes"` and a saved
  `"notes"` loads as `"reading"` (settings and MIDI-map scopes); `DrillKind` keeps `"notes"` (old note practice) so
  old history loads and charts. `latencyCalibrated` counts a latency saved before the flag existed unless it's 0.
  `tests/settings.test.ts` covers these.
- **Records:** readers go through `upgradeRecord`, which drops malformed records and ones from a newer version. The
  IndexedDB database is `chordDisplay` v2 (store `records` keyed by id, indexes `at` and `kind`); an upgrade must keep
  the existing records, and an open tab closes its database on `versionchange`.
- **Escape everything interpolated into HTML/SVG strings** with `esc` (`src/views/html.ts`): imported history, excerpt
  files and storage can hold hostile text. `tests/escaping.test.ts` checks the views.
- **Cancel every timer and subscription in a mode's `stop()`**; a stopped mode must not act (next-prompt timers, the
  key-progression microtask).
- **Space is the pedal.** Buttons and controls blur after use (`onPress` in `src/app/dom.ts`, the `bind*` helpers in
  `controls.ts`) so Space doesn't press them again and computer keys keep working.
- **Exercises never use the header key**: a key is part of the prompt or chosen inside the exercise; the header Key
  picker shows in free play only.
- **Accidentals in text:** `prettyAcc` turns every b into ♭, so use it only on note names; for labels and prose
  use `prettyText` (`src/theory/spelling.ts`), which leaves words like "both" alone.
- **Audio clicks:** cut a note off with `holdAt` (`cancelAndHoldAtTime`, `src/audio/tones.ts`), never
  `cancelScheduledValues` alone, which jumps back to the attack's peak and clicks.
- **Audio waits for a gesture:** after a reload the ear modes open stopped ("Ready") and start once audio unlocks,
  rather than queueing sound that bursts out on the first click.
- **Round score** (`src/views/roundViz.ts`): all three views show at once (dots and ring side by side, the line
  below); the debug switcher that compared them is gone.
- **Phone layout** (`@media (max-width: 760px)` in `src/style.css`): one column (`minmax(0, 1fr)`, so wide things
  shrink), the page scrolls instead of fitting the window, and nothing may be wider than the screen (fixed-width SVGs
  get `max-width: 100%`). The ear modes answered by playing a note show degree buttons (`src/views/degreePad.ts`,
  source `"pad"`, bypassing the MIDI mapper) for the degrees on offer.
- **The staff never moves:** room is reserved for A0–C8 and both chords share one fixed `TickContext`. Treble/bass
  split at middle C (≥ 60 treble). Rows of notes use the wider row staff.
- **Practice modes don't show the circle of fifths** where its numerals would give answers away (chord, progression
  practice); ear training by degree shows no staff or note names, only degrees.
- **Chord-name debounce:** the staff redraws every frame; the chord name waits ~40 ms of stillness so rolled chords
  don't flicker.
- **MIDI:** note-on with velocity 0 is a note-off; CC 120/123 clear notes; Esc and Clear do a full panic.

## Pending directions (agreed, not done)
- Prescriptive exercises: left-hand accompaniment patterns under a right-hand scale (with balance and articulation
  options), polyrhythms, cadences with set voicings, Hanon patterns, a tempo ladder, fingering
  hints, keeping best runs. Moving through keys (Then) was a first step towards folding single exercises and routines
  together, which may be revisited.
- Metronome: an external clock driver (Ableton MIDI clock via loopMIDI) updating the same transport.
- Ladders for scale degrees and melodies, then perhaps other exercises (sight-reading levels, a tempo ladder).
- Ear training: minor and chromatic degrees, drone on/off and volume, resolving the note to the tonic, intervals;
  chord qualities answered by playing the chord back, weighted towards qualities missed.
- Sight reading: judging rhythm against the metronome; more easy piano excerpts (the hands alone are thin at level 1).
- Input: a future on-screen piano or recorded-MIDI playback would be just another `InputEvent` source.
- Tests: recorded MIDI performances replayed through the whole pipeline; occasional notation screenshot tests.
- Possibly a PWA.
