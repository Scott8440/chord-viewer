// The settings controls: each shows a setting and dispatches changes to it, and `showControls` shows just the ones
// the current mode (or page) uses.
import { KEY_PROGRESSION_LABELS, KEY_PROGRESSIONS, type KeyProgression } from "../exercises/keyOrder";
import { CHORD_KEYS, CHORD_PRACTICE_GROUPS } from "../exercises/chordPractice";
import type { PromptStyle } from "../exercises/chordPrompt";
import { EAR_DEGREES, EAR_TONICS, MELODY_LENGTHS, PROMPTS_PER_KEY } from "../exercises/earTraining";
import {
  PRESCRIPTIVE,
  type ExerciseOption,
  type ExerciseOptions,
  type PrescriptiveId,
} from "../exercises/prescriptive";
import {
  CHROMATIC_TONICS,
  DIRECTION_NAMES,
  ROUTINES,
  requireRoutine,
  type CircleDirection,
} from "../exercises/routines";
import type { MinorForm, ScaleOctaves } from "../exercises/scales";
import type { ArpeggioInversion } from "../exercises/technique";
import { levelsFor, type ReadingPart } from "../exercises/excerpts";
import {
  READING_KEYS,
  READING_LENGTHS,
  READING_LEVEL_CHOICES,
  READING_PARTS,
  READING_RANGES,
  type ReadingOptions,
  type ReadingRange,
} from "../exercises/sightReading";
import { pageSetup, viewOf } from "../modes/page";
import type { AppStore } from "../modes/performance";
import type { AppAction, AppState, ModeId, Settings } from "../state/app";
import type { Strictness, Subdivision } from "../timing/grid";
import { prettyAcc, requireKey } from "../theory";
import { createFilterView, type FilterGroup } from "../views/filter";
import { fillKeySelect } from "../views/header";
import { $ } from "./dom";

