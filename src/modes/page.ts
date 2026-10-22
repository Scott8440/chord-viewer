// The page around each mode: which panel it shows and which page-wide behaviours it turns on. Data, so a behaviour
// is written once and any mode can opt into it.
import type { ModeId } from "../state/app";

export interface PageSetup {
  /** The right-hand panel: the chord name, or the practice card */
  panel: "chordName" | "practice";
  /** The header Key picker (free play only: exercises name their key or have their own selector) */
  headerKey: boolean;
  /** Fade the chord name out after IDLE_MS without input (and nothing sounding) */
  fadeChordWhenIdle: boolean;
}

export const IDLE_MS = 10_000;

const PRACTICE: PageSetup = { panel: "practice", headerKey: false, fadeChordWhenIdle: false };

export const PAGE_SETUP: Record<ModeId, PageSetup> = {
  free: { panel: "chordName", headerKey: true, fadeChordWhenIdle: true },
  notes: PRACTICE,
  chords: PRACTICE,
  progressions: PRACTICE,
  scales: PRACTICE,
  diatonic: PRACTICE,
  routines: PRACTICE,
};
