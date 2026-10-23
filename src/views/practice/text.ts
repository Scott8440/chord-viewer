// Small text helpers shared by the presenters.

import { prettyAcc } from "../../theory";

/** Pretty accidentals on note names inside prose ("Eb major" -> "E♭ major"), leaving words like "back" alone. */
export const prettyNames = (text: string) => text.replace(/\b([A-G])(#{1,2}|b{1,2})(?![a-z])/g, (_, l, acc) => l + prettyAcc(acc));

export const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "a", "a and b", "a, b and c" */
export const and = (items: string[]) => items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