/** Binds every settings control in the page to its setting. */
export function bindControls(store: AppStore) {
  // Most dispatches are notes being played: the controls only need to look again when a setting changed
  const onSettings = (show: (s: Settings) => void) =>
    store.subscribe((s, prev) => {
      if (s.settings !== prev.settings) show(s.settings);
    });

  function bindSelect(el: HTMLSelectElement, get: (s: Settings) => string, set: (value: string) => AppAction) {
    el.value = get(store.getState().settings);
    el.onchange = () => {
      store.dispatch(set(el.value));
      el.blur(); // so computer-key note input keeps working
    };
    onSettings(s => {
      if (el.value !== get(s)) el.value = get(s);
    });
  }

  function bindCheckbox(el: HTMLInputElement, get: (s: Settings) => boolean, set: (on: boolean) => AppAction) {
    el.checked = get(store.getState().settings);
    el.onchange = () => {
      store.dispatch(set(el.checked));
      el.blur();
    };
    onSettings(s => {
      el.checked = get(s);
    });
  }

  /** A number input: dispatches on change (Enter, the arrows, or leaving the field), showing the setting as clamped. */
  function bindNumber(el: HTMLInputElement, get: (s: Settings) => number, set: (value: number) => AppAction) {
    el.value = String(get(store.getState().settings));
    el.onchange = () => {
      if (el.value !== "" && Number.isFinite(el.valueAsNumber)) store.dispatch(set(el.valueAsNumber));
      el.value = String(get(store.getState().settings));
    };
    el.onkeydown = e => {
      if (e.key === "Enter" || e.key === "Escape") el.blur();
    };
    onSettings(s => {
      if (document.activeElement !== el) el.value = String(get(s));
    });
  }

  /**
   * A filter of grouped checkboxes (`<prefix>Filters`, a details element, with its `<prefix>FilterSummary` and
   * `<prefix>FilterBody`), showing a list setting; `min` of them stay checked.
   */
  function bindFilter(
    prefix: string,
    groups: readonly FilterGroup[],
    label: string,
    get: (s: Settings) => readonly string[],
    set: (selected: string[]) => AppAction,
    min?: number,
  ) {
    const summary = $(`${prefix}FilterSummary`);
    const filter = createFilterView(
      { summary, body: $(`${prefix}FilterBody`) },
      groups,
      label,
      selected => store.dispatch(set(selected)),
      min,
    );
    filter.render(get(store.getState().settings));
    $(`${prefix}Filters`).addEventListener("toggle", () => summary.blur()); // so Space stays the pedal
    store.subscribe((s, prev) => {
      if (get(s.settings) !== get(prev.settings)) filter.render(get(s.settings));
    });
  }

  fillKeySelect($("keySel"), true);
  fillKeySelect($("exKey"), false);
  bindSelect(
    $("keySel"),
    s => s.keyValue,
    value => ({ type: "setKey", value }),
  );
  bindSelect(
    $("modeSel"),
    s => s.mode,
    mode => ({ type: "setMode", mode: mode as ModeId }),
  );
  bindCheckbox(
    $("optPedal"),
    s => s.includeSustained,
    on => ({ type: "setIncludeSustained", on }),
  );
  bindSelect(
    $("promptStyle"),
    s => s.promptStyle,
    style => ({ type: "setPromptStyle", style: style as PromptStyle }),
  );
  bindCheckbox(
    $("optInversions"),
    s => s.inversions,
    on => ({ type: "setInversions", on }),
  );
  for (const k of CHORD_KEYS) {
    const label =
      k === "none"
        ? "None"
        : k === "random"
          ? `Random (new key every ${PROMPTS_PER_KEY})`
          : prettyAcc(requireKey(k).label);
    $("chordKey").append(new Option(label, k));
  }
  bindSelect(
    $("chordKey"),
    s => s.chordKey,
    value => ({ type: "setChordKey", value }),
  );
  const setExercise = (options: Partial<ExerciseOptions>): AppAction => ({ type: "setExerciseOptions", options });
  bindSelect(
    $("exKey"),
    s => s.exercise.key,
    key => setExercise({ key }),
  );
  for (const p of KEY_PROGRESSIONS) $("exProgression").append(new Option(KEY_PROGRESSION_LABELS[p], p));
  bindSelect(
    $("exProgression"),
    s => s.exercise.progression,
    v => setExercise({ progression: v as KeyProgression }),
  );
  bindSelect(
    $("exOctaves"),
    s => String(s.exercise.octaves),
    v => setExercise({ octaves: Number(v) as ScaleOctaves }),
  );
  bindSelect(
    $("exInversion"),
    s => String(s.exercise.inversion),
    v => setExercise({ inversion: Number(v) as ArpeggioInversion }),
  );
  bindSelect(
    $("exMinorForm"),
    s => s.exercise.minorForm,
    v => setExercise({ minorForm: v as MinorForm }),
  );
  bindSelect(
    $("exChords"),
    s => (s.exercise.sevenths ? "sevenths" : "triads"),
    v => setExercise({ sevenths: v === "sevenths" }),
  );
  bindCheckbox(
    $("exRootPosition"),
    s => s.exercise.rootPosition,
    rootPosition => setExercise({ rootPosition }),
  );
  bindCheckbox(
    $("exMetronome"),
    s => s.exercise.metronome,
    metronome => setExercise({ metronome }),
  );
  bindNumber(
    $("exBpm"),
    s => s.exercise.bpm,
    bpm => setExercise({ bpm }),
  );
  bindSelect(
    $("exSubdivision"),
    s => String(s.exercise.subdivision),
    v => setExercise({ subdivision: Number(v) as Subdivision }),
  );
  bindSelect(
    $("exStrictness"),
    s => s.exercise.strictness,
    v => setExercise({ strictness: v as Strictness }),
  );
  bindNumber(
    $("latency"),
    s => s.latencyMs,
    ms => ({ type: "setLatency", ms }),
  );
  for (const t of EAR_TONICS) {
    $("earTonic").append(new Option(t === "random" ? `Random (new key every ${PROMPTS_PER_KEY})` : prettyAcc(t), t));
  }
  bindSelect(
    $("earTonic"),
    s => s.ear.tonic,
    tonic => ({ type: "setEarOptions", options: { tonic } }),
  );
  bindSelect(
    $("earChordLadder"),
    s => (s.earChords.ladder ? "ladder" : "free"),
    v => ({ type: "setEarChordOptions", options: { ladder: v === "ladder" } }),
  );
  bindSelect(
    $("earChordVoicing"),
    s => (s.earChords.inversions ? "inversions" : "root"),
    v => ({ type: "setEarChordOptions", options: { inversions: v === "inversions" } }),
  );
  bindSelect(
    $("earChordSound"),
    s => s.earChords.sound,
    v => ({ type: "setEarChordOptions", options: { sound: v === "piano" ? "piano" : "simple" } }),
  );
  bindSelect(
    $("earChordPlay"),
    s => (s.earChords.broken ? "broken" : "together"),
    v => ({ type: "setEarChordOptions", options: { broken: v === "broken" } }),
  );
  for (const n of MELODY_LENGTHS) $("melodyLength").append(new Option(String(n), String(n)));
  bindSelect(
    $("melodyLength"),
    s => String(s.ear.melodyLength),
    v => ({ type: "setEarOptions", options: { melodyLength: Number(v) } }),
  );
  const setReading = (options: Partial<ReadingOptions>): AppAction => ({ type: "setReadingOptions", options });
  for (const [part, label] of Object.entries(READING_PARTS)) $("readingPart").append(new Option(label, part));
  bindSelect(
    $("readingPart"),
    s => s.reading.part,
    v => setReading({ part: v as ReadingPart }),
  );
  for (const l of READING_LEVEL_CHOICES) $("readingLevel").append(new Option("", String(l)));
  // The levels' names are the part's: a melody's and the piano's differ
  const nameLevels = (part: ReadingPart) =>
    [...$<HTMLSelectElement>("readingLevel").options].forEach(o => {
      const l = Number(o.value);
      o.text = l ? `${l} · ${levelsFor(part)[l - 1].name}` : "Generated notes";
    });
  nameLevels(store.getState().settings.reading.part);
  store.subscribe((s, p) => {
    if (s.settings.reading.part !== p.settings.reading.part) nameLevels(s.settings.reading.part);
  });
  bindSelect(
    $("readingLevel"),
    s => String(s.reading.level),
    v => setReading({ level: Number(v) }),
  );
  for (const n of READING_LENGTHS) $("readingLength").append(new Option(String(n), String(n)));
  bindSelect(
    $("readingLength"),
    s => String(s.reading.length),
    v => setReading({ length: Number(v) }),
  );
  for (const [id, r] of Object.entries(READING_RANGES)) $("readingRange").append(new Option(r.label, id));
  bindSelect(
    $("readingRange"),
    s => s.reading.range,
    v => setReading({ range: v as ReadingRange }),
  );
  for (const k of READING_KEYS) {
    $("readingKey").append(
      new Option(k === "random" ? `Random (new key every ${PROMPTS_PER_KEY})` : prettyAcc(requireKey(k).label), k),
    );
  }
  bindSelect(
    $("readingKey"),
    s => s.reading.key,
    key => setReading({ key }),
  );
  for (const r of ROUTINES) $("routineSel").append(new Option(r.name, r.id));
  bindSelect(
    $("routineSel"),
    s => s.routine.id,
    id => ({ type: "setRoutineOptions", options: { id } }),
  );
  bindSelect(
    $("routineDir"),
    s => s.routine.direction,
    direction => ({ type: "setRoutineOptions", options: { direction: direction as CircleDirection } }),
  );
  for (const t of CHROMATIC_TONICS) $("routineStart").append(new Option(prettyAcc(t), `${t}:major`));
  bindSelect(
    $("routineStart"),
    s => s.routine.start,
    start => ({ type: "setRoutineOptions", options: { start } }),
  );
  bindFilter(
    "chord",
    CHORD_PRACTICE_GROUPS,
    "Chord types",
    s => s.chordTypes,
    types => ({ type: "setChordTypes", types }),
  );
  // Ear training: which scale degrees it asks for (start with 1 and 5, add more as they get easy)
  bindFilter(
    "ear",
    [{ label: "Scale degrees", types: EAR_DEGREES }],
    "Degrees",
    s => s.ear.degrees,
    degrees => ({ type: "setEarOptions", options: { degrees } }),
  );
  // Ear training, chord qualities: which chord types it plays (the chord practice groups; at least two, so there's a choice)
  bindFilter(
    "earChord",
    CHORD_PRACTICE_GROUPS,
    "Chord types",
    s => s.earChords.types,
    types => ({ type: "setEarChordOptions", options: { types } }),
    2,
  );
}

