// The settings controls: each shows a setting and dispatches changes to it, and `showControls` shows just the ones
// the current mode (or page) uses.
import { CHORD_KEYS } from "../exercises/chordPractice";
import type { PromptStyle } from "../exercises/chordPrompt";
import { EAR_TONICS, MELODY_LENGTHS, PROMPTS_PER_KEY } from "../exercises/earTraining";
import { PRESCRIPTIVE, type ExerciseOption, type ExerciseOptions, type PrescriptiveId } from "../exercises/prescriptive";
import { ROUTINES, routineById, type CircleDirection } from "../exercises/routines";
import type { MinorForm, ScaleOctaves } from "../exercises/scales";
import { READING_LEVELS } from "../exercises/excerpts";
import {
  READING_KEYS, READING_LENGTHS, READING_LEVEL_CHOICES, READING_RANGES, type ReadingOptions, type ReadingRange,
} from "../exercises/sightReading";
import { pageSetup, viewOf } from "../modes/page";
import type { AppStore } from "../modes/performance";
import type { AppAction, AppState, ModeId, Settings } from "../state/app";
import type { Strictness, Subdivision } from "../timing/grid";
import { buildKey, prettyAcc } from "../theory";
import { fillKeySelect } from "../views/header";
import { $ } from "./dom";

/** Binds every settings control in the page to its setting. */
export function bindControls(store: AppStore) {
  function bindSelect(el: HTMLSelectElement, get: (s: Settings) => string, set: (value: string) => AppAction) {
    el.value = get(store.getState().settings);
    el.onchange = () => {
      store.dispatch(set(el.value));
      el.blur();   // so computer-key note input keeps working
    };
    store.subscribe(s => { if (el.value !== get(s.settings)) el.value = get(s.settings); });
  }

  function bindCheckbox(el: HTMLInputElement, get: (s: Settings) => boolean, set: (on: boolean) => AppAction) {
    el.checked = get(store.getState().settings);
    el.onchange = () => {
      store.dispatch(set(el.checked));
      el.blur();
    };
    store.subscribe(s => { el.checked = get(s.settings); });
  }

  /** A number input: dispatches on change (Enter, the arrows, or leaving the field), showing the setting as clamped. */
  function bindNumber(el: HTMLInputElement, get: (s: Settings) => number, set: (value: number) => AppAction) {
    el.value = String(get(store.getState().settings));
    el.onchange = () => {
      if (el.value !== "" && Number.isFinite(el.valueAsNumber)) store.dispatch(set(el.valueAsNumber));
      el.value = String(get(store.getState().settings));
    };
    el.onkeydown = e => { if (e.key === "Enter" || e.key === "Escape") el.blur(); };
    store.subscribe(s => { if (document.activeElement !== el) el.value = String(get(s.settings)); });
  }

  fillKeySelect($("keySel"), true);
  fillKeySelect($("exKey"), false);
  bindSelect($("keySel"), s => s.keyValue, value => ({ type: "setKey", value }));
  bindSelect($("modeSel"), s => s.mode, mode => ({ type: "setMode", mode: mode as ModeId }));
  bindCheckbox($("optPedal"), s => s.includeSustained, on => ({ type: "setIncludeSustained", on }));
  bindSelect($("promptStyle"), s => s.promptStyle, style => ({ type: "setPromptStyle", style: style as PromptStyle }));
  bindCheckbox($("optInversions"), s => s.inversions, on => ({ type: "setInversions", on }));
  for (const k of CHORD_KEYS) {
    const label = k === "none" ? "None" : k === "random" ? `Random (new key every ${PROMPTS_PER_KEY})` : prettyAcc(buildKey(k)!.label);
    $("chordKey").append(new Option(label, k));
  }
  bindSelect($("chordKey"), s => s.chordKey, value => ({ type: "setChordKey", value }));
  const setExercise = (options: Partial<ExerciseOptions>): AppAction => ({ type: "setExerciseOptions", options });
  bindSelect($("exKey"), s => s.exercise.key, key => setExercise({ key }));
  bindSelect($("exOctaves"), s => String(s.exercise.octaves), v => setExercise({ octaves: Number(v) as ScaleOctaves }));
  bindSelect($("exMinorForm"), s => s.exercise.minorForm, v => setExercise({ minorForm: v as MinorForm }));
  bindSelect($("exChords"), s => s.exercise.sevenths ? "sevenths" : "triads", v => setExercise({ sevenths: v === "sevenths" }));
  bindCheckbox($("exRootPosition"), s => s.exercise.rootPosition, rootPosition => setExercise({ rootPosition }));
  bindCheckbox($("exMetronome"), s => s.exercise.metronome, metronome => setExercise({ metronome }));
  bindNumber($("exBpm"), s => s.exercise.bpm, bpm => setExercise({ bpm }));
  bindSelect($("exSubdivision"), s => String(s.exercise.subdivision), v => setExercise({ subdivision: Number(v) as Subdivision }));
  bindSelect($("exStrictness"), s => s.exercise.strictness, v => setExercise({ strictness: v as Strictness }));
  bindNumber($("latency"), s => s.latencyMs, ms => ({ type: "setLatency", ms }));
  for (const t of EAR_TONICS) {
    $("earTonic").append(new Option(t === "random" ? `Random (new key every ${PROMPTS_PER_KEY})` : prettyAcc(t), t));
  }
  bindSelect($("earTonic"), s => s.ear.tonic, tonic => ({ type: "setEarOptions", options: { tonic } }));
  for (const n of MELODY_LENGTHS) $("melodyLength").append(new Option(String(n), String(n)));
  bindSelect($("melodyLength"), s => String(s.ear.melodyLength),
    v => ({ type: "setEarOptions", options: { melodyLength: Number(v) } }));
  const setReading = (options: Partial<ReadingOptions>): AppAction => ({ type: "setReadingOptions", options });
  for (const l of READING_LEVEL_CHOICES) {
    $("readingLevel").append(new Option(l ? `${l} · ${READING_LEVELS[l - 1].name}` : "Generated notes", String(l)));
  }
  bindSelect($("readingLevel"), s => String(s.reading.level), v => setReading({ level: Number(v) }));
  for (const n of READING_LENGTHS) $("readingLength").append(new Option(String(n), String(n)));
  bindSelect($("readingLength"), s => String(s.reading.length), v => setReading({ length: Number(v) }));
  for (const [id, r] of Object.entries(READING_RANGES)) $("readingRange").append(new Option(r.label, id));
  bindSelect($("readingRange"), s => s.reading.range, v => setReading({ range: v as ReadingRange }));
  for (const k of READING_KEYS) {
    $("readingKey").append(new Option(k === "random" ? `Random (new key every ${PROMPTS_PER_KEY})` : prettyAcc(buildKey(k)!.label), k));
  }
  bindSelect($("readingKey"), s => s.reading.key, key => setReading({ key }));
  for (const r of ROUTINES) $("routineSel").append(new Option(r.name, r.id));
  bindSelect($("routineSel"), s => s.routine.id, id => ({ type: "setRoutineOptions", options: { id } }));
  bindSelect($("routineDir"), s => s.routine.direction,
    direction => ({ type: "setRoutineOptions", options: { direction: direction as CircleDirection } }));
}

