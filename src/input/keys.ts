// What every computer-key handler checks first: keys typed into a field, or pressed with a modifier (browser and OS
// shortcuts), are not meant for the app. Each handler decides about key repeats itself, since some still need to
// swallow them.

/** The key is going into a text field or select, or is held with Cmd, Ctrl or Alt */
export function isTypingOrModified(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  return e.metaKey || e.ctrlKey || e.altKey || target.tagName === "INPUT" || target.tagName === "SELECT";
}
