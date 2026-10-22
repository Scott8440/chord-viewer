// Chord name, description, Roman numeral and alternatives.
import { prettyAcc, type Analysis } from "../theory";
import { esc } from "./html";

export interface ChordNameView {
  /** Shows a result; null keeps the last chord visible, faded. */
  render(result: Analysis | null): void;
  /** Forgets the last chord, so silence shows "Play something" again (e.g. after a key change). */
  reset(): void;
}

export function createChordNameView(els: {
  name: HTMLElement; sub: HTMLElement; roman: HTMLElement; alts: HTMLElement;
}): ChordNameView {
  let lastResult: Analysis | null = null;
  return {
    reset() { lastResult = null; },
    render(result) {
      if (!result) {
        els.name.classList.toggle("stale", !!lastResult);
        if (!lastResult) { els.name.innerHTML = ""; els.sub.textContent = "Play something"; els.roman.textContent = ""; }
        return;
      }
      lastResult = result;
      els.name.classList.remove("stale");

      if (result.kind === "chord") {
        const b = result.best;
        const root = esc(b.root[0]) + (b.root.length > 1 ? `<span class="acc">${prettyAcc(b.root.slice(1))}</span>` : "");
        // Quality letters stay full size; numeric extensions get raised
        const m = b.type.match(/^(m(?!aj)|dim|aug|sus\d?|maj|M)?(.*)$/)!;
        const qual = m[1] || "", ext = m[2] || "";
        let html = root + esc(qual);
        if (ext) html += `<span class="ext">${esc(prettyAcc(ext))}</span>`;
        if (b.bass) html += `<span class="bass">/${esc(b.bass[0])}${b.bass.length > 1 ? `<span class="acc">${prettyAcc(b.bass.slice(1))}</span>` : ""}</span>`;
        els.name.innerHTML = html;
      } else {
        els.name.textContent = prettyAcc(result.text);
      }
      els.roman.textContent = result.roman || "";
      els.sub.textContent = (result.sub || "").replace(/([A-G])(#{1,2}|b{1,2})/g, (_, l, acc) => l + prettyAcc(acc));
      els.alts.innerHTML = result.alts.map(a => `<span>${esc(prettyAcc(a))}</span>`).join("");
    },
  };
}
