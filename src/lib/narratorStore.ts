import type { NarratorItem, NarratorThresholds } from './narrator';
export interface NarratorSession { items: NarratorItem[]; thresholds: NarratorThresholds; limit: number; baseline: boolean }
function openStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('rfa-narrator', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sessions');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
export async function loadNarrator(owner: string): Promise<NarratorSession | null> {
  const db = await openStore();
  try { return await new Promise((resolve, reject) => { const r = db.transaction('sessions').objectStore('sessions').get(owner); r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error); }); }
  finally { db.close(); }
}
export async function saveNarrator(owner: string, session: NarratorSession) {
  const db = await openStore();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('sessions', 'readwrite'); tx.objectStore('sessions').put(session, owner); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}