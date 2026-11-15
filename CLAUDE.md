# Chord Display → music theory practice app

## What this is
Started as an offline replacement for Chordie: it listens to MIDI from any input, shows the notes on a grand staff
and names the most likely chord. It has grown into a music theory practice app: free play, chord and progression
practice, sight reading, prescriptive exercises (scales, diatonic chords, technique) and routines of them, three
ear-training modes, a metronome, and a practice history with a Progress page.

The user plays a Komplete Kontrol S88 MK3 with a sustain pedal on Windows, often through loopMIDI because Ableton
holds the device port, and monitors the keyboard's sound through Ableton (the app's own sound is the metronome and
ear training). Desktop Chrome or Edge only (the user's decision); Safari has no Web MIDI, so an iPad version would
need a native wrapper and only the input layer would change. The user practises on the GitHub Pages site.

## Working conventions
- **Work on `main`.** Commit and push straight to `main`; don't create a branch per feature (the user's preference,
  Nov 2026). Run the typecheck, tests and `npm run format:check` before each push.

## Build, deploy, checks
Vite + TypeScript, built to one self-contained file with `vite-plugin-singlefile` (`vite.config.ts` renames it to
`dist/chord-display.html`). `.github/workflows/pages.yml` runs the tests and the build on every push to `main` and
publishes the file as `index.html` plus `reading/` (the excerpt files from `public/reading/`) to GitHub Pages.
**Offline is no longer a requirement** (Oct 2026): the app may fetch its own static data, but there is still no
server of our own and no telemetry.

```
npm install
npm run dev        # Vite dev server
npm run build      # typecheck, then write dist/chord-display.html
npm test           # Vitest: 468 tests (54 voicings) should pass
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
- **Mode registry and page setup:** `src/modes/registry.ts`, `src/modes/page.ts`. The Progress page is a view, not a
  mode (`AppState.page`, not saved; `viewOf`), started like a mode so the running mode stops.
- **Prompt recording** (`src/modes/promptRecords.ts`): times each drill prompt from when it's shown and records it
  once, when answered or skipped (chord practice, sight reading, the ear modes; progression practice records its
  own). A new prompt from a settings change isn't a skip.
- **Chord judging from held keys** (`src/exercises/chordAttempt.ts`, the only place): a match as soon as the held keys
  form the target; a miss only when keys were newly pressed and then all released. `chordMatch.ts` says what counts.
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
- **Shared ear-drill runner** (`src/modes/earDrill.ts` `createEarDrill`): owns answering, recording, rounds, replay
  after a miss, timers, Skip, Stop/Start and waiting for audio; scale degrees (`earTraining.ts`), melodies
  (`earMelody.ts`) and chord qualities (`earChords.ts`) only configure it. `tests/earDrill.test.ts` runs them against
  fakes.
- **Rounds** (`src/exercises/rounds.ts` pure, `src/modes/rounds.ts` `RoundKeeper`): ear prompts come in rounds of
  `ROUND_SIZE` (20); each finished round is a `round` record compared with earlier rounds of the same drill and
  `setup`. The keeper reads rounds once with `ofKind("round")` (cost doesn't grow with history) and adds each round
  only after comparing it; a failed read is logged and retried next time.
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
- **MIDI mapping** (`src/input/midiMap.ts` pure, `src/app/midiMap.ts`): maps a key to any control with
  `data-midi-map`, per mode, active only while the control is on screen; a mapped key's note-on/off never reaches the
  performance (main's input asks the mapper first). Saved in `chordDisplay.midiMap`.
- **Chord recognizer** (`src/theory/chords.ts`, templates and `RECOGNIZER_WEIGHTS` in `chordTemplates.ts`): template
  matching plus a cost score; every reading carries `reasons`. No two templates share a pitch-class set (a test
  enforces it). The key only re-ranks readings, never turns a real chord into "?". Ties are broken so results are the
  same in every transposition. Known limits: Roman numerals ignore inversions; "I6" is an added-6th chord; rootless
  voicings aren't recognized.
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
- **Audio clicks:** cut a note off with `holdAt` (`cancelAndHoldAtTime`, `src/audio/tones.ts`), never
  `cancelScheduledValues` alone, which jumps back to the attack's peak and clicks.
- **Audio waits for a gesture:** after a reload the ear modes open stopped ("Ready") and start once audio unlocks,
  rather than queueing sound that bursts out on the first click.
- **TEMPORARY round-viz debug switcher** (`src/views/roundViz.ts`, saved as `chordDisplay.debugRoundViz`): Dots, Ring
  and Line are being compared. Keep it for now; once the user picks one, remove the switcher and the other two, and
  consider moving it to the left card.
- **The staff never moves:** room is reserved for A0–C8 and both chords share one fixed `TickContext`. Treble/bass
  split at middle C (≥ 60 treble). Rows of notes use the wider row staff.
- **Practice modes don't show the circle of fifths** where its numerals would give answers away (chord, progression
  practice); ear training by degree shows no staff or note names, only degrees.
- **Chord-name debounce:** the staff redraws every frame; the chord name waits ~40 ms of stillness so rolled chords
  don't flicker.
- **MIDI:** note-on with velocity 0 is a note-off; CC 120/123 clear notes; Esc and Clear do a full panic.

## Pending directions (agreed, not done)
- Prescriptive exercises: cadences with set voicings, hands together, Hanon patterns, a tempo ladder, fingering
  hints, keeping best runs. Moving through keys (Then) was a first step towards folding single exercises and routines
  together, which may be revisited.
- Metronome: an external clock driver (Ableton MIDI clock via loopMIDI) updating the same transport.
- Ear training: minor and chromatic degrees, drone on/off and volume, resolving the note to the tonic, intervals;
  chord qualities answered by playing the chord back, weighted towards qualities missed.
- Sight reading: judging rhythm against the metronome; more easy piano excerpts (the hands alone are thin at level 1).
- Audio: maybe a small sampled piano, switchable, since the user monitors through Ableton.
- Input: a future on-screen piano or recorded-MIDI playback would be just another `InputEvent` source.
- Tests: recorded MIDI performances replayed through the whole pipeline; occasional notation screenshot tests.
- Possibly a PWA.
