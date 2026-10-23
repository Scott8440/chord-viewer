// Sizes an element to fill the staff's free top-right corner (see `staffCorner` in staff.ts), following the staff
// as the window resizes. Used for the circle of fifths.
import { staffCorner } from "./staff";

/** Never smaller than this (px), even if a narrow window means overlapping the staff a little */
const MIN_PX = 110;
/** Clear space kept between the element and the notes or the treble staff (px) */
const GAP_PX = 10;

/** Keeps `el` (absolutely positioned at `inset` px from the card's top-right) sized to the corner. Returns stop. */
export function fitToStaffCorner(el: HTMLElement, card: HTMLElement, staffEl: HTMLElement, inset = 12): () => void {
  function fit() {
    const svg = staffEl.querySelector("svg");
    if (!svg) return;
    const s = svg.getBoundingClientRect(), c = card.getBoundingClientRect();
    if (!s.width) return;
    // The drawing is scaled to fit the svg's box and centred in it (a short window letterboxes it)
    const corner = staffCorner(), scale = Math.min(s.width / corner.viewWidth, s.height / corner.viewHeight);
    const left = s.left + (s.width - corner.viewWidth * scale) / 2, top = s.top + (s.height - corner.viewHeight * scale) / 2;
    // Room to the right of the note column, and above the treble staff
    const wide = c.right - inset - (left + corner.left * scale) - GAP_PX;
    const tall = top + corner.bottom * scale - (c.top + inset) - GAP_PX;
    el.style.width = `${Math.round(Math.max(MIN_PX, Math.min(wide, tall)))}px`;
  }
  const observer = new ResizeObserver(fit);
  observer.observe(card);
  // The staff's drawing appears (and is redrawn) after the card is laid out
  const svgWatch = new MutationObserver(() => { if (!el.style.width) fit(); });
  svgWatch.observe(staffEl, { childList: true });
  fit();
  return () => { observer.disconnect(); svgWatch.disconnect(); };
}
