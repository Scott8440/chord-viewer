// The page around each mode (and the Progress page): which panel it shows and which page-wide behaviours it turns on.
// Data, so a behaviour is written once and any mode can opt into it.
import type { AppState, ModeId } from "../state/app";

export interface PageSetup {
  /** The right-hand panel: the chord name or the practice card, beside the staff; or the progress charts, in place
   *  of both */
  panel: "chordName" | "practice" | "progress";
  /** The header Key picker (free play only: exercises name their key or have their own selector) */
  headerKey: boolean;
  /** Fade the chord name out after IDLE_MS without input (and nothing sounding) */
  fadeChordWhenIdle: boolean;
  /** Run the metronome (click and beat light) while the exercise's metronome option is on */
  metronome: boolean;
}

export const IDLE_MS = 10_000;

const PRACTICE: PageSetup = { panel: "practice", headerKey: false, fadeChordWhenIdle: false, metronome: false };
/** Prescriptive exercises and routines of them: timed against the metronome when it's on */
const TIMED: PageSetup = { ...PRACTICE, metronome: true };

export const PAGE_SETUP: Record<ModeId, PageSetup> = {
  free: { panel: "chordName", headerKey: true, fadeChordWhenIdle: true, metronome: false },
  notes: PRACTICE,
  chords: PRACTICE,
  progressions: PRACTICE,
  scales: TIMED,
  diatonic: TIMED,
  routines: TIMED,
  ear: PRACTICE,
  earMelody: PRACTICE,
};

/** What's on screen: a practice mode, or the Progress page (opened from the header, apart from the modes) */
export type View = ModeId | "progress";

export const viewOf = (s: AppState): View => s.page === "progress" ? "progress" : s.settings.mode;

/** The Progress page: its charts in place of the staff and practice card, nothing running */
const PROGRESS_PAGE: PageSetup = { ...PRACTICE, panel: "progress" };

export const pageSetup = (view: View): PageSetup => view === "progress" ? PROGRESS_PAGE : PAGE_SETUP[view];
