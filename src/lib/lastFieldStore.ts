import type { GeometricField } from "./fieldData";

/**
 * Remembers the last opened field across page reloads (mobile browsers
 * discard background tabs, and the live preview reloads after losing its
 * connection while the file picker is open). IndexedDB, written once per
 * upload — never on every render.
 */
const DB = "rfa-last-field";
const STORE = "fields";
const KEY = "last";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredField {
  field: GeometricField;
  fileName: string;
}

export async function saveLastField(field: GeometricField, fileName: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ field, fileName } satisfies StoredField, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadLastField(): Promise<StoredField | null> {
  const db = await open();
  const value = await new Promise<StoredField | null>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as StoredField) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}
