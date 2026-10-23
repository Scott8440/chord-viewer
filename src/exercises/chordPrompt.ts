// A chord to play, as the exercises ask for it: a root and chord type, optionally as a Roman numeral in a key and
// with a required inversion. Shared by chord practice, progressions and sequence exercises.

export interface ChordPrompt {
  rootPc: number;
  /** Spelled root, e.g. "Db" */
  root: string;
  /** Chord template id, e.g. "maj7" */
  type: string;
  /** Set when the prompt is a Roman numeral rather than a chord name */
  roman?: RomanPrompt;
  /** Set when a specific inversion is required */
  inversion?: InversionPrompt;
}

export interface InversionPrompt {
  /** 0 = root position, 1 = 1st inversion (3rd in the bass), 2 = 2nd, 3 = 3rd (7th in the bass) */
  number: number;
  /** Spelled bass note, e.g. "E" */
  bass: string;
  bassPc: number;
}

export interface RomanPrompt {
  /** e.g. "V7", "viiø7", "IVmaj7" */
  numeral: string;
  /** Key selector value, e.g. "G:major" */
  keyValue: string;
  /** None of the selected chord types occur in this key, so any diatonic triad was used */
  filterIgnored: boolean;
}

/** How chords are named to the player: chord names or Roman numerals */
export const PROMPT_STYLES = ["names", "roman"] as const;
export type PromptStyle = typeof PROMPT_STYLES[number];
