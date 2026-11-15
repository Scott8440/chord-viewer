// localStorage reads and writes that never throw: storage can be unavailable (private windows, blocked site data),
// and then nothing is kept, rather than the page breaking.

/** The saved string, or null when there is none or storage can't be read */
export const loadItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** The saved JSON, or null when there is none, it isn't JSON, or storage can't be read */
export const loadJson = (key: string): unknown => {
  try {
    return JSON.parse(loadItem(key) ?? "null");
  } catch {
    return null;
  }
};

export const saveItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
