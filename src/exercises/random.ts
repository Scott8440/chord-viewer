// Random choices for the drills, all from an injected rng so tests can pass a seeded one. Each helper calls the rng
// a fixed number of times (once per pick, once per swap), so a seeded sequence always gives the same prompts.

/** A source of numbers in [0, 1), like Math.random */
export type Rng = () => number;

/** A whole number from 0 up to, not including, `n` */
export const randomInt = (rng: Rng, n: number): number => Math.floor(rng() * n);

/** One of `items`, each as likely */
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[randomInt(rng, items.length)];

/** A copy of `items` in a random order (Fisher–Yates) */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
