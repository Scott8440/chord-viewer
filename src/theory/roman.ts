// Roman numeral analysis of a chord reading relative to a key.
import type { ChordReading } from "./chords";
import type { KeyContext } from "./key";
import { chromaOf, LETTERS, prettyAcc } from "./spelling";

// Roman numeral for a chord relative to a key, e.g. V7, ii7, viiø7, ♭VII
export function romanFor(r: ChordReading, key: KeyContext): string {
  const NUM = ["I", "II", "III", "IV", "V", "VI", "VII"];
  const deg = (LETTERS.indexOf(r.root[0]) - LETTERS.indexOf(key.tonic[0]) + 7) % 7;
  const expected = key.scale[deg];
  let acc = "";
  if (r.root !== expected && r.root !== key.leadingTone) {
    const diff = (chromaOf(r.root) - chromaOf(expected) + 12) % 12;
    acc = diff === 1 ? "♯" : diff === 11 ? "♭" : diff === 2 ? "𝄪" : diff === 10 ? "𝄫" : "";
  }
  const a = r.alias;
  const has = (iv: number) => r.tonePcs.includes((chromaOf(r.root) + iv) % 12);
  const lower = has(3) && !has(4);
  let num = NUM[deg];
  if (lower) num = num.toLowerCase();
  let suffix;
  if (a === "dim") suffix = "°";
  else if (a === "dim7") suffix = "°7";
  else if (a === "m7b5") suffix = "ø7";
  else if (a === "aug") suffix = "+";
  else if (a === "M" || a === "m") suffix = "";
  else suffix = r.type.replace(/^m(?!aj)/, "").replace(/^\((.*)\)$/, "$1");
  return acc + num + prettyAcc(suffix);
}
