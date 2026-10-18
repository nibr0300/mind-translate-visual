import type { GeometricField } from "./fieldData";

/**
 * Remembers the last opened field (and the open training session) across page
 * reloads: mobile browsers discard or reload background tabs, and the live
 * preview can be reloaded while the file picker is open. IndexedDB, written on
 * explicit user actions — never on every render.
 */
const DB = "rfa-last-field";
const STORE = "fields";
const KEY = "last";
const TRAINING_KEY = "training";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(key: string): Promise<T | null> {
  const db = await open();
  const value = await new Promise<T | null>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

export interface StoredField {
  field: GeometricField;
  fileName: string;
}

export const saveLastField = (field: GeometricField, fileName: string) => put(KEY, { field, fileName } satisfies StoredField);
export const loadLastField = () => get<StoredField>(KEY);

/** Identifies field A so a stored training session is only restored onto the same field. */
export const fieldKey = (field: GeometricField, fileName?: string | null) => `${fileName ?? ""}|${field.units.length}|${field.units[0]?.id ?? ""}`;

export interface StoredTrainingSession {
  fieldKey: string;
  open: boolean;
  cross: boolean;
  fieldB: { field: GeometricField; name: string } | null;
  crossSettings?: Partial<import("./datasetExporter").CrossCorpusSettings>;
}

export const saveTrainingSession = (session: StoredTrainingSession) => put(TRAINING_KEY, session);
export const loadTrainingSession = () => get<StoredTrainingSession>(TRAINING_KEY);
