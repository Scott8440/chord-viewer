// A piano keyboard drawn as SVG, for the reference pages: a range of keys with some marked (a chord's notes), each
// marked key showing its note name, and an optional caption under it (a degree, a number of half steps). A string of
// markup, so a page can place it anywhere; nothing here listens for input.
import { esc } from "./html";

export interface MarkedKey {
  midi: number;
  /** On the key, e.g. "E♭" */
  label?: string;
  /** Under the keyboard, below the key, e.g. "♭3" or "4" */
  caption?: string;
  /** The root is drawn in the accent colour, the other chord tones in the second colour */
  role?: "root" | "tone" | "plain";
}

export interface PianoOptions {
  /** Lowest and highest keys drawn (both white keys look best) */
  low: number;
  high: number;
  keys: readonly MarkedKey[];
  /** For screen readers: what the picture shows */
  label: string;
}

const WHITE_W = 26,
  WHITE_H = 104,
  BLACK_W = 16,
  BLACK_H = 64,
  CAPTION_H = 26;
const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

export function pianoSvg(o: PianoOptions): string {
  const marked = new Map(o.keys.map(k => [k.midi, k]));
  const hasCaptions = o.keys.some(k => k.caption);
  /** Each white key's left edge, and each black key's centre (on the line between its white neighbours) */
  const whites: { midi: number; x: number }[] = [],
    blacks: { midi: number; x: number }[] = [];
  let x = 0;
  for (let m = o.low; m <= o.high; m++) {
    if (isBlack(m)) blacks.push({ midi: m, x });
    else {
      whites.push({ midi: m, x });
      x += WHITE_W;
    }
  }
  const width = x,
    height = WHITE_H + (hasCaptions ? CAPTION_H : 0);
  const cls = (k: MarkedKey | undefined) => (k ? ` ${k.role ?? "tone"}` : "");

  const whiteKeys = whites
    .map(w => {
      const k = marked.get(w.midi);
      const label = k?.label
        ? `<text class="keyLabel" x="${w.x + WHITE_W / 2}" y="${WHITE_H - 12}">${esc(k.label)}</text>`
        : "";
      return `<rect class="white${cls(k)}" x="${w.x}" y="0" width="${WHITE_W}" height="${WHITE_H}" rx="3"/>${label}`;
    })
    .join("");
  const blackKeys = blacks
    .map(b => {
      const k = marked.get(b.midi);
      const label = k?.label
        ? `<text class="keyLabel onBlack" x="${b.x}" y="${BLACK_H - 10}">${esc(k.label)}</text>`
        : "";
      return `<rect class="black${cls(k)}" x="${b.x - BLACK_W / 2}" y="0" width="${BLACK_W}" height="${BLACK_H}" rx="2"/>${label}`;
    })
    .join("");
  const centre = (midi: number) =>
    isBlack(midi) ? blacks.find(b => b.midi === midi)?.x : (whites.find(w => w.midi === midi)?.x ?? 0) + WHITE_W / 2;
  const captions = o.keys
    .filter(k => k.caption)
    .map(k => `<text class="keyCaption" x="${centre(k.midi)}" y="${WHITE_H + 18}">${esc(k.caption!)}</text>`)
    .join("");

  return (
    `<svg class="piano" viewBox="-1 -1 ${width + 2} ${height + 2}" width="${width + 2}" height="${height + 2}" ` +
    `role="img" aria-label="${esc(o.label)}">${whiteKeys}${blackKeys}${captions}</svg>`
  );
}
