// Ladders in the practice panel: where the player is while a round is on, and what the round did for unlocking.
import { roundsToUnlock, UNLOCK_ROUNDS, type LadderLevel, type LadderProgress } from "../../exercises/ladders";

export interface LadderStatus {
  levels: readonly LadderLevel<unknown>[];
  /** The level being played (0-based) */
  level: number;
  progress: LadderProgress;
  /** Whether this round counts towards unlocking (not with the notes played one by one first) */
  counts: boolean;
}

const levelName = (st: LadderStatus, level: number) => `level ${level + 1}: ${st.levels[level].name}`;

/** While playing: "Level 2 of 12 · Add diminished · 1 of 2 rounds at 85%+ to unlock the next" */
export function ladderPlayingText(st: LadderStatus): string {
  const head = `Level ${st.level + 1} of ${st.levels.length} · ${st.levels[st.level].name}`;
  if (!st.counts) return `${head} · broken chords don't count towards unlocking`;
  if (st.level === st.levels.length - 1) return `${head} · top of the ladder`;
  if (st.level < st.progress.unlocked) return `${head} · unlocked up to level ${st.progress.unlocked + 1}`;
  return `${head} · ${UNLOCK_ROUNDS - roundsToUnlock(st.progress, st.level)} of ${UNLOCK_ROUNDS} rounds at 85%+ to unlock the next`;
}

/** The new level a round just unlocked (the one after the level played), if it did */
export const justUnlocked = (st: LadderStatus, before: LadderProgress): number | null =>
  st.progress.unlocked > before.unlocked && st.progress.unlocked === st.level + 1 ? st.progress.unlocked : null;

/** At a round's end, given where things stood before it: what it did for unlocking */
export function ladderSummaryText(st: LadderStatus, before: LadderProgress, share: number): string {
  const unlocked = justUnlocked(st, before);
  if (unlocked != null) return `🔓 Unlocked ${levelName(st, unlocked)}. Next round moves you up.`;
  if (!st.counts) return "Played broken: rounds count towards unlocking only when the chord is played together.";
  if (st.level === st.levels.length - 1) return "Top of the ladder.";
  if (st.level < before.unlocked) return `You've unlocked up to ${levelName(st, before.unlocked)}.`;
  const need = roundsToUnlock(st.progress, st.level);
  const next = levelName(st, st.level + 1);
  return share >= 0.85 && need < UNLOCK_ROUNDS
    ? `${need} more round${need > 1 ? "s" : ""} at 85% or better unlock${need > 1 ? "" : "s"} ${next}.`
    : `${UNLOCK_ROUNDS} rounds in a row at 85% or better unlock ${next}.`;
}
