// Chord name, description, Roman numeral and alternatives.
import { prettyAcc, type Analysis } from "../theory";
import { esc } from "./html";

export interface ChordNameView {
  /** Shows a result; null keeps the last chord visible, faded. */
  render(result: Analysis | null): void;
  /** Forgets the last chord, so silence shows "Play something" again (e.g. after a key change). */
  reset(): void;
  /** Whether a chord or note is on show (as opposed to "Play something") */
  showing(): boolean;
  /** Fades the whole display out (true) or brings it straight back (false) */
  setFading(on: boolean): void;
  /** Forgets the last chord and shows "Play something" */
  clear(): void;
}

export function createChordNameView(els: {
  root: HTMLElement; name: HTMLElement; sub: HTMLElement; roman: HTMLElement; alts: HTMLElement;
}): ChordNameView {
  let lastResult: Analysis | null = null;
  return {
    reset() { lastResult = null; },
    showing: () => !!lastResult,
    setFading(on) { els.root.classList.toggle("fading", on); },
    clear() {
      lastResult = null;
      els.name.classList.remove("stale");
      els.name.innerHTML = ""; els.sub.textContent = "Play something"; els.roman.textContent = ""; els.alts.innerHTML = "";
    },
    render(result) {
      if (!result) {
        els.name.classList.toggle("stale", !!lastResult);
        if (!lastResult) { els.name.innerHTML = ""; els.sub.textContent = "Play something"; els.roman.textContent = ""; }
        return;
      }
      lastResult = result;
      els.name.classList.remove("stale");

      if (result.kind === "chord") {
        els.name.innerHTML = chordSymbolHtml(result.best.root, result.best.type, result.best.bass);
      } else {
        els.name.textContent = prettyAcc(result.text);
      }
      els.roman.textContent = result.roman || "";
      els.sub.textContent = (result.sub || "").replace(/([A-G])(#{1,2}|b{1,2})/g, (_, l, acc) => l + prettyAcc(acc));
      els.alts.innerHTML = result.alts.map(a => `<span>${esc(prettyAcc(a))}</span>`).join("");
    },
  };
}

/** Chord symbol as HTML: smaller accidentals, raised numeric extensions, muted bass. Styled by .acc, .ext, .bass. */
export function chordSymbolHtml(root: string, type: string, bass = ""): string {
  let html = esc(root[0]) + (root.length > 1 ? `<span class="acc">${prettyAcc(root.slice(1))}</span>` : "");
  // Quality letters stay full size; numeric extensions get raised
  const m = type.match(/^(m(?!aj)|dim|aug|sus\d?|maj|M)?(.*)$/)!;
  const qual = m[1] || "", ext = m[2] || "";
  html += esc(qual);
  if (ext) html += `<span class="ext">${esc(prettyAcc(ext))}</span>`;
  if (bass) html += `<span class="bass">/${esc(bass[0])}${bass.length > 1 ? `<span class="acc">${prettyAcc(bass.slice(1))}</span>` : ""}</span>`;
  return html;
}
