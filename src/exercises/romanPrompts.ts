// Diatonic chords by Roman numeral: each key's triads and sevenths, and picking one to ask for.
import { buildKey, chromaOf, KEY_MAJORS, KEY_MINORS, type KeyContext } from "../theory";
import type { ChordPrompt } from "./chordPrompt";
import type { Rng } from "./notePractice";

/**
 * Diatonic chords by scale degree (0 = tonic). Minor keys use harmonic minor for V, V7, vii° and vii°7,
 * the usual common-practice choice and the one romanFor treats as in-key.
 */
const DIATONIC: Record<"major" | "minor", readonly { numeral: string; type: string; degree: number }[]> = {
  major: [
    { numeral: "I", type: "M", degree: 0 }, { numeral: "ii", type: "m", degree: 1 }, { numeral: "iii", type: "m", degree: 2 },
    { numeral: "IV", type: "M", degree: 3 }, { numeral: "V", type: "M", degree: 4 }, { numeral: "vi", type: "m", degree: 5 },
    { numeral: "vii°", type: "dim", degree: 6 },
    { numeral: "Imaj7", type: "maj7", degree: 0 }, { numeral: "ii7", type: "m7", degree: 1 }, { numeral: "iii7", type: "m7", degree: 2 },
    { numeral: "IVmaj7", type: "maj7", degree: 3 }, { numeral: "V7", type: "7", degree: 4 }, { numeral: "vi7", type: "m7", degree: 5 },
    { numeral: "viiø7", type: "m7b5", degree: 6 },
  ],
  minor: [
    { numeral: "i", type: "m", degree: 0 }, { numeral: "ii°", type: "dim", degree: 1 }, { numeral: "III", type: "M", degree: 2 },
    { numeral: "iv", type: "m", degree: 3 }, { numeral: "V", type: "M", degree: 4 }, { numeral: "VI", type: "M", degree: 5 },
    { numeral: "vii°", type: "dim", degree: 6 },
    { numeral: "i7", type: "m7", degree: 0 }, { numeral: "iiø7", type: "m7b5", degree: 1 }, { numeral: "IIImaj7", type: "maj7", degree: 2 },
    { numeral: "iv7", type: "m7", degree: 3 }, { numeral: "V7", type: "7", degree: 4 }, { numeral: "VImaj7", type: "maj7", degree: 5 },
    { numeral: "vii°7", type: "dim7", degree: 6 },
  ],
};

/** The diatonic triads and sevenths of a key, with spelled roots. */
export function diatonicChords(key: KeyContext): { numeral: string; type: string; root: string; rootPc: number }[] {
  return DIATONIC[key.mode].map(d => {
    // The 7th degree of minor is raised (harmonic minor)
    const root = key.mode === "minor" && d.degree === 6 ? key.leadingTone! : key.scale[d.degree];
    return { numeral: d.numeral, type: d.type, root, rootPc: chromaOf(root) };
  });
}

const TRIAD_TYPES = ["M", "m", "dim"];
const ALL_KEYS = [...KEY_MAJORS.map(t => t + ":major"), ...KEY_MINORS.map(t => t + ":minor")];

/**
 * Picks a diatonic chord, by Roman numeral, in the given key (or a random key when there is none),
 * limited to the allowed types. If none of those types occur in the key, any diatonic triad is used.
 * Never the same chord twice in a row.
 */
export function makeRomanPrompt(rng: Rng, types: readonly string[], key: KeyContext | null, previous?: ChordPrompt): ChordPrompt {
  for (let tries = 0; ; tries++) {
    const keyValue = key ? key.tonic + ":" + key.mode : ALL_KEYS[Math.floor(rng() * ALL_KEYS.length)];
    const k = key ?? buildKey(keyValue)!;
    const all = diatonicChords(k);
    const allowed = all.filter(c => types.includes(c.type));
    const filterIgnored = allowed.length === 0;
    const pool = filterIgnored ? all.filter(c => TRIAD_TYPES.includes(c.type)) : allowed;
    const c = pool[Math.floor(rng() * pool.length)];
    const repeat = previous && previous.rootPc === c.rootPc && previous.type === c.type;
    // With a single possible chord a repeat is unavoidable
    if (!repeat || tries > 20) {
      return { rootPc: c.rootPc, root: c.root, type: c.type, roman: { numeral: c.numeral, keyValue, filterIgnored } };
    }
  }
}
