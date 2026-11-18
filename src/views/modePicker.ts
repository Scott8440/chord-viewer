// The mode picker: the header's Mode button, showing the current mode, opens a nearly full-page panel of square tiles,
// one per mode, grouped in order and tagged with their group, each with an icon, its name and what it's for. Picking one closes it; so do Esc and a click
// outside. DOM only: main dispatches the pick.
import type { ModeId } from "../state/app";
import { esc } from "./html";

interface ModeInfo {
  name: string;
  /** One line on the tile */
  about: string;
  /** SVG contents in a 24×24 box, drawn with the current colour */
  icon: string;
}

/** Every mode's tile (a mode left out doesn't compile) */
export const MODE_INFO: Readonly<Record<ModeId, ModeInfo>> = {
  free: {
    name: "Free play",
    about: "Play anything: the staff and the chord's name follow",
    icon: '<rect x="2.5" y="5" width="19" height="14" rx="1.5"/><path d="M7 5v14M12 5v14M17 5v14"/><path d="M5.5 5v8h2.8V5M10.5 5v8h2.8V5M15.5 5v8h2.8V5" fill="currentColor" stroke="none"/>',
  },
  reading: {
    name: "Sight reading",
    about: "Read a line of music and play it",
    icon: '<path d="M2 7h20M2 11h20M2 15h20M2 19h20" opacity=".45"/><ellipse cx="9" cy="16.5" rx="2.6" ry="1.9" fill="currentColor" stroke="none" transform="rotate(-20 9 16.5)"/><path d="M11.4 15.6V4.5l5 2"/>',
  },
  chords: {
    name: "Chord practice",
    about: "Play the chord you're asked for",
    icon: '<path d="M3 8h18M3 12h18M3 16h18" opacity=".45"/><circle cx="12" cy="17" r="2.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="2.3" fill="currentColor" stroke="none"/>',
  },
  progressions: {
    name: "Progression practice",
    about: "Play common progressions, chord by chord",
    icon: '<rect x="2" y="8" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="8" rx="1"/><rect x="17" y="8" width="5" height="8" rx="1"/><path d="M7 12h2.5M14.5 12H17"/>',
  },
  scales: {
    name: "Scale practice",
    about: "Scales in every key: one hand or both, chromatic too",
    icon: '<path d="M3 20h4v-4h4v-4h4V8h4V4h2"/>',
  },
  diatonic: {
    name: "Diatonic chords",
    about: "Each chord of a key in turn",
    icon: '<text x="12" y="16" text-anchor="middle" font-size="9.5" font-family="Georgia, serif" fill="currentColor" stroke="none">I ii V</text>',
  },
  fiveFinger: {
    name: "Five-finger patterns",
    about: "The first five notes of a key, up and down",
    icon: '<path d="M4 15v-4M8 15V6M12 15V4.5M16 15V6M20 15v-5"/><path d="M3 15c0 4 4 6 9 6s9-2 9-6"/>',
  },
  arpeggios: {
    name: "Arpeggios",
    about: "A chord's notes one at a time, over octaves",
    icon: '<path d="M3 19l4.5-5 4.5-5 4.5-4.5L21 3" opacity=".45"/><circle cx="3.5" cy="19" r="1.8" fill="currentColor" stroke="none"/><circle cx="8" cy="14" r="1.8" fill="currentColor" stroke="none"/><circle cx="12.5" cy="9.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="17" cy="5" r="1.8" fill="currentColor" stroke="none"/>',
  },
  brokenChords: {
    name: "Broken chords",
    about: "A chord's notes in patterns, then together",
    icon: '<circle cx="4" cy="17" r="1.8" fill="currentColor" stroke="none"/><circle cx="8.5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="13" cy="7" r="1.8" fill="currentColor" stroke="none"/><path d="M17 7h4M17 12h4M17 17h4" opacity=".45"/><circle cx="19" cy="7" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="17" r="1.8" fill="currentColor" stroke="none"/>',
  },
  routines: {
    name: "Routines",
    about: "Several exercises in a row, through the keys",
    icon: '<path d="M4 7l1.5 1.5L8 6M4 12.5l1.5 1.5L8 11.5M4 18l1.5 1.5L8 17"/><path d="M11 7.5h9M11 13h9M11 18.5h6"/>',
  },
  ear: {
    name: "Ear training",
    about: "Degrees, melodies, intervals, chords and progressions by ear",
    icon: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="14" width="4.5" height="7" rx="1.5"/><rect x="17" y="14" width="4.5" height="7" rx="1.5"/>',
  },
};

