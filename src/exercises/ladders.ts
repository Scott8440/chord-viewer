// Ladders: a drill's options as a sequence of levels, each adding one thing, unlocked by playing well. Nothing is
// stored about unlocking: it's worked out from the round records (each tagged with its ladder and level), so it
// survives export and import, and only ever goes up, since records are only added. Pure.

/** A round at this share right first time or better counts towards unlocking the next level */
export const UNLOCK_SHARE = 0.85;
/** … and this many such rounds in a row at a level unlock the next */
export const UNLOCK_ROUNDS = 2;

export interface LadderLevel<O> {
  /** What it practises, e.g. "Major and minor" */
  name: string;
  options: O;
}

export interface Ladder<O> {
  /** Kept on round records: a new ladder (not a tweak) gets a new id, so progress on the old one isn't misread */
  id: string;
  levels: readonly LadderLevel<O>[];
}

/** A finished round on a ladder, as the unlock rule sees it */
export interface LadderRound {
  level: number;
  share: number;
}

export interface LadderProgress {
  /** The highest level unlocked (0 when only the first is) */
  unlocked: number;
  /** Rounds in a row at UNLOCK_SHARE or better at each level, up to the latest round played at it */
  streaks: number[];
}

/**
 * Where the player stands on a ladder after these rounds (oldest first). Each level's streak counts its own rounds in
 * a row at UNLOCK_SHARE or better (rounds at other levels in between don't break it); reaching UNLOCK_ROUNDS at the
 * highest unlocked level unlocks the next. Rounds at levels not yet unlocked (another device's, merged in later) are
 * counted too, in case that order unlocks them.
 */
export function ladderProgress(levels: number, rounds: readonly LadderRound[]): LadderProgress {
  const streaks = Array.from({ length: levels }, () => 0);
  let unlocked = 0;
  for (const r of rounds) {
    if (!Number.isInteger(r.level) || r.level < 0 || r.level >= levels) continue;
    streaks[r.level] = r.share >= UNLOCK_SHARE ? streaks[r.level] + 1 : 0;
    while (unlocked < levels - 1 && streaks[unlocked] >= UNLOCK_ROUNDS) unlocked++;
  }
  return { unlocked, streaks };
}

/** How many more rounds at UNLOCK_SHARE or better unlock the level after `level` (0 when it already is) */
export const roundsToUnlock = (p: LadderProgress, level: number): number =>
  level < p.unlocked ? 0 : Math.max(0, UNLOCK_ROUNDS - p.streaks[level]);

/** Chord-quality ear training: triads first, from the easiest pair to tell apart, then inversions, then sevenths */
export interface ChordEarLevelOptions {
  types: readonly string[];
  inversions: boolean;
}

const TRIADS = ["M", "m", "dim", "aug"];
const SEVENTHS = ["maj7", "7", "m7", "m7b5", "dim7"];

export const CHORD_EAR_LADDER: Ladder<ChordEarLevelOptions> = {
  id: "chordEar.1",
  levels: [
    { name: "Major and minor", options: { types: ["M", "m"], inversions: false } },
    { name: "Add diminished", options: { types: ["M", "m", "dim"], inversions: false } },
    { name: "Add augmented", options: { types: TRIADS, inversions: false } },
    { name: "Triads in any inversion", options: { types: TRIADS, inversions: true } },
    { name: "Suspended chords", options: { types: ["M", "m", "sus2", "sus4"], inversions: false } },
    { name: "Major and dominant sevenths", options: { types: ["maj7", "7"], inversions: false } },
    { name: "Add minor seventh", options: { types: ["maj7", "7", "m7"], inversions: false } },
    { name: "Add half-diminished", options: { types: ["maj7", "7", "m7", "m7b5"], inversions: false } },
    { name: "Add diminished seventh", options: { types: SEVENTHS, inversions: false } },
    { name: "Sevenths in any inversion", options: { types: SEVENTHS, inversions: true } },
    { name: "Triads and sevenths", options: { types: [...TRIADS, ...SEVENTHS], inversions: false } },
    { name: "Everything, any inversion", options: { types: [...TRIADS, ...SEVENTHS], inversions: true } },
  ],
};
