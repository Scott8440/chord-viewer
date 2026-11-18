// The user's settings, one table entry each: how it's checked, and where and how it's saved. Loading, saving and
// "did it change?" are all worked out from the table, so a new setting is a field in `Settings` and an entry here.
import { DEFAULT_CHORD_TYPES, sanitizeChordKey, sanitizeChordTypes } from "../exercises/chordPractice";
import { PROMPT_STYLES, type PromptStyle } from "../exercises/chordPrompt";
import { sanitizeChordEarOptions, type ChordEarOptions } from "../exercises/chordEar";
import { sanitizeEarOptions, type EarOptions } from "../exercises/earTraining";
import { sanitizeReadingOptions, type ReadingOptions } from "../exercises/sightReading";
import { sanitizeExerciseOptions, type ExerciseOptions } from "../exercises/prescriptive";
import { sanitizeRoutineOptions, type RoutineOptions } from "../exercises/routines";
import { isKeyValue, type KeyContext } from "../theory";
import { sanitizeProgressionEarOptions, type ProgressionEarOptions } from "../exercises/progressionEar";
import { sanitizeIntervalEarOptions, type IntervalEarOptions } from "../exercises/intervalEar";

export const MODES = [
  "free",
  "reading",
  "chords",
  "progressions",
  "scales",
  "diatonic",
  "fiveFinger",
  "arpeggios",
  "brokenChords",
  "chromatic",
  "routines",
  "ear",
  "earMelody",
  "earChords",
  "earProgressions",
  "earIntervals",
] as const;
export type ModeId = (typeof MODES)[number];

export interface Settings {
  /** Header key selector value, e.g. "C:major", or "" for none. Free play only; exercises never use it. */
  readonly keyValue: string;
  /** Built from `keyValue`; not saved */
  readonly key: KeyContext | null;
  /** Whether pedal-held notes count toward the chord */
  readonly includeSustained: boolean;
  /** Active mode: free play or an exercise */
  readonly mode: ModeId;
  /** Chord template ids that chord practice may ask for */
  readonly chordTypes: readonly string[];
  /** Chord and progression practice (and chord steps in exercises): chord names or Roman numerals */
  readonly promptStyle: PromptStyle;
  /** Chord practice asks for a specific inversion */
  readonly inversions: boolean;
  /** Chord practice, Stay close: each chord's top note within a whole step of the last one's */
  readonly stayClose: boolean;
  /** Chord practice's key: "none", "random" or a key value (see CHORD_KEYS) */
  readonly chordKey: string;
  /** Options shared by the prescriptive exercises (scales, diatonic chords), also the base for routine items */
  readonly exercise: ExerciseOptions;
  /** Which routine, and which way round the circle of fifths */
  readonly routine: RoutineOptions;
  /** Ear training (both modes): the tonic (or random), which scale degrees it asks for, and the melody length */
  readonly ear: EarOptions;
  /** Ear training, chord qualities: which chord types it plays, inversions, and broken before together */
  readonly earChords: ChordEarOptions;
  /** Ear training, progressions: the key (or random), chords per progression and the ladder level */
  readonly earProgressions: ProgressionEarOptions;
  /** Ear training, intervals: the intervals (or the ladder level), how they're played, and the sound */
  readonly earIntervals: IntervalEarOptions;
  /** Sight reading (mode "reading"): how many notes, which staff, which key (or random) */
  readonly reading: ReadingOptions;
  /** How long the player's notes take to arrive after they hear the click (ms): taken off note times when timing */
  readonly latencyMs: number;
  /** The latency has been dealt with: calibrated, set by hand, or calibration declined. Until it is, starting the
   *  metronome opens the calibration. */
  readonly latencyCalibrated: boolean;
  /** Play what comes in on the sampled grand piano (src/audio/piano.ts); off, the player hears their own instrument */
  readonly pianoSound: boolean;
}

/** The settings in the table: all but the key context, which is built from `keyValue` */
export type SettingName = Exclude<keyof Settings, "key">;

/** Settings as saved between sessions; anything missing or invalid falls back to its default. */
export type SavedSettings = { [K in SettingName]?: unknown };