/** The tiles in order, each tagged with its group */
const TILES: readonly { mode: ModeId; group: string }[] = [
  { mode: "free", group: "Play" },
  { mode: "reading", group: "Practice" },
  { mode: "chords", group: "Practice" },
  { mode: "progressions", group: "Practice" },
  { mode: "ear", group: "Ear" },
  { mode: "scales", group: "Technique" },
  { mode: "diatonic", group: "Technique" },
  { mode: "fiveFinger", group: "Technique" },
  { mode: "arpeggios", group: "Technique" },
  { mode: "brokenChords", group: "Technique" },
  { mode: "routines", group: "Technique" },
];

const iconSvg = (id: ModeId) =>
  `<svg class="modeIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" ` +
  `stroke-linecap="round" stroke-linejoin="round">${MODE_INFO[id].icon}</svg>`;

export interface ModePicker {
  /** The current mode, on the button and marked among the tiles */
  render(current: ModeId): void;
}

export function createModePicker(
  dialog: HTMLDialogElement,
  button: HTMLElement,
  pick: (mode: ModeId) => void,
): ModePicker {
  dialog.innerHTML =
    `<div class="mpHead"><h2>Choose a mode</h2><button class="mpClose" aria-label="Close">✕</button></div>` +
    `<div class="mpTiles">` +
    TILES.map(
      ({ mode: id, group }) =>
        `<button class="mpTile" data-mode="${id}"><span class="mpGroup">${esc(group)}</span>${iconSvg(id)}` +
        `<span class="mpName">${esc(MODE_INFO[id].name)}</span><span class="mpAbout">${esc(MODE_INFO[id].about)}</span></button>`,
    ).join("") +
    `</div>`;

  function close() {
    if (dialog.open) dialog.close();
  }
  button.addEventListener("click", () => {
    button.blur(); // so Space stays the pedal
    dialog.showModal();
    // Focus on the current mode, so the keyboard starts there
    dialog.querySelector<HTMLElement>(".mpTile.current")?.focus();
  });
  dialog.addEventListener("click", e => {
    const target = e.target as HTMLElement;
    // A click on the backdrop lands on the dialog itself
    if (target === dialog || target.closest(".mpClose")) return close();
    const tile = target.closest<HTMLElement>(".mpTile");
    if (!tile) return;
    close();
    pick(tile.dataset.mode as ModeId);
  });
  // Nothing in the dialog keeps focus once it's closed: Space stays the pedal
  dialog.addEventListener("close", () => (document.activeElement as HTMLElement | null)?.blur());

  let shown: ModeId | null = null;
  return {
    render(current) {
      if (current === shown) return;
      shown = current;
      button.innerHTML = `${iconSvg(current)}<span>${esc(MODE_INFO[current].name)}</span><span class="mpCaret" aria-hidden="true">▾</span>`;
      button.setAttribute("aria-label", `Mode: ${MODE_INFO[current].name}. Choose another`);
      for (const t of dialog.querySelectorAll<HTMLElement>(".mpTile")) {
        const on = t.dataset.mode === current;
        t.classList.toggle("current", on);
        if (on) t.setAttribute("aria-current", "true");
        else t.removeAttribute("aria-current");
      }
    },
  };
}