const isPrescriptive = (id: ModeId): id is ModeId & PrescriptiveId => id in PRESCRIPTIVE;

/**
 * The exercises a mode runs (one, or a routine's), and the keys they are in: these decide which exercise options
 * apply. A routine sets each item's key itself, so its Key selector is hidden.
 */
function exercisesOf(s: Settings): { ids: PrescriptiveId[]; keys: string[]; ownKey: boolean } {
  if (isPrescriptive(s.mode)) return { ids: [s.mode], keys: [s.exercise.key], ownKey: true };
  if (s.mode !== "routines") return { ids: [], keys: [], ownKey: false };
  const items = routineById(s.routine.id)!.items(s.routine.direction);
  return { ids: [...new Set(items.map(i => i.exercise))], keys: items.map(i => i.options.key ?? s.exercise.key), ownKey: false };
}

/** Shows the controls the mode uses: each exercise lists its options; the minor form only matters in minor keys. */
export function showControls(state: AppState) {
  const s = state.settings, id = s.mode, page = pageSetup(viewOf(state));
  $("progressBtn").classList.toggle("on", state.page === "progress");
  $("progressBtn").setAttribute("aria-pressed", String(state.page === "progress"));
  $("keyPick").hidden = !page.headerKey;
  $("freeView").hidden = page.panel !== "chordName";
  $("practice").hidden = page.panel !== "practice";
  // The progress charts take the whole page: no staff, no practice card
  $("staffCard").hidden = $("chordCard").hidden = page.panel === "progress";
  $("progressView").hidden = page.panel !== "progress";
  $("staff").hidden = page.stage !== "staff";
  $("degreeCircle").hidden = page.stage !== "degrees";
  const ex = exercisesOf(s);
  // Chord names vs Roman numerals matters wherever chords are prompted
  $("chordOptions").hidden = !(id === "chords" || id === "progressions" || ex.ids.some(e => PRESCRIPTIVE[e].chords));
  $("inversionsOpt").hidden = $("chordFilters").hidden = $("chordKeyPick").hidden = id !== "chords";
  // With no key, chord names are any chord, and Roman numerals get a key of their own each time
  $<HTMLSelectElement>("chordKey").options[0].text = s.promptStyle === "roman" ? "None (a new key every prompt)" : "None (any chord)";
  $("routineOptions").hidden = id !== "routines";
  $("readingOptions").hidden = id !== "notes";
  // Songs come as written; only generated lines have a length and a staff to choose
  $("readingLengthPick").hidden = $("readingRangePick").hidden = s.reading.level !== 0;
  // Both ear-training modes share their options; melodies have no drone, so the tonic is just the key
  const ear = id === "ear" || id === "earMelody";
  $("earOptions").hidden = $("practiceReplay").hidden = !ear;
  $("melodyLengthPick").hidden = id !== "earMelody";
  $("earTonicLabel").textContent = id === "earMelody" ? "Key" : "Drone";
  const used = new Set<ExerciseOption>(ex.ids.flatMap(e => PRESCRIPTIVE[e].options));
  if (!ex.ownKey) used.delete("key");
  $("exerciseOptions").hidden = !used.size;
  for (const el of document.querySelectorAll<HTMLElement>("#exerciseOptions [data-option]")) {
    const option = el.dataset.option as ExerciseOption;
    el.hidden = !used.has(option) || (option === "minorForm" && !ex.keys.some(k => k.endsWith(":minor")));
  }
  $("metronomeDetails").hidden = !s.exercise.metronome;
}
