// Rounds: ear training in groups of ROUND_SIZE prompts instead of an endless stream. At the end of a round, its share
// right first time, compared with earlier rounds played the same way (same drill, same options). Pure.

export const ROUND_SIZE = 20;
/** How many earlier rounds the comparison and its little chart look back over */
export const ROUNDS_COMPARED = 10;

/** The drill counters every ear mode keeps (answered includes skips) */
export interface Counters { answered: number; firstTry: number }

/** Where a round stands: prompts finished and right first time since it began */
export const roundProgress = (start: Counters, now: Counters): Counters =>
  ({ answered: now.answered - start.answered, firstTry: now.firstTry - start.firstTry });

export const roundDone = (start: Counters, now: Counters) => roundProgress(start, now).answered >= ROUND_SIZE;

export interface RoundComparison {
  /** This round's share right first time, 0–1 */
  share: number;
  /** Earlier rounds' shares, oldest first, the last ROUNDS_COMPARED */
  previous: number[];
  /** The round before this one, the best of the earlier ones, and their average (null when there are none) */
  last: number | null;
  best: number | null;
  average: number | null;
}

export function compareRound(share: number, earlier: readonly number[]): RoundComparison {
  const previous = earlier.slice(-ROUNDS_COMPARED);
  return {
    share, previous,
    last: previous.length ? previous[previous.length - 1] : null,
    best: previous.length ? Math.max(...previous) : null,
    average: previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : null,
  };
}

/** A finished round, as shown at its end */
export interface RoundSummary {
  size: number;
  firstTry: number;
  durationMs: number;
  /** Null until the earlier rounds have been read */
  comparison: RoundComparison | null;
}
