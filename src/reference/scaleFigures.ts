// Scale diagrams and tables for the reference pages: a scale on a keyboard with its notes named and the step to each
// note under it, and tables of scales with their formulas, steps and notes. Worked out from scaleFormula.
import type { FormulaTone } from "../theory/chordFormula";
import { scaleFormula, scaleNotes, scaleSteps, stepName } from "../theory/scaleFormula";
import { prettyAcc } from "../theory/spelling";
import { esc } from "../views/html";
import { pianoSvg, type MarkedKey } from "../views/piano";

/** "C major", "F♯ Dorian": the root's letter and the scale's name */
export const scaleTitle = (root: string, name: string) => `${prettyAcc(root.replace(/\d+$/, ""))} ${name}`;

/** The keys of a scale, root and octave in the accent colour, each other note captioned with the step up to it */
function scaleKeys(tones: readonly FormulaTone[], caption: "steps" | "degrees"): MarkedKey[] {
  const steps = scaleSteps(tones);
  return tones.map((t, i) => ({
    midi: t.midi,
    label: t.note,
    caption: caption === "degrees" ? t.degree : i === 0 ? "" : stepName(steps[i - 1]),
    role: t.interval === "1P" || t.interval === "8P" ? "root" : "tone",
  }));
}

/**
 * A scale on a keyboard from its root to the octave: "C major: C D E F G A B, W W H W W W H". Captioned with the step
 * to each note, or with its degree.
 */
export function scaleFigure(
  type: string,
  name: string,
  root = "C4",
  { caption = "steps" as "steps" | "degrees", note = "" } = {},
): string {
  const tones = scaleFormula(type, root);
  const title = scaleTitle(root, name);
  const svg = pianoSvg({
    low: tones[0].midi,
    high: tones[tones.length - 1].midi,
    keys: scaleKeys(tones, caption),
    label: `${title}: ${scaleNotes(tones)}`,
  });
  const detail = caption === "steps" ? scaleSteps(tones).map(stepName).join(" ") : scaleNotes(tones);
  return (
    `<figure class="refFigure">${svg}<figcaption><b>${esc(title)}</b>: ` +
    `${esc(caption === "steps" ? `${scaleNotes(tones)}, ${detail}` : detail)}${note ? ` · ${esc(note)}` : ""}</figcaption></figure>`
  );
}

/** Several scales side by side (they wrap on a narrow screen) */
export const scaleFigures = (...figures: string[]) => `<div class="refFigures">${figures.join("")}</div>`;

export interface ScaleRow {
  type: string;
  name: string;
  root?: string;
  /** Extra columns, after the name, e.g. "on the 2nd degree" */
  extra?: readonly string[];
}

/**
 * Scales as a table: name, a small keyboard (with `keys`), formula, steps and notes; `extra` names columns that each row
 * fills from its own `extra`.
 */
export function scaleTable(
  rows: readonly ScaleRow[],
  { keys = false, extra = [] as readonly string[], first = "Scale" } = {},
): string {
  const body = rows
    .map(r => {
      const root = r.root ?? "C4";
      const tones = scaleFormula(r.type, root);
      const piano = keys
        ? `<td class="keys">${pianoSvg({
            low: tones[0].midi,
            high: tones[tones.length - 1].midi,
            keys: tones.map(t => ({
              midi: t.midi,
              role: t.interval === "1P" || t.interval === "8P" ? "root" : "tone",
            })),
            label: `${scaleTitle(root, r.name)}: ${scaleNotes(tones)}`,
          })}</td>`
        : "";
      return (
        `<tr><td class="sym">${esc(scaleTitle(root, r.name))}</td>${piano}` +
        (r.extra ?? []).map(x => `<td>${esc(x)}</td>`).join("") +
        `<td>${esc(
          tones
            .filter(t => t.interval !== "8P")
            .map(t => t.degree)
            .join(" "),
        )}</td>` +
        `<td>${esc(scaleSteps(tones).map(stepName).join(" "))}</td><td>${esc(scaleNotes(tones))}</td></tr>`
      );
    })
    .join("");
  return (
    `<div class="refTableWrap"><table class="refTable"><thead><tr><th>${esc(first)}</th>${keys ? "<th>Keys</th>" : ""}` +
    extra.map(x => `<th>${esc(x)}</th>`).join("") +
    `<th>Formula</th><th>Steps</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table></div>`
  );
}

/** A plain table from header cells and rows of cells (escaped), with an optional caption above it; `rowKeys` tags
 *  each row with a key, for a page's key picker (src/views/referenceView.ts) to show only that key's rows */
export function simpleTable(
  head: readonly string[],
  rows: readonly (readonly string[])[],
  { firstBold = true, caption = "", rowKeys = [] as readonly string[] } = {},
): string {
  return (
    `<div class="refTableWrap"><table class="refTable">${caption ? `<caption>${esc(caption)}</caption>` : ""}` +
    `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
    rows
      .map(
        (r, n) =>
          `<tr${rowKeys[n] != null ? ` data-key="${esc(rowKeys[n])}"` : ""}>` +
          `${r.map((c, i) => `<td${i === 0 && firstBold ? ' class="sym"' : ""}>${esc(c)}</td>`).join("")}</tr>`,
      )
      .join("") +
    `</tbody></table></div>`
  );
}