export interface SettingSpec<T> {
  /** Where it's kept in localStorage; left out for a setting that isn't saved there */
  readonly storage?: {
    readonly key: string;
    /** As is (string settings), as JSON, or as "1"/"0" */
    readonly format: "string" | "json" | "flag";
    /** Keys an earlier version saved it under, read in turn while nothing is found */
    readonly legacy?: readonly string[];
  };
  /** The setting from what was saved (or asked for): its default when that's missing or invalid. When loading, it
   *  also gets all the saved settings, for the odd one that depends on another. */
  sanitize(saved: unknown, all?: SavedSettings): T;
}

export const LATENCY_RANGE = { min: -200, max: 300 } as const;
export const sanitizeLatency = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(LATENCY_RANGE.max, Math.max(LATENCY_RANGE.min, Math.round(v)))
    : 0;

const oneOf = <T>(values: readonly T[], v: unknown, fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);
const saved = (key: string, format: "string" | "json" | "flag") => ({ key: `chordDisplay.${key}`, format });

export const SETTINGS: { readonly [K in SettingName]: SettingSpec<Settings[K]> } = {
  keyValue: { storage: saved("key", "string"), sanitize: v => (typeof v === "string" && isKeyValue(v) ? v : "") },
  // Not in localStorage: it comes from the footer checkbox, which the browser restores itself
  includeSustained: { sanitize: v => (typeof v === "boolean" ? v : true) },
  // Sight reading's mode id was "notes" (from the note practice it replaced), so a saved "notes" opens it
  mode: { storage: saved("mode", "string"), sanitize: v => oneOf(MODES, v === "notes" ? "reading" : v, "free") },
  chordTypes: {
    storage: saved("chordTypes", "json"),
    sanitize: v => sanitizeChordTypes(Array.isArray(v) ? v : DEFAULT_CHORD_TYPES),
  },
  promptStyle: { storage: saved("promptStyle", "string"), sanitize: v => oneOf(PROMPT_STYLES, v, "names") },
  inversions: { storage: saved("inversions", "flag"), sanitize: v => v === true },
  stayClose: { storage: saved("stayClose", "flag"), sanitize: v => v === true },
  chordKey: { storage: saved("chordKey", "string"), sanitize: sanitizeChordKey },
  exercise: {
    // Scale options saved by an earlier version ({key, minorForm, octaves}) are read if there are no exercise options
    storage: { ...saved("exercise", "json"), legacy: ["chordDisplay.scale"] },
    sanitize: sanitizeExerciseOptions,
  },
  routine: { storage: saved("routine", "json"), sanitize: sanitizeRoutineOptions },
  ear: { storage: saved("ear", "json"), sanitize: sanitizeEarOptions },
  earChords: { storage: saved("earChords", "json"), sanitize: sanitizeChordEarOptions },
  earProgressions: { storage: saved("earProgressions", "json"), sanitize: sanitizeProgressionEarOptions },
  earIntervals: { storage: saved("earIntervals", "json"), sanitize: sanitizeIntervalEarOptions },
  reading: { storage: saved("reading", "json"), sanitize: sanitizeReadingOptions },
  latencyMs: { storage: saved("latency", "json"), sanitize: sanitizeLatency },
  latencyCalibrated: {
    storage: saved("latencyCalibrated", "json"),
    // A latency saved before this flag existed was calibrated or typed in, unless it's the default 0
    sanitize: (v, all) => v === true || sanitizeLatency(all?.latencyMs) !== 0,
  },
  pianoSound: { storage: saved("pianoSound", "flag"), sanitize: v => v === true },
};

export const SETTING_NAMES = Object.keys(SETTINGS) as SettingName[];

/** Every setting from what was saved (each checked, missing ones at their defaults), except the key context */
export function sanitizeSettings(saved: SavedSettings): Omit<Settings, "key"> {
  const out: Record<string, unknown> = {};
  for (const name of SETTING_NAMES) out[name] = (SETTINGS[name] as SettingSpec<unknown>).sanitize(saved[name], saved);
  return out as unknown as Omit<Settings, "key">;
}

const sameItems = (a: unknown, b: unknown) =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));

/**
 * Whether two values of a setting are the same: equal, arrays with the same items, or option objects whose fields
 * are (a field being a value or an array of values). Enough for every setting, which are at most that deep.
 */
export function sameSetting(a: unknown, b: unknown): boolean {
  if (sameItems(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) return false;
  const ka = Object.keys(a),
    kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every(k => k in b && sameItems((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}
