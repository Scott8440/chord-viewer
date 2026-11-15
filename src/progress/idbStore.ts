// The browser's practice history: IndexedDB, one object store of records keyed by id. Records are stored exactly as
// they are (plain JSON), and read back through `upgradeRecord`, so older records keep working as the schema moves on.
import { upgradeRecord, type ProgressRecord } from "./records";
import { byTime, type OfKind, type ProgressStore } from "./store";

const DB_NAME = "chordDisplay";
/** Bump with an upgrade step in `onupgradeneeded` when the database layout changes */
const DB_VERSION = 2;
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
  open.onupgradeneeded = e => {
    const db = open.result, tx = open.transaction!;
    // Version 1: the records, by id, with an index on time for date ranges later
    if (e.oldVersion < 1) db.createObjectStore(RECORDS, { keyPath: "id" }).createIndex("at", "at");
    // Version 2: an index on kind, so one kind (e.g. rounds) is read without the rest. Added to the existing store,
    // which keeps its records (IndexedDB builds the index from them)
    if (e.oldVersion < 2) tx.objectStore(RECORDS).createIndex("kind", "kind");
  };
  const db = await done(open);
  // A newer version opened in another tab waits until this one lets go: close rather than hold up its upgrade
  // (this tab's later writes then fail and are logged, like any storage failure)
  db.onversionchange = () => db.close();

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
    async ofKind<K extends ProgressRecord["kind"]>(kind: K) {
      const raw = await done(db.transaction(RECORDS).objectStore(RECORDS).index("kind").getAll(kind));
      return raw.map(upgradeRecord).filter((r): r is OfKind<K> => r?.kind === kind).sort(byTime);
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