const isPrescriptive = (id: ModeId): id is ModeId & PrescriptiveId => id in PRESCRIPTIVE;

/**
 * The exercises a mode runs (one, or a routine's), and the keys they are in: these decide which exercise options
 * apply. A routine sets each item's key itself, so its Key selector is hidden.
 */
function exercisesOf(s: Settings): { ids: PrescriptiveId[]; keys: string[]; ownKey: boolean } {
  if (isPrescriptive(s.mode)) return { ids: [s.mode], keys: [s.exercise.key], ownKey: true };
  if (s.mode !== "routines") return { ids: [], keys: [], ownKey: false };
  const items = requireRoutine(s.routine.id).items(s.routine.direction, s.routine.start);
  return {
    ids: [...new Set(items.map(i => i.exercise))],
    keys: items.map(i => i.options.key ?? s.exercise.key),
    ownKey: false,
  };
}

/** Shows the controls the mode uses: each exercise lists its options; the minor form only matters in minor keys. */
export function showControls(state: AppState) {
  const s = state.settings,
    id = s.mode,
    page = pageSetup(viewOf(state));
  $("pianoBtn").classList.toggle("on", s.pianoSound);
  $("pianoBtn").setAttribute("aria-pressed", String(s.pianoSound));
  $("progressBtn").classList.toggle("on", state.page === "progress");
  $("progressBtn").setAttribute("aria-pressed", String(state.page === "progress"));
  $("keyPick").hidden = !page.headerKey;
  $("freeView").hidden = page.panel !== "chordName";
  $("practice").hidden = page.panel !== "practice";
  // The progress charts take the whole page: no staff, no practice card
  $("staffCard").hidden = $("chordCard").hidden = page.panel === "progress" || page.panel === "reference";
  $("progressView").hidden = page.panel !== "progress";
  $("referenceView").hidden = page.panel !== "reference";
  $("referenceBtn").classList.toggle("on", state.page === "reference");
  $("referenceBtn").setAttribute("aria-pressed", String(state.page === "reference"));
  $("staff").hidden = page.stage !== "staff";
  $("degreeCircle").hidden = page.stage !== "degrees";
  $("answerBoard").hidden = page.stage !== "answers";
  const ex = exercisesOf(s);
  // Chord names vs Roman numerals matters wherever chords are prompted
  $("chordOptions").hidden = !(id === "chords" || id === "progressions" || ex.ids.some(e => PRESCRIPTIVE[e].chords));
  $("inversionsOpt").hidden = $("chordFilters").hidden = $("chordKeyPick").hidden = id !== "chords";
  // With no key, chord names are any chord, and Roman numerals get a key of their own each time
  $<HTMLSelectElement>("chordKey").options[0].text =
    s.promptStyle === "roman" ? "None (a new key every prompt)" : "None (any chord)";
  $("routineOptions").hidden = id !== "routines";
  // The direction picker names the routine's own directions: round the circle, or up and down chromatically
  const order = requireRoutine(s.routine.id).order;
  $("routineStartPick").hidden = !requireRoutine(s.routine.id).startsOn;
  for (const o of $<HTMLSelectElement>("routineDir").options)
    o.text = DIRECTION_NAMES[order][o.value as CircleDirection].long;
  $("readingOptions").hidden = id !== "reading";
  // Songs come as written; only generated lines have a length and a staff to choose
  $("readingLengthPick").hidden = $("readingRangePick").hidden = s.reading.level !== 0;
  $("readingPartPick").hidden = s.reading.level === 0;
  // Both ear-training modes share their options; melodies have no drone, so the tonic is just the key
  const ear = id === "ear" || id === "earMelody";
  $("earOptions").hidden = !ear;
  // Chord qualities has its Replay on the answer board instead
  $("practiceReplay").hidden = !ear;
  $("earChordOptions").hidden = id !== "earChords";
  // On the ladder its level decides the types and voicing; with free choice the player does
  $("earChordLevelPick").hidden = !s.earChords.ladder;
  $("earChordVoicingPick").hidden = $("earChordFilters").hidden = s.earChords.ladder;
  $("melodyLengthPick").hidden = id !== "earMelody";
  $("earTonicLabel").textContent = id === "earMelody" ? "Key" : "Drone";
  const used = new Set<ExerciseOption>(ex.ids.flatMap(e => PRESCRIPTIVE[e].options));
  // A routine sets each item's key and moves through them itself
  if (!ex.ownKey) {
    used.delete("key");
    used.delete("progression");
  }
  $("exerciseOptions").hidden = !used.size;
  for (const el of document.querySelectorAll<HTMLElement>("#exerciseOptions [data-option]")) {
    const option = el.dataset.option as ExerciseOption;
    el.hidden = !used.has(option) || (option === "minorForm" && !ex.keys.some(k => k.endsWith(":minor")));
  }
  $("metronomeDetails").hidden = !s.exercise.metronome;
}
