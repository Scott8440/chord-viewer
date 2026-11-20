// The page around each mode (and the Progress page): which panel it shows and which page-wide behaviours it turns on.
// Data, so a behaviour is written once and any mode can opt into it.
import type { AppState, EarKind, ModeId, TheoryKind } from "../state/app";

export interface PageSetup {
  /** The right-hand panel: the chord name or the practice card, beside the staff; or the progress charts, in place
   *  of both */
  panel: "chordName" | "practice" | "progress" | "reference";
  /** What the left-hand card shows: the staff, ear training's scale-degree circle (no notes, only degrees), a
   *  board of large answer boxes (chord qualities), or the staff with a board of smaller boxes under it (the theory
   *  quiz), or the circle of fifths to fill in with a board under it (the circle quiz) */
  stage: "staff" | "degrees" | "answers" | "staffAnswers" | "circleAnswers";
  /** The header Key picker (free play only: exercises name their key or have their own selector) */
  headerKey: boolean;
  /** Fade the chord name out after IDLE_MS without input (and nothing sounding) */
  fadeChordWhenIdle: boolean;
  /** Run the metronome (click and beat light) while the exercise's metronome option is on */
  metronome: boolean;
}

export const IDLE_MS = 10_000;

const PRACTICE: PageSetup = {
  panel: "practice",
  stage: "staff",
  headerKey: false,
  fadeChordWhenIdle: false,
  metronome: false,
};
/** Prescriptive exercises and routines of them: timed against the metronome when it's on */
const TIMED: PageSetup = { ...PRACTICE, metronome: true };

/** Ear training's types, as views of their own (each its own stage, start function and MIDI mappings): scale degrees
 *  keep the mode's own id */
export type EarView = "ear" | "earMelody" | "earIntervals" | "earChords" | "earProgressions";
export const EAR_VIEWS: Readonly<Record<EarKind, EarView>> = {
  degrees: "ear",
  melodies: "earMelody",
  intervals: "earIntervals",
  chords: "earChords",
  progressions: "earProgressions",
};

/** The theory quiz's quizzes, as views of their own (as ear training's types): key signatures keep the mode's id */
export type TheoryView = "theory" | "theoryCircle";
export const THEORY_VIEWS: Readonly<Record<TheoryKind, TheoryView>> = {
  keySignatures: "theory",
  circle: "theoryCircle",
};

export const PAGE_SETUP: Record<ModeId | EarView | TheoryView, PageSetup> = {
  free: { panel: "chordName", stage: "staff", headerKey: true, fadeChordWhenIdle: true, metronome: false },
  reading: PRACTICE,
  chords: PRACTICE,
  progressions: PRACTICE,
  scales: TIMED,
  diatonic: TIMED,
  fiveFinger: TIMED,
  arpeggios: TIMED,
  brokenChords: TIMED,
  routines: TIMED,
  ear: { ...PRACTICE, stage: "degrees" },
  earMelody: PRACTICE,
  earChords: { ...PRACTICE, stage: "answers" },
  earProgressions: { ...PRACTICE, stage: "answers" },
  earIntervals: { ...PRACTICE, stage: "answers" },
  theory: { ...PRACTICE, stage: "staffAnswers" },
  theoryCircle: { ...PRACTICE, stage: "circleAnswers" },
};

/** What's on screen: a practice mode (ear training as its type), or the Progress or Reference page (opened from the
 *  header, apart from the modes) */
export type View = ModeId | EarView | TheoryView | "progress" | "reference";

export const viewOf = (s: AppState): View =>
  s.page !== "practice"
    ? s.page
    : s.settings.mode === "ear"
      ? EAR_VIEWS[s.settings.earKind]
      : s.settings.mode === "theory"
        ? THEORY_VIEWS[s.settings.theoryKind]
        : s.settings.mode;

/** The Progress page: its charts in place of the staff and practice card, nothing running */
const PROGRESS_PAGE: PageSetup = { ...PRACTICE, panel: "progress" };

/** The Reference page: reading, in place of the staff and practice card, nothing running */
const REFERENCE_PAGE: PageSetup = { ...PRACTICE, panel: "reference" };

export const pageSetup = (view: View): PageSetup =>
  view === "progress" ? PROGRESS_PAGE : view === "reference" ? REFERENCE_PAGE : PAGE_SETUP[view];
