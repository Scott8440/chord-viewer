// The browser's practice history: IndexedDB, one object store of records keyed by id. Records are stored exactly as
// they are (plain JSON), and read back through `upgradeRecord`, so older records keep working as the schema moves on.
import { upgradeRecord, type ProgressRecord } from "./records";
import { byTime, type ProgressStore } from "./store";

const DB_NAME = "chordDisplay";
/** Bump with an upgrade step in `onupgradeneeded` when the database layout changes */
const DB_VERSION = 1;
const RECORDS = "records";

const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const committed = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

/** Opens (creating or upgrading) the history database. Rejects if the browser won't store anything. */
export async function openIdbStore(): Promise<ProgressStore> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB isn't available");
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    // Version 1: the records, by id, with an index on time for date ranges later
    if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: "id" }).createIndex("at", "at");
  };
  const db = await done(open);

  return {
    async add(r) {
      const tx = db.transaction(RECORDS, "readwrite");
      tx.objectStore(RECORDS).put(r);
      await committed(tx);
    },
    async all() {
      const raw = await done(db.transaction(RECORDS).objectStore(RECORDS).getAll());
      return raw.map(upgradeRecord).filter((r): r is ProgressRecord => !!r).sort(byTime);
    },
    async merge(rs) {
      const tx = db.transaction(RECORDS, "readwrite");
      const store = tx.objectStore(RECORDS);
      const have = new Set((await done(store.getAllKeys())).map(String));
      let added = 0;
      for (const r of rs) if (!have.has(r.id)) { store.put(r); have.add(r.id); added++; }
      await committed(tx);
      return added;
    },
    count: () => done(db.transaction(RECORDS).objectStore(RECORDS).count()),
  };
}
