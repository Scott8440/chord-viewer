// Records practice as it happens: modes hand it what finished (a record body), and it stamps the body with an id,
// the time and this device, and stores it. Storing happens in the background; a failure is logged, never shown
// mid-practice.
import { RECORD_VERSION, type ProgressRecord, type RecordBody } from "./records";
import type { ProgressStore } from "./store";

export interface Recorder {
  record(body: RecordBody): void;
  /** Called after each record is stored */
  onRecorded(listener: (record: ProgressRecord) => void): () => void;
}

/** A random UUID (crypto.randomUUID needs a secure context; getRandomValues works everywhere). */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function createRecorder(store: Promise<ProgressStore>, device: string,
                               now: () => number = Date.now, newId: () => string = uuid): Recorder {
  const listeners = new Set<(r: ProgressRecord) => void>();
  return {
    record(body) {
      const record = { ...body, id: newId(), v: RECORD_VERSION, at: now(), device } as ProgressRecord;
      store.then(s => s.add(record)).then(() => listeners.forEach(l => l(record)))
        .catch(e => console.error("Couldn't save practice history", e));
    },
    onRecorded(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** A recorder that keeps nothing (tests of modes that don't care about history) */
export const noRecorder: Recorder = { record() {}, onRecorded: () => () => {} };

/** Converts a performance.now() time to UTC ms */
export const toWallTime = (perfMs: number) => Date.now() - (performance.now() - perfMs);
