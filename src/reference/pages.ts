// The reference section's pages, in the order the sidebar lists them. Each page is an intro and its sections; the
// sidebar lists every page, with the open one's sections under it.
import { CHORD_FORMATION } from "./chordFormation";
import { MODES_PAGE } from "./modes";
import { SCALES } from "./scales";

export interface ReferenceSection {
  /** Anchor, unique on its page */
  id: string;
  title: string;
  /** The section's body as HTML (headings are added from the title) */
  html: string;
}

export interface ReferencePage {
  id: string;
  title: string;
  /** HTML before the first section, if any */
  intro?: string;
  sections: readonly ReferenceSection[];
}

export const REFERENCE_PAGES: readonly ReferencePage[] = [CHORD_FORMATION, SCALES, MODES_PAGE];
