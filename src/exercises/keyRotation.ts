// Which key prompts are in, for drills with a key option: a fixed key, or "random", which moves to a new key every
// PROMPTS_PER_KEY prompts (so a key sinks in before the next). Shared by ear training, chord practice and sight
// reading; each says which keys it allows and how its choice maps to a key. Pure.
import { pick, type Rng } from "./random";

/** With a random key, a new key every this many prompts */
export const PROMPTS_PER_KEY = 10;

/** A random key from `keys`, never `previous` (so a new key is always a change) */
export function randomKey(rng: Rng, keys: readonly string[], previous?: string | null): string {
  let k: string;
  do k = pick(rng, keys); while (k === previous);
  return k;
}

/** The chosen key, or for "random" a random one from `keys` other than `previous` */
export const pickKey = (rng: Rng, choice: string, keys: readonly string[], previous?: string | null): string =>
  choice === "random" ? randomKey(rng, keys, previous) : choice;

/** The key prompts are in, and how many have been asked in it */
export interface KeyRotation<K> {
  readonly key: K;
  readonly inKey: number;
}

/** Counting afresh in a key: at the start, or when the key option changes */
export const keyRotation = <K>(key: K): KeyRotation<K> => ({ key, inKey: 0 });

/** One more prompt in the same key, without moving on (a fresh prompt for other new options) */
export const countInKey = <K>(r: KeyRotation<K>): KeyRotation<K> => ({ key: r.key, inKey: r.inKey + 1 });

/**
 * The key for the next prompt: the same one, or, when the choice is "random" and this key has had its
 * PROMPTS_PER_KEY prompts, a new one (`pick` is given the choice and the key so far, to avoid it).
 */
export function rotateKey<K>(r: KeyRotation<K>, choice: string, pick: (choice: string, previous: K) => K): KeyRotation<K> {
  return countInKey(choice === "random" && r.inKey >= PROMPTS_PER_KEY ? keyRotation(pick(choice, r.key)) : r);
}
