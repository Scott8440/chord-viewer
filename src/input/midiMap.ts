// MIDI mapping: a key on the player's keyboard pressing a control on the page (an answer box, Replay, Next round …).
// Mappings are per mode ("scope"), so a key mapped in chord ear training stays a note everywhere else. Pure.

/** scope (mode id) → control id (its `data-midi-map`) → MIDI note */
export type MidiMap = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * Maps `note` to a control in a scope. A note may press several controls as long as they're never on screen together
 * (Replay, then Next round in its place): `shared(other)` says whether another control already on this note may keep
 * it; any it doesn't allow (by default, all) loses the note. A control has one note.
 */
export function assignNote(
  map: MidiMap,
  scope: string,
  target: string,
  note: number,
  shared: (other: string) => boolean = () => false,
): MidiMap {
  const inScope = Object.fromEntries(
    Object.entries(map[scope] ?? {}).filter(([other, n]) => n !== note || shared(other)),
  );
  return { ...map, [scope]: { ...inScope, [target]: note } };
}

export function clearTarget(map: MidiMap, scope: string, target: string): MidiMap {
  const { [target]: _, ...rest } = map[scope] ?? {};
  return { ...map, [scope]: rest };
}

/** The controls a note presses in a scope (whichever is on screen) */
export const targetsFor = (map: MidiMap, scope: string, note: number): string[] =>
  Object.entries(map[scope] ?? {})
    .filter(([, n]) => n === note)
    .map(([target]) => target);

export const noteFor = (map: MidiMap, scope: string, target: string): number | undefined => map[scope]?.[target];

/** Scopes saved under a mode id that has since been renamed: sight reading was "notes" */
const RENAMED_SCOPES: ReadonlyMap<string, string> = new Map([["notes", "reading"]]);

/** Read back from storage: only whole MIDI notes kept, and a renamed mode's mappings under its new id */
export function sanitizeMidiMap(raw: unknown): MidiMap {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [saved, targets] of Object.entries(raw as Record<string, unknown>)) {
    if (!targets || typeof targets !== "object") continue;
    const scope = RENAMED_SCOPES.get(saved) ?? saved;
    // Mappings saved under the new id win over any left under the old one
    if (scope !== saved && scope in (raw as Record<string, unknown>)) continue;
    const kept = Object.entries(targets as Record<string, unknown>).filter(
      ([, n]) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 127,
    );
    if (kept.length) out[scope] = Object.fromEntries(kept) as Record<string, number>;
  }
  return out;
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
/** "C4" for 60: how a mapped key is labelled on its control */
export const midiNoteName = (note: number) => `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
