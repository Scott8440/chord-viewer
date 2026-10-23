// Where practice history is kept. Everything goes through this interface, so the app never depends on how it's
// stored: IndexedDB in the browser today (idbStore.ts), and a server could implement the same thing later.
import type { ProgressRecord } from "./records";

export interface ProgressStore {
  /** Adds a record (records are never changed or removed) */
  add(record: ProgressRecord): Promise<void>;
  /** Every record, oldest first */
  all(): Promise<ProgressRecord[]>;
  /** Adds records not already kept (matched by id), e.g. from an import; resolves to how many were new */
  merge(records: readonly ProgressRecord[]): Promise<number>;
  /** How many records are kept */
  count(): Promise<number>;
}

const byTime = (a: ProgressRecord, b: ProgressRecord) => a.at - b.at || (a.id < b.id ? -1 : 1);

/** Kept in memory only: for tests, and when the browser won't store anything. */
export function createMemoryStore(initial: readonly ProgressRecord[] = []): ProgressStore {
  const records = new Map(initial.map(r => [r.id, r]));
  return {
    async add(r) { if (!records.has(r.id)) records.set(r.id, r); },
    async all() { return [...records.values()].sort(byTime); },
    async merge(rs) {
      let added = 0;
      for (const r of rs) if (!records.has(r.id)) { records.set(r.id, r); added++; }
      return added;
    },
    async count() { return records.size; },
  };
}

export { byTime };
